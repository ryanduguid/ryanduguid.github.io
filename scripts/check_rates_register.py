"""Check the rates register: shape, provenance, ordering and integrity.

The register at rates/register/ is the site's versioned record of mutable
statutory rates. Its JSON Schema files are the published contract for a
consumer; this script is what keeps the committed files honest, because the
site's checks are standard-library Python and no validator is installed.

Rules enforced here that a schema cannot express:

- `primary_source.url` sits on a primary host. A duguid.com.au page, an engine
  file or a skills index is a cross-check, never the primary source.
- `row_id` is unique within a series, non-superseded rows do not overlap and
  are ordered, and at most one has an open end.
- `verified_at` is not in the future and not before `period_start`.
- A `superseded` row is named by exactly one `supersedes` in the same series.
- `register.json` lists every series file exactly once and nothing else.
- SHA256SUMS covers every file except itself and matches the bytes on disk.
- A row claiming professional review names a person, and a row that does not
  says so rather than implying one.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import re
import sys
import urllib.parse
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
REGISTER_DIR = ROOT / "rates" / "register"
MANIFEST = REGISTER_DIR / "register.json"
SUMS = REGISTER_DIR / "SHA256SUMS"

ADVICE_STATUS = (
    "Not advice. Verify each figure against its primary source at the time of use."
)
PRIMARY_HOSTS = (
    "www.legislation.gov.au",
    "legislation.gov.au",
    "www.ato.gov.au",
    "ato.gov.au",
    "www.rba.gov.au",
    "rba.gov.au",
    "standards.aasb.gov.au",
    "coallsl.com.au",
    "legislation.nsw.gov.au",
    "legislation.qld.gov.au",
    "legislation.vic.gov.au",
    "legislation.wa.gov.au",
    "legislation.sa.gov.au",
    "legislation.tas.gov.au",
    "legislation.act.gov.au",
    "legislation.nt.gov.au",
)
UNITS = {"percent", "fraction", "cents", "aud", "days"}
JURISDICTIONS = {"AU", "AU-NSW", "AU-QLD", "AU-VIC", "AU-WA", "AU-SA", "AU-TAS", "AU-ACT", "AU-NT"}
STATUSES = {"verified", "unverified", "superseded"}
REVIEWS = {"automated-retrieval", "professional-review"}
SLUG = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
DECIMAL = re.compile(r"^-?[0-9]+(\.[0-9]+)?$")
ROW_REQUIRED = (
    "row_id", "period_start", "period_end", "value", "status",
    "review", "primary_source", "verified_at", "verified_by",
)


def _date(value: str, where: str, failures: list[str]) -> dt.date | None:
    if not isinstance(value, str) or not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", value):
        failures.append(f"{where}: {value!r} is not a YYYY-MM-DD date")
        return None
    try:
        return dt.date.fromisoformat(value)
    except ValueError:
        failures.append(f"{where}: {value!r} is not a real calendar date")
        return None


def _https_host(url: str, where: str, failures: list[str], *, primary: bool) -> None:
    """Check a URL's scheme and, for a primary source, its host.

    The host is read with `urlsplit`, not by splitting on "/". A browser and
    anything using WHATWG parsing treat a backslash in an https URL as a path
    delimiter, so `https://evil.example\\@good.example/x` has the authority
    `evil.example` there while a naive split reads `good.example`. Rather than
    reimplement that rule, any backslash is refused outright: no legitimate
    source URL in this register needs one, and a URL that two parsers read
    differently has no place in a provenance record.
    """
    if not isinstance(url, str) or not url.startswith("https://"):
        failures.append(f"{where}: {url!r} must be an https URL")
        return
    if "\\" in url:
        failures.append(
            f"{where}: {url!r} contains a backslash. A backslash is a path delimiter to a "
            "browser and an ordinary character to some parsers, so the host is ambiguous."
        )
        return
    parts = urllib.parse.urlsplit(url)
    if parts.username or parts.password:
        failures.append(f"{where}: {url!r} carries credentials in the authority")
        return
    try:
        host = (parts.hostname or "").lower()
    except ValueError as exc:
        failures.append(f"{where}: {url!r} has an unreadable authority ({exc})")
        return
    if not host:
        failures.append(f"{where}: {url!r} has no host")
        return
    if primary and host not in PRIMARY_HOSTS:
        failures.append(
            f"{where}: {host} is not a primary source host. A site page, engine file or "
            "skills index belongs in cross_checks."
        )


def check_row(row: Any, series_id: str, today: dt.date, failures: list[str]) -> None:
    where = f"{series_id}: a row"
    if not isinstance(row, dict):
        failures.append(f"{where} is not an object")
        return
    missing = [key for key in ROW_REQUIRED if key not in row]
    if missing:
        failures.append(f"{where}: missing {', '.join(missing)}")
        return
    row_id = row["row_id"]
    where = f"{series_id}/{row_id}"
    if not isinstance(row_id, str) or not SLUG.fullmatch(row_id):
        failures.append(f"{where}: row_id is not a slug")
    if row["status"] not in STATUSES:
        failures.append(f"{where}: status {row['status']!r} is not one of {sorted(STATUSES)}")
    if row["review"] not in REVIEWS:
        failures.append(f"{where}: review {row['review']!r} is not one of {sorted(REVIEWS)}")
    if not isinstance(row["value"], str) or not DECIMAL.fullmatch(row["value"]):
        failures.append(f"{where}: value must be a decimal string, not {row['value']!r}")

    start = _date(row["period_start"], f"{where}.period_start", failures)
    end = None
    if row["period_end"] is not None:
        end = _date(row["period_end"], f"{where}.period_end", failures)
        if start and end and end < start:
            failures.append(f"{where}: period_end precedes period_start")

    source = row["primary_source"]
    if not isinstance(source, dict) or not {"title", "url", "publisher"} <= set(source):
        failures.append(f"{where}: primary_source needs title, url and publisher")
    else:
        _https_host(source["url"], f"{where}.primary_source.url", failures, primary=True)
    for index, url in enumerate(row.get("cross_checks", [])):
        _https_host(url, f"{where}.cross_checks[{index}]", failures, primary=False)

    if row["status"] == "unverified":
        if row["verified_at"] is not None or row["verified_by"] is not None:
            failures.append(f"{where}: an unverified row must not carry a verification")
        if not row.get("verification_note"):
            failures.append(f"{where}: an unverified row needs a verification_note saying why")
    else:
        verified = _date(row["verified_at"], f"{where}.verified_at", failures)
        if verified:
            if verified > today:
                failures.append(f"{where}: verified_at {row['verified_at']} is in the future")
            if start and verified < start:
                failures.append(
                    f"{where}: verified_at {row['verified_at']} precedes period_start "
                    f"{row['period_start']}; the instrument was not yet in force"
                )
        if not isinstance(row["verified_by"], str) or not row["verified_by"].strip():
            failures.append(f"{where}: verified_by must name who or what checked the figure")
        elif row["review"] == "professional-review" and "automated" in row["verified_by"].lower():
            failures.append(
                f"{where}: review is professional-review but verified_by describes an "
                "automated retrieval. Automated retrieval is not professional review."
            )


def check_series(path: Path, failures: list[str], today: dt.date) -> str | None:
    try:
        series = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        failures.append(f"{path.name}: unreadable ({exc})")
        return None
    name = path.name
    if series.get("schema_version") != 1:
        failures.append(f"{name}: schema_version must be 1")
    series_id = series.get("series_id", "")
    if not SLUG.fullmatch(str(series_id)):
        failures.append(f"{name}: series_id {series_id!r} is not a slug")
    if f"{series_id}.json" != name:
        failures.append(f"{name}: file name must match series_id {series_id!r}")
    if series.get("unit") not in UNITS:
        failures.append(f"{name}: unit {series.get('unit')!r} is not one of {sorted(UNITS)}")
    if series.get("jurisdiction") not in JURISDICTIONS:
        failures.append(f"{name}: jurisdiction {series.get('jurisdiction')!r} is not recognised")
    if series.get("advice_status") != ADVICE_STATUS:
        failures.append(f"{name}: advice_status must be the fixed sentence")
    basis = series.get("basis")
    if not isinstance(basis, dict) or not {"instrument", "provision"} <= set(basis):
        failures.append(f"{name}: basis needs instrument and provision")
    elif "url" in basis:
        _https_host(basis["url"], f"{name}.basis.url", failures, primary=True)

    rows = series.get("rows")
    if not isinstance(rows, list) or not rows:
        failures.append(f"{name}: rows must be a non-empty array")
        return series_id or None

    seen: set[str] = set()
    for row in rows:
        check_row(row, str(series_id), today, failures)
        row_id = row.get("row_id") if isinstance(row, dict) else None
        if isinstance(row_id, str):
            if row_id in seen:
                failures.append(f"{series_id}: duplicate row_id {row_id!r}")
            seen.add(row_id)

    live = [row for row in rows if isinstance(row, dict) and row.get("status") != "superseded"]
    open_ended = [row for row in live if row.get("period_end") is None]
    if len(open_ended) > 1:
        failures.append(f"{series_id}: {len(open_ended)} rows have an open period_end; at most 1 may")
    ordered = sorted(live, key=lambda row: str(row.get("period_start")))
    if [row.get("row_id") for row in live] != [row.get("row_id") for row in ordered]:
        failures.append(f"{series_id}: rows are not ordered by period_start")
    for earlier, later in zip(ordered, ordered[1:]):
        end = earlier.get("period_end")
        if end is None or str(end) >= str(later.get("period_start")):
            failures.append(
                f"{series_id}: rows {earlier.get('row_id')} and {later.get('row_id')} overlap"
            )
    # A correction is one live row naming one superseded row. Each half of that
    # is checked, because each half failing on its own is a legible-looking
    # register that is not legible: a row that supersedes itself drops out of
    # every consumer's verified set while passing the check, and a single-row
    # series doing it takes the whole series with it.
    by_id = {row["row_id"]: row for row in rows if isinstance(row, dict) and "row_id" in row}
    namers: dict[str, list[str]] = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        target = row.get("supersedes")
        if target is None:
            continue
        row_id = str(row.get("row_id"))
        if target not in seen:
            failures.append(f"{series_id}/{row_id}: supersedes unknown row {target!r}")
            continue
        if target == row_id:
            failures.append(f"{series_id}/{row_id}: supersedes itself")
            continue
        if by_id[target].get("status") != "superseded":
            failures.append(
                f"{series_id}/{row_id}: supersedes {target}, whose status is "
                f"{by_id[target].get('status')!r} rather than 'superseded'"
            )
        if row.get("status") == "superseded":
            failures.append(
                f"{series_id}/{row_id}: a superseded row cannot itself supersede {target}"
            )
        namers.setdefault(str(target), []).append(row_id)
    for target, rows_naming in sorted(namers.items()):
        if len(rows_naming) > 1:
            failures.append(
                f"{series_id}/{target}: named by {len(rows_naming)} rows "
                f"({', '.join(sorted(rows_naming))}); exactly one replacement may name it"
            )
    superseded = {
        row["row_id"] for row in rows
        if isinstance(row, dict) and row.get("status") == "superseded"
    }
    for orphan in sorted(superseded - set(namers)):
        failures.append(
            f"{series_id}/{orphan}: status is superseded but no row names it in supersedes"
        )
    return str(series_id)


def check_sums(failures: list[str]) -> None:
    if not SUMS.is_file():
        failures.append("SHA256SUMS is missing")
        return
    listed: dict[str, str] = {}
    for line in SUMS.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        digest, _, name = line.partition("  ")
        if not re.fullmatch(r"[0-9a-f]{64}", digest) or not name:
            failures.append(f"SHA256SUMS: malformed line {line!r}")
            continue
        listed[name] = digest
    # Only the register's own SHA256SUMS is exempt. A second file of that name
    # further down would otherwise be neither hashed nor listed, and would
    # still be published.
    on_disk = {
        path.relative_to(REGISTER_DIR).as_posix()
        for path in REGISTER_DIR.rglob("*")
        if path.is_file() and path != SUMS
    }
    for missing in sorted(on_disk - set(listed)):
        failures.append(f"SHA256SUMS: {missing} is not listed")
    for extra in sorted(set(listed) - on_disk):
        failures.append(f"SHA256SUMS: lists {extra}, which is not in the register")
    for name in sorted(on_disk & set(listed)):
        digest = hashlib.sha256((REGISTER_DIR / name).read_bytes()).hexdigest()
        if digest != listed[name]:
            failures.append(f"SHA256SUMS: {name} digest does not match the file")


def check_register(today: dt.date | None = None) -> list[str]:
    today = today or dt.date.today()
    failures: list[str] = []
    if not MANIFEST.is_file():
        return [f"{MANIFEST} is missing"]
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if manifest.get("schema_version") != 1:
        failures.append("register.json: schema_version must be 1")
    if not re.fullmatch(r"[0-9]{4}\.[0-9]{2}\.[0-9]{2}(\.[1-9][0-9]*)?", str(manifest.get("register_version"))):
        failures.append(f"register.json: register_version {manifest.get('register_version')!r} is malformed")
    if manifest.get("advice_status") != ADVICE_STATUS:
        failures.append("register.json: advice_status must be the fixed sentence")

    declared = manifest.get("series", [])
    # rglob, not glob: a file under series/ that the manifest does not list is
    # published either way, and an unvalidated series in a subdirectory is
    # exactly the thing the manifest is supposed to rule out.
    on_disk = sorted(
        path.relative_to(REGISTER_DIR).as_posix()
        for path in (REGISTER_DIR / "series").rglob("*.json")
    )
    if sorted(declared) != on_disk:
        failures.append(
            f"register.json: series list {sorted(declared)} does not match the files {on_disk}"
        )
    for name in on_disk:
        check_series(REGISTER_DIR / name, failures, today)

    for schema_name in ("rates-register.schema.json", "register.schema.json"):
        path = REGISTER_DIR / "schema" / schema_name
        if not path.is_file():
            failures.append(f"schema/{schema_name} is missing")
            continue
        try:
            schema = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            failures.append(f"schema/{schema_name}: not valid JSON ({exc})")
            continue
        if not str(schema.get("$id", "")).startswith("https://duguid.com.au/rates/register/schema/"):
            failures.append(f"schema/{schema_name}: $id must be its published URL")

    check_sums(failures)
    return failures


def main() -> int:
    failures = check_register()
    for failure in failures:
        print(f"rates register: {failure}")
    if failures:
        return 1
    print("rates register: checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
