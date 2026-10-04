"""Check when CI may omit live requests without omitting link-change validation."""

import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import check_site


class LiveLinkSelectionTests(unittest.TestCase):
    def merge_decision(
        self,
        before: str,
        after: str,
        path: str = "index.html",
        other: tuple[str, str] | None = None,
    ) -> bool:
        """Exercise the actual merge-parent comparison without changing the checkout."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)

            def git(*arguments: str) -> None:
                subprocess.run(
                    [
                        "git",
                        "-c",
                        "user.name=Fixture",
                        "-c",
                        "user.email=fixture@example.invalid",
                        "-c",
                        "commit.gpgSign=false",
                        "-c",
                        "core.autocrlf=false",
                        "-c",
                        f"core.hooksPath={root / 'unused-hooks'}",
                        *arguments,
                    ],
                    cwd=root,
                    capture_output=True,
                    text=True,
                    check=True,
                )

            git("init", "-q", "-b", "main")
            page = root / path
            page.parent.mkdir(parents=True, exist_ok=True)
            page.write_text(before, encoding="utf-8")
            if other:
                (root / "other.html").write_text(other[0], encoding="utf-8")
            git("add", ".")
            git("commit", "-qm", "base fixture")
            git("checkout", "-qb", "candidate")
            page.write_text(after, encoding="utf-8")
            if other:
                (root / "other.html").write_text(other[1], encoding="utf-8")
            git("add", ".")
            git("commit", "-qm", "changed fixture")
            git("checkout", "-q", "main")
            (root / "base-note.txt").write_text("Unrelated base commit", encoding="utf-8")
            git("add", ".")
            git("commit", "-qm", "advanced base fixture")
            git("merge", "--no-ff", "-qm", "merge fixture", "candidate")
            with (
                patch.object(check_site, "ROOT", root),
                patch.dict(check_site.os.environ, {"CI_EVENT": "pull_request"}),
            ):
                return check_site.ci_offline()

    def test_real_page_wording_only_merges_use_offline_checks(self) -> None:
        for path in ("about/index.html", "evidence/index.html", "tools/index.html", "index.html"):
            with self.subTest(path=path):
                source = (check_site.ROOT / path).read_text(encoding="utf-8")
                # CI compares source pages; rendered pages would hide their Liquid.
                self.assertIn("{% include site-header.html %}", source)
                self.assertIn("{{ site.asset_version }}", source)
                self.assertIn("</p>", source)
                self.assertIn("href=", source)
                changed = source.replace("</p>", " Updated wording.</p>", 1)
                self.assertTrue(self.merge_decision(source, changed, path))

    def test_real_merges_that_can_change_links_keep_live_checks(self) -> None:
        for path, before, after in (
            (
                "index.html",
                '<a href="https://example.com/old">Source</a>',
                '<a href="https://example.com/new">Source</a>',
            ),
            ("index.html", '<a href="\nold\n">Source</a>', '<a href="\nnew\n">Source</a>'),
            (
                "assets/site.css",
                "body { background: url(\nold\n); }",
                "body { background: url(\nnew\n); }",
            ),
            (
                "index.html",
                "---\nlayout: old\n---\n<p>Text</p>",
                "---\nlayout: new\n---\n<p>Text</p>",
            ),
            ("index.html", "<p>{{ site.old }}</p>", "<p>{{ site.new }}</p>"),
            ("assets/navigation.mjs", 'const path = "old";', 'const path = "new";'),
            ("index.html", '<p><img src="\nold\n">Text</p>', '<p><img src="\nnew\n">Text</p>'),
            ("index.html", "<p>https://example.com/old</p>", "<p>https://example.com/new</p>"),
            (
                "index.html",
                "<style>body { background: u\\72l(\nold\n); }</style>",
                "<style>body { background: u\\72l(\nnew\n); }</style>",
            ),
            (
                "index.html",
                '<style>@import "\nold\n";</style>',
                '<style>@import "\nnew\n";</style>',
            ),
            (
                "index.html",
                '{% capture target %}<p>old</p>{% endcapture %}<a href="{{ target }}">Link</a>',
                '{% capture target %}<p>new</p>{% endcapture %}<a href="{{ target }}">Link</a>',
            ),
            (
                "index.html",
                "---\nvalue: '<p>old</p>'\n---\n<p>Text</p>",
                "---\nvalue: '<p>new</p>'\n---\n<p>Text</p>",
            ),
            ("index.html", "<p><div>old</div></p>", "<p><div>new</div></p>"),
            ("index.html", "<p>old", "<p>new"),
            ("index.html", "<template/><p>old</p>", "<template/><p>new</p>"),
            (
                "index.html",
                '<script>const value = "<p>old</p>";</script>',
                '<script>const value = "<p>new</p>";</script>',
            ),
            ("index.html", "<textarea><p>old</p></textarea>", "<textarea><p>new</p></textarea>"),
            ("index.html", "<template><p>old</p></template>", "<template><p>new</p></template>"),
            (
                "index.html",
                "{% include unknown.html %}<p>old</p>",
                "{% include unknown.html %}<p>new</p>",
            ),
            (
                "index.html",
                "\ufeff---\nvalue: '<p>old</p>'\n---\n<p>Text</p>",
                "\ufeff---\nvalue: '<p>new</p>'\n---\n<p>Text</p>",
            ),
            # Only the exact asset version expression, unchanged, is accepted.
            *(
                (
                    "index.html",
                    f'<link href="/a.css?v={old}"><p>old</p>',
                    f'<link href="/a.css?v={new}"><p>new</p>',
                )
                for old, new in (
                    ("{{ site.asset_version }}", "{{ site.other }}"),
                    ("{{ site.asset_version }}", ""),
                    ("", "{{ site.asset_version }}"),
                    ("{{site.asset_version}}", "{{site.asset_version}}"),
                    ("{{ site.asset_version | escape }}", "{{ site.asset_version | escape }}"),
                    ("{{{ site.asset_version }}}", "{{{ site.asset_version }}}"),
                    ("{{ site.asset_version }}{{ x }}", "{{ site.asset_version }}{{ x }}"),
                )
            ),
        ):
            with self.subTest(path=path, before=before):
                if path.endswith(".html"):
                    before += '\n<a href="/unchanged">Context</a>'
                    after += '\n<a href="/unchanged">Context</a>'
                self.assertFalse(self.merge_decision(before, after, path))

    def test_mixed_files_require_every_change_to_be_prose(self) -> None:
        self.assertTrue(
            self.merge_decision("<p>old</p>", "<p>new</p>", other=("<p>first</p>", "<p>second</p>"))
        )
        self.assertFalse(
            self.merge_decision(
                "<p>old</p>",
                "<p>new</p>",
                other=('<a href="\nold\n">Link</a>', '<a href="\nnew\n">Link</a>'),
            )
        )

    def test_failed_diff_or_blob_reads_keep_live_checks(self) -> None:
        names = subprocess.CompletedProcess(["git"], 0, "index.html\0", "")
        diff = subprocess.CompletedProcess(["git"], 0, ' href="unchanged"', "")
        blob = subprocess.CompletedProcess(["git"], 0, "<p>old</p>", "")
        for completed in ([names], [names, diff], [names, diff, blob]):
            with (
                self.subTest(read=len(completed)),
                patch.dict(check_site.os.environ, {"CI_EVENT": "pull_request"}),
                patch.object(
                    check_site.subprocess,
                    "run",
                    side_effect=[*completed, subprocess.CalledProcessError(1, "git")],
                ),
            ):
                self.assertFalse(check_site.ci_offline())

    def test_prose_only_pull_request_uses_offline_checks(self) -> None:
        self.assertTrue(
            check_site.can_skip_live_links(
                "pull_request", ["about/index.html"], "+<p>Updated wording.</p>"
            )
        )

    def test_changed_links_keep_live_checks(self) -> None:
        for diff in (
            '+<a href="https://example.com/new">Source</a>',
            "-[Source](https://example.com/old)",
            '+<a href="{{ site.source }}/new">Source</a>',
            "+background: url(https://example.com/image.png)",
            "+https://example.com/new",
            ' <a href="\n-old\n+new\n ">Source</a>',
            " background: url(\n-old\n+new\n );",
            "+{{ site.source }}",
            '+@import "theme.css";',
            r'+background: u\72l("image.png");',
            " ---\n layout: default\n-slug: old\n+slug: new\n ---",
            '+<img src="//example.com/image.png">',
        ):
            with self.subTest(diff=diff):
                self.assertFalse(
                    check_site.can_skip_live_links("pull_request", ["index.html"], diff)
                )

    def test_dynamic_or_unknown_sources_keep_live_checks(self) -> None:
        for path in (
            "scripts/build_site.py",
            "_includes/header.html",
            "_layouts/default.html",
            "_config.yml",
            "assets/navigation.mjs",
            "data/links.json",
        ):
            self.assertFalse(check_site.can_skip_live_links("pull_request", [path], "+changed"))

    def test_other_events_keep_live_checks(self) -> None:
        for event in ("push", "schedule", "workflow_dispatch", ""):
            self.assertFalse(check_site.can_skip_live_links(event, ["index.html"], "+wording"))

    def test_missing_merge_parent_keeps_live_checks(self) -> None:
        with (
            patch.dict(check_site.os.environ, {"CI_EVENT": "pull_request"}),
            patch.object(
                check_site.subprocess, "run", side_effect=subprocess.CalledProcessError(1, "git")
            ),
        ):
            self.assertFalse(check_site.ci_offline())


if __name__ == "__main__":
    unittest.main()
