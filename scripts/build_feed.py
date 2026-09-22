"""Build feed.xml, an Atom feed of the changelog's dated rows.

Run with --write to regenerate the feed, or --check to fail when the committed
feed is stale. Entries come from the two changelog tables only, so the feed can
never say more than the page does. The changelog records calendar dates in
Australian Eastern time; each becomes midnight UTC of that date, which needs no
time-zone database and stays the same on every machine.
"""

from __future__ import annotations

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
ROW_PATTERN = re.compile(r"<tr(?:\s+data-feed-id=\"([^\"]+)\")?>(.*?)</tr>", re.S)
CELL_PATTERN = re.compile(r"<td>(.*?)</td>", re.S)
FEED_ID_PATTERN = re.compile(r"^[a-zA-Z0-9._~-]+$")
TAG_PATTERN = re.compile(r"<[^>]+>")
HREF_PATTERN = re.compile(r'href="([^"]+)"')
LEGACY_FEED_IDS = (
    "81a0da48043bb9ed", "62337d3c750b7d10", "ebd4b0433d3efd2b",
    "9afa2945e3d64684", "c5f123a0a4511359", "eaa17f5549b11c83",
    "d194696daf327772", "2ba6f06ab6c1b349", "86ca9fdcc933e430",
    "93a5cfb198beddc8", "c9bd5bb40984d1a6", "3d180c520c89f4f9",
    "9eb90fb829d6c019", "267a6196f3a31919", "76ef72fb170e60e1",
    "9a927bdda93c4af5", "65df8604713dc80d", "684e370a2a97f4b1",
    "0d69e343b0a47aeb", "9bbc75ff0d30494c", "e5f96b3417bc92e6",
    "7813c456323c0d75",
)


def parse_date(text: str) -> date:
    day, month, year = text.split()
    return date(int(year), MONTHS[month], int(day))


def entries(html: str) -> list[tuple[date, str, str, str, str]]:
    """Return (date, title, summary, link, feed ID) for every dated row."""
    found: list[tuple[date, str, str, str, str]] = []
    for row_number, (explicit_id, row) in enumerate(ROW_PATTERN.findall(html)):
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
        if explicit_id and not FEED_ID_PATTERN.fullmatch(explicit_id):
            raise SystemExit(f"changelog: invalid feed ID {explicit_id!r}")
        # Keep the historical ID when rows predate explicit IDs; new rows must
        # use data-feed-id so copy edits cannot change their Atom identity.
        if not explicit_id:
            if row_number >= len(LEGACY_FEED_IDS):
                raise SystemExit("changelog: new row requires data-feed-id")
            feed_id = LEGACY_FEED_IDS[row_number]
        else:
            feed_id = explicit_id
        found.append((when, title, summary, link, feed_id))
    ids = [item[4] for item in found]
    if len(ids) != len(set(ids)):
        raise SystemExit("changelog: duplicate feed ID")
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
        "  <subtitle>Site changes and tagged tool releases for Ryan Duguid's open-source Australian accounting tools.</subtitle>",
        f'  <link href="{SITE}/feed.xml" rel="self" />',
        f'  <link href="{CHANGELOG_URL}" />',
        f"  <id>{CHANGELOG_URL}</id>",
        f"  <updated>{latest}T00:00:00Z</updated>",
        "  <author><name>Ryan Duguid</name></author>",
    ]
    for when, title, summary, link, feed_id in items:
        lines += [
            "  <entry>",
            f"    <title>{escape(title)}</title>",
            f'    <link href="{escape(link)}" />',
            f"    <id>{CHANGELOG_URL}#entry-{escape(feed_id)}</id>",
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
