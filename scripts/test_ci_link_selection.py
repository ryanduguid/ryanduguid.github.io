"""Check when CI may omit live requests without omitting link-change validation."""

import subprocess
import unittest
from unittest.mock import patch

import check_site


class LiveLinkSelectionTests(unittest.TestCase):
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
