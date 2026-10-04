"""Write scripts/rates_dataset_extract.json from a checkout of ryanduguid/australian-accounting.

Usage: python scripts/pin_rates_dataset.py <path to an australian-accounting checkout>

The dataset in that repository's packages/au-tax-rates-data is the single home for dated
figures. The site copies only the values its pages state, each pinned to the SHA-256 of
its record file at the checkout's HEAD, and test_fact_check.py holds the rate tables and
question facts to those values. Rerun this after a record changes, then fix whatever page
the tests name.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path

OUTPUT = Path(__file__).resolve().parent / "rates_dataset_extract.json"
DATASET_PATH = "packages/au-tax-rates-data"
RECORDS = (
    "car-limit-2026-27",
    "cents-per-km-2026-27",
    "div7a-benchmark-rate-2026-27",
    "fbt-rate",
    "gst-registration-threshold",
    "instant-asset-write-off-threshold",
    "medicare-levy-rate",
    "resident-tax-rates-2026-27",
    "super-guarantee-rate-2026-27",
)


def git(dataset: Path, *args: str) -> bytes:
    return subprocess.run(
        ["git", "-C", str(dataset), *args], capture_output=True, check=True
    ).stdout


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        print(__doc__.split("\n\n")[1], file=sys.stderr)
        return 2
    checkout = Path(argv[0])
    commit = git(checkout, "rev-parse", "HEAD").decode().strip()
    records = {}
    for name in RECORDS:
        record = f"{DATASET_PATH}/data/{name}.json"
        try:
            # The committed blob, not the working copy, so line endings cannot move the digest.
            raw = git(checkout, "show", f"{commit}:{record}")
        except subprocess.CalledProcessError:
            print(f"{checkout} has no {record} at {commit[:12]}", file=sys.stderr)
            return 1
        records[name] = {
            "sha256": hashlib.sha256(raw).hexdigest(),
            "value": json.loads(raw)["value"],
        }
    document = {
        "source": "ryanduguid/australian-accounting",
        "path": DATASET_PATH,
        "commit": commit,
        "records": records,
    }
    OUTPUT.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(f"pinned {len(records)} records at {commit[:12]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
