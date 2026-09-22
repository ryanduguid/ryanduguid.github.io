"""Build feed.xml, an Atom feed of the changelog's dated rows.

Run with --write to regenerate the feed, or --check to fail when the committed
feed is stale. Entries come from the two changelog tables only, so the feed can
never say more than the page does. The changelog records calendar dates in
Australian Eastern time; each becomes midnight UTC of that date, which needs no
time-zone database and stays the same on every machine.
"""

from __future__ import annotations

import hashlib
import html as html_lib
import re
import sys
from datetime import date
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "changelog" / "index.html"
OUTPUT = ROOT / "feed.xml"
SITE = "https://duguid.com.au"
CHANGELOG_URL = f"{SITE}/changelog/"
MONTHS = {
    name: number
    for number, name in enumerate(
        (
            "January",
            "February",
            "March",
            "April",
            "May",
            "June",
            "July",
            "August",
            "September",
            "October",
            "November",
            "December",
        ),
        start=1,
    )
}
ROW_PATTERN = re.compile(r"<tr\b([^>]*)>(.*?)</tr>", re.S)
FEED_ID_PATTERN = re.compile(r'\bdata-feed-id="([^"]*)"')
CELL_PATTERN = re.compile(r"<td>(.*?)</td>", re.S)
TAG_PATTERN = re.compile(r"<[^>]+>")
HREF_PATTERN = re.compile(r'href="([^"]+)"')


def parse_date(text: str) -> date:
    day, month, year = text.split()
    return date(int(year), MONTHS[month], int(day))


def entries(html: str) -> list[tuple[date, str, str, str, str]]:
    """Return (date, title, summary, link, feed ID) for each dated row."""
    found: list[tuple[date, str, str, str, str]] = []
    identifiers: set[str] = set()
    for attributes, row in ROW_PATTERN.findall(html):
        cells = CELL_PATTERN.findall(row)
        if not cells:
            continue  # header row
        when = parse_date(html_lib.unescape(TAG_PATTERN.sub("", cells[0])).strip())
        if len(cells) == 2:
            summary = html_lib.unescape(TAG_PATTERN.sub("", cells[1])).strip()
            title = summary if len(summary) <= 80 else summary[:77].rstrip() + "..."
            link = CHANGELOG_URL + "#site-changes"
        elif len(cells) == 3:
            tool = html_lib.unescape(TAG_PATTERN.sub("", cells[1])).strip()
            release = html_lib.unescape(TAG_PATTERN.sub("", cells[2])).strip()
            href = HREF_PATTERN.search(cells[2])
            title = f"{tool} {release}"
            summary = f"{tool}: release {release}."
            link = html_lib.unescape(href.group(1)) if href else CHANGELOG_URL + "#tool-releases"
        else:
            raise SystemExit(f"changelog: unexpected row with {len(cells)} cells")
        explicit_id = FEED_ID_PATTERN.search(attributes)
        if "data-feed-id" in attributes and (
            explicit_id is None or not re.fullmatch(r"[0-9a-f]{16}", explicit_id.group(1))
        ):
            raise SystemExit("changelog: data-feed-id must be 16 lowercase hexadecimal characters")
        # Published entries can keep their original identity when their copy changes.
        digest = (
            explicit_id.group(1)
            if explicit_id
            else hashlib.sha256(f"{when.isoformat()}|{title}".encode()).hexdigest()[:16]
        )
        if digest in identifiers:
            raise SystemExit(f"changelog: duplicate feed ID {digest}")
        identifiers.add(digest)
        found.append((when, title, summary, link, digest))
    found.sort(key=lambda item: item[0], reverse=True)
    return found


def build(html: str) -> str:
    items = entries(html)
    if not items:
        raise SystemExit("changelog: no dated rows found")
    latest = items[0][0].isoformat()
    lines = [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<feed xmlns="http://www.w3.org/2005/Atom">',
        "  <title>duguid.com.au changelog</title>",
        "  <subtitle>Site changes and tagged tool releases for Ryan Duguid's open source Australian accounting tools.</subtitle>",
        f'  <link href="{SITE}/feed.xml" rel="self" />',
        f'  <link href="{CHANGELOG_URL}" />',
        f"  <id>{CHANGELOG_URL}</id>",
        f"  <updated>{latest}T00:00:00Z</updated>",
        "  <author><name>Ryan Duguid</name></author>",
    ]
    for when, title, summary, link, digest in items:
        lines += [
            "  <entry>",
            f"    <title>{escape(title)}</title>",
            f'    <link href="{escape(link)}" />',
            f"    <id>{CHANGELOG_URL}#entry-{digest}</id>",
            f"    <updated>{when.isoformat()}T00:00:00Z</updated>",
            f"    <summary>{escape(summary)}</summary>",
            "  </entry>",
        ]
    lines.append("</feed>")
    return "\n".join(lines) + "\n"


def main(argv: list[str]) -> int:
    feed = build(SOURCE.read_text(encoding="utf-8"))
    if "--write" in argv:
        OUTPUT.write_text(feed, encoding="utf-8", newline="\n")
        print(f"wrote {OUTPUT.relative_to(ROOT).as_posix()}")
        return 0
    if "--check" in argv:
        if not OUTPUT.is_file() or OUTPUT.read_text(encoding="utf-8") != feed:
            print("feed.xml is stale: run python scripts/build_feed.py --write")
            return 1
        print("feed.xml is current")
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
