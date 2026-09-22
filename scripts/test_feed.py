"""Keep published Atom identities stable through editorial changes."""

from __future__ import annotations

import unittest
from xml.etree import ElementTree

import build_feed

NS = {"a": "http://www.w3.org/2005/Atom"}


def feed_entries(source: str) -> dict[str, str | None]:
    tree = ElementTree.fromstring(build_feed.build(source))
    return {
        entry.findtext("a:id", default="", namespaces=NS): entry.findtext("a:title", namespaces=NS)
        for entry in tree.findall("a:entry", NS)
    }


class FeedTests(unittest.TestCase):
    def test_edit_keeps_published_identity_when_rows_move(self) -> None:
        original = "<tr><td>31 August 2026</td><td>An open-source index.</td></tr>"
        identifier = next(iter(feed_entries(original)))
        digest = identifier.rsplit("entry-", 1)[1]
        edited = (
            f'<tr data-feed-id="{digest}"><td>31 August 2026</td>'
            "<td>An open source index.</td></tr>"
        )
        newer = "<tr><td>22 September 2026</td><td>A new entry.</td></tr>"
        for source in (edited + newer, newer + edited):
            with self.subTest(source=source):
                result = feed_entries(source)
                self.assertEqual(result[identifier], "An open source index.")
                self.assertEqual(len(result), 2)

    def test_duplicate_ids_are_rejected(self) -> None:
        row = '<tr data-feed-id="0123456789abcdef"><td>22 September 2026</td><td>Copy</td></tr>'
        with self.assertRaisesRegex(SystemExit, "duplicate feed ID"):
            build_feed.build(row + row.replace("Copy", "Different copy"))

    def test_invalid_ids_are_rejected(self) -> None:
        for attributes in ('data-feed-id=""', 'data-feed-id="wrong"', "data-feed-id='abc'"):
            with (
                self.subTest(attributes=attributes),
                self.assertRaisesRegex(SystemExit, "data-feed-id must be"),
            ):
                build_feed.build(f"<tr {attributes}><td>22 September 2026</td><td>Copy</td></tr>")

    def test_edited_site_entries_retain_their_original_ids(self) -> None:
        result = feed_entries(build_feed.SOURCE.read_text(encoding="utf-8"))
        for digest in ("3218d72411b9fdd7", "eb0f892af8afe17a"):
            self.assertIn(f"{build_feed.CHANGELOG_URL}#entry-{digest}", result)


if __name__ == "__main__":
    unittest.main()
