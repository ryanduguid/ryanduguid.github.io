"""Exercise metadata CI selection with real Git merge comparisons."""

from __future__ import annotations

import contextlib
import io
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import check_site
from test_build_site import is_site_source, site_selection


class MetadataSelectionTests(unittest.TestCase):
    def test_only_exact_unpublished_paths_qualify(self) -> None:
        allowed = [*check_site.METADATA_ROOT_PATHS, "docs/guide.md", "docs/nested/new.anything"]
        for path in allowed:
            self.assertTrue(check_site.is_metadata_only("pull_request", [path]), path)
        self.assertTrue(check_site.is_metadata_only("pull_request", allowed))
        rejected = [
            "README.MD",
            "readme.md",
            "foo/README.md",
            "docs",
            "Docs/a.md",
            "docs-old/a.md",
            "docs/../index.html",
            "docs//a.md",
            "docs/./a.md",
            "docs/",
            "docs/a\\b.md",
            "docs/a\n.md",
            "/docs/a.md",
            "",
            "_config.yml",
            "scripts/check_site.py",
            ".github/workflows/checks.yml",
            "_includes/a.html",
            "_layouts/a.html",
            "assets/a.png",
            "package-lock.json",
            ".github/PULL_REQUEST_TEMPLATE.md",
        ]
        for path in rejected:
            self.assertFalse(check_site.is_metadata_only("pull_request", ["README.md", path]), path)
        self.assertFalse(check_site.is_metadata_only("pull_request", []))

    def test_other_events_do_not_read_git(self) -> None:
        for event in ("push", "schedule", "workflow_dispatch", ""):
            with (
                patch.dict(check_site.os.environ, {"CI_EVENT": event}),
                patch.object(check_site.subprocess, "run") as run,
            ):
                self.assertFalse(check_site.ci_metadata_only())
                run.assert_not_called()

    def test_bad_comparison_data_keeps_full_checks(self) -> None:
        merge = "tree abc\nparent first\nparent second\n\nmessage\n"
        for output in ("", "README.md", "README.md\0\0", "docs/a.md\0index.html\0"):
            results = [
                subprocess.CompletedProcess([], 0, merge),
                subprocess.CompletedProcess([], 0, output),
            ]
            with (
                patch.dict(check_site.os.environ, {"CI_EVENT": "pull_request"}),
                patch.object(check_site.subprocess, "run", side_effect=results),
            ):
                self.assertFalse(check_site.ci_metadata_only(), repr(output))
        for error in (
            subprocess.CalledProcessError(1, "git"),
            FileNotFoundError("git"),
            subprocess.TimeoutExpired("git", 30),
            UnicodeDecodeError("utf-8", b"\xff", 0, 1, "invalid"),
        ):
            with (
                patch.dict(check_site.os.environ, {"CI_EVENT": "pull_request"}),
                patch.object(check_site.subprocess, "run", side_effect=error),
            ):
                self.assertFalse(check_site.ci_metadata_only())
        for parents in (0, 1, 3):
            commit = "tree abc\n" + "parent sha\n" * parents + "\nmessage"
            with (
                patch.dict(check_site.os.environ, {"CI_EVENT": "pull_request"}),
                patch.object(
                    check_site.subprocess,
                    "run",
                    return_value=subprocess.CompletedProcess([], 0, commit),
                ) as run,
            ):
                self.assertFalse(check_site.ci_metadata_only())
                self.assertEqual(run.call_count, 1)

    def test_actual_merges_deletions_and_renames(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)

            def git(*arguments: str) -> str:
                return subprocess.run(
                    ["git", *arguments], cwd=root, check=True, capture_output=True, encoding="utf-8"
                ).stdout.strip()

            git("init", "-b", "main")
            git("config", "user.name", "Fixture")
            git("config", "user.email", "fixture@example.invalid")
            (root / "README.md").write_text("before\n", encoding="utf-8")
            (root / "docs").mkdir()
            (root / "docs/old.md").write_text("before\n", encoding="utf-8")
            git("add", ".")
            git("commit", "-m", "base")
            base = git("rev-parse", "HEAD")
            for mode, expected in (
                ("root", True),
                ("nested", True),
                ("delete", True),
                ("rename", True),
                ("mixed", False),
                ("move_to_source", False),
            ):
                git("checkout", "-B", "change", base)
                if mode == "delete":
                    git("rm", "README.md")
                elif mode in {"rename", "move_to_source"}:
                    destination = "docs/new.md" if mode == "rename" else "scripts/new.py"
                    (root / destination).parent.mkdir(exist_ok=True)
                    git("mv", "docs/old.md", destination)
                else:
                    target = "docs/new.md" if mode == "nested" else "README.md"
                    (root / target).write_text("after\n", encoding="utf-8")
                    if mode == "mixed":
                        (root / "_config.yml").write_text("changed\n", encoding="utf-8")
                git("add", ".")
                git("commit", "-m", mode)
                with (
                    patch.object(check_site, "ROOT", root),
                    patch.dict(check_site.os.environ, {"CI_EVENT": "pull_request"}),
                ):
                    self.assertFalse(check_site.ci_metadata_only())
                    git("checkout", "-B", "main", base)
                    git("merge", "--no-ff", "--no-edit", "change")
                    self.assertEqual(check_site.ci_metadata_only(), expected, mode)

    def test_cli_emits_one_value_without_building(self) -> None:
        for selected in (False, True):
            output = io.StringIO()
            with (
                patch.object(check_site.sys, "argv", ["check_site.py", "--ci-metadata-only"]),
                patch.object(check_site, "ci_metadata_only", return_value=selected),
                patch.object(check_site, "build") as build,
                contextlib.redirect_stdout(output),
            ):
                self.assertEqual(check_site.main(), 0)
                self.assertEqual(output.getvalue(), str(selected).lower() + "\n")
                build.assert_not_called()

    def test_metadata_paths_remain_excluded_and_build_drift_fails(self) -> None:
        include, exclude = site_selection(check_site.ROOT)
        for name in (*check_site.METADATA_ROOT_PATHS, "docs/guide.md"):
            self.assertFalse(is_site_source(Path(name), include, exclude), name)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            check_site.check_metadata_excluded(root)
            for name in (*check_site.METADATA_ROOT_PATHS, "docs"):
                path = root / name
                path.touch()
                with self.assertRaisesRegex(RuntimeError, "CI metadata path"):
                    check_site.check_metadata_excluded(root)
                path.unlink()


if __name__ == "__main__":
    unittest.main()
