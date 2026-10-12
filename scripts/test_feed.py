"""Keep published Atom identities stable through editorial changes."""

from __future__ import annotations

import hashlib
import unittest
from pathlib import Path
from unittest import mock
from xml.etree import ElementTree

import build_feed
import fuzz_feed

NS = {"a": "http://www.w3.org/2005/Atom"}
FUZZ_CORPUS = Path(__file__).resolve().parent / "fuzz-corpus" / "feed"


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

    def test_explicit_ids_accept_both_quote_styles(self) -> None:
        for quote in ('"', "'"):
            with self.subTest(quote=quote):
                result = feed_entries(
                    f"<tr data-feed-id = {quote}0123456789abcdef{quote}>"
                    "<td>22 September 2026</td><td>Copy</td></tr>"
                )
                self.assertIn(f"{build_feed.CHANGELOG_URL}#entry-0123456789abcdef", result)

    def test_invalid_ids_are_rejected(self) -> None:
        for attributes in ('data-feed-id=""', 'data-feed-id="wrong"', "data-feed-id='abc'"):
            with (
                self.subTest(attributes=attributes),
                self.assertRaisesRegex(SystemExit, "data-feed-id must be"),
            ):
                build_feed.build(f"<tr {attributes}><td>22 September 2026</td><td>Copy</td></tr>")

    def test_a_release_link_with_a_quote_stays_well_formed(self) -> None:
        tree = ElementTree.fromstring(
            build_feed.build(
                '<tr><th scope="row">1 May 2026</th><td>Tool</td>'
                '<td><a href="https://example.test/?q=&quot;v1&quot;">v1</a></td></tr>'
            )
        )
        link = tree.find("a:entry/a:link", NS)
        href = None if link is None else link.get("href")
        self.assertEqual(href, 'https://example.test/?q="v1"')

    def test_a_control_character_is_refused(self) -> None:
        with self.assertRaisesRegex(SystemExit, "control character"):
            build_feed.build("<tr><td>1 May 2026</td><td>Copy\x00</td></tr>")

    def test_an_unreadable_date_names_the_cell(self) -> None:
        for cell in ("soon", "31 Smarch 2026", "31 February 2026", "1 May 99999999999999999999"):
            with (
                self.subTest(cell=cell),
                self.assertRaisesRegex(SystemExit, f"unreadable date '{cell}'"),
            ):
                build_feed.build(f"<tr><td>{cell}</td><td>Copy</td></tr>")

    def test_the_fuzz_seed_corpus_replays_cleanly(self) -> None:
        seeds = sorted(FUZZ_CORPUS.iterdir())
        self.assertGreater(len(seeds), 0)
        for seed in seeds:
            with self.subTest(seed=seed.name):
                fuzz_feed.test_one_input(seed.read_bytes())

    def test_the_fuzz_harness_rejects_a_refusal_naming_no_changelog(self) -> None:
        with (
            mock.patch.object(build_feed, "build", side_effect=SystemExit("other")),
            self.assertRaisesRegex(AssertionError, "unexpected refusal 'other'"),
        ):
            fuzz_feed.test_one_input(b"x")

    def test_long_titles_end_on_a_whole_word_and_keep_their_ids(self) -> None:
        summary = (
            "The Evidence page links the supplier information each component that works "
            "with an AI register needs."
        )
        ((identifier, title),) = feed_entries(
            f"<tr><td>29 September 2026</td><td>{summary}</td></tr>"
        ).items()
        self.assertEqual(
            title,
            "The Evidence page links the supplier information each component that works with…",
        )
        launch_title = summary[:77].rstrip() + "..."
        digest = hashlib.sha256(f"2026-09-29|{launch_title}".encode()).hexdigest()[:16]
        self.assertEqual(identifier, f"{build_feed.CHANGELOG_URL}#entry-{digest}")

    def test_a_first_word_too_long_for_the_title_is_cut(self) -> None:
        self.assertEqual(build_feed.headline("x" * 79 + " next"), "x" * 79 + "…")
        self.assertEqual(build_feed.headline("x" * 80 + " next"), "x" * 79 + "…")
        self.assertEqual(build_feed.headline("x" * 81), "x" * 79 + "…")

    def test_edited_site_entries_retain_their_original_ids(self) -> None:
        result = feed_entries(build_feed.SOURCE.read_text(encoding="utf-8"))
        for digest in ("3218d72411b9fdd7", "eb0f892af8afe17a"):
            self.assertIn(f"{build_feed.CHANGELOG_URL}#entry-{digest}", result)


if __name__ == "__main__":
    unittest.main()
