"""Tests for the agent-file check, run by check_site.py.

Every case is fabricated in a temporary directory, so the committed files are
never touched and a passing run says the gate still fires rather than that this
particular site happens to be clean today.
"""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import check_agent_files as agent

# Built with chr() so this file holds no invisible characters of its own.
ZERO_WIDTH = chr(0x200B)
RIGHT_TO_LEFT = chr(0x202E)
POP_DIRECTION = chr(0x202C)
TAG_LETTER = chr(0xE0041)
ARABIC_LETTER_MARK = chr(0x61C)

POLICY = {
    "packages": {
        "pypi": {
            "solomons-sword": {"owner": "ryanduguid"},
            "pre-commit": {"owner": "pre-commit"},
        },
        "npm": {
            "skills": {"owner": "vercel-labs"},
            "playwright": {"owner": "microsoft", "local_dependency": True},
        },
    }
}


class AgentFileFixture(unittest.TestCase):
    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name)

    def tearDown(self) -> None:
        self.directory.cleanup()

    def findings(self, body: str, name: str = "llms.txt") -> list[str]:
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(body, encoding="utf-8")
        return [finding.what for finding in agent.check(self.root, POLICY)]


class NameTests(AgentFileFixture):
    def test_a_name_nobody_reviewed_is_refused(self) -> None:
        """The Fortune 500 failure: an official file naming an unclaimed package."""
        found = self.findings("pip install acme-client\n")
        self.assertEqual(len(found), 1)
        self.assertIn("not in the reviewed record", found[0])

    def test_an_unpinned_third_party_command_is_refused(self) -> None:
        found = self.findings("npx skills add ryanduguid/australian-accounting-skills\n")
        self.assertEqual(len(found), 1)
        self.assertIn("without a version", found[0])

    def test_a_pinned_third_party_command_passes(self) -> None:
        self.assertEqual(
            self.findings("npx --yes skills@1.5.22 add ryanduguid/australian-accounting-skills\n"),
            [],
        )

    def test_a_pinned_python_command_passes(self) -> None:
        self.assertEqual(self.findings('python -m pip install "pre-commit==4.0.1"\n'), [])

    def test_an_unpinned_command_for_our_own_name_passes(self) -> None:
        """Ryan publishes it, so the latest release is still his own code."""
        self.assertEqual(self.findings("pip install solomons-sword\n"), [])

    def test_a_tool_the_repository_installs_needs_no_pin(self) -> None:
        self.assertEqual(self.findings("npx playwright install chromium\n"), [])

    def test_a_local_path_names_no_package(self) -> None:
        self.assertEqual(
            self.findings('cd packages/the-wip-tally\npip install .\npip install -e ".[dev]"\n'),
            [],
        )

    def test_a_requirements_file_names_no_package(self) -> None:
        self.assertEqual(
            self.findings("python -m pip install --require-hashes -r requirements.lock\n"), []
        )

    def test_prose_about_a_runner_is_not_an_install(self) -> None:
        """`uvx may reuse a cached environment` is a sentence, not a command."""
        self.assertEqual(
            self.findings("Each command above is unpinned. uvx may reuse a cached environment.\n"),
            [],
        )

    def test_every_package_on_a_multi_package_line_is_read(self) -> None:
        """An approved first package must not carry an unreviewed second one."""
        found = self.findings("pip install solomons-sword acme-widgets\n")
        self.assertEqual(len(found), 1)
        self.assertIn("acme-widgets", found[0])

    def test_a_multi_package_npm_line_is_read_too(self) -> None:
        found = self.findings("npm install skills@1.5.22 acme-widgets\n")
        self.assertEqual(len(found), 1)
        self.assertIn("acme-widgets", found[0])

    def test_installing_a_local_tool_from_the_registry_still_needs_a_pin(self) -> None:
        """npx runs the copy npm ci installed; npm install resolves the registry."""
        found = self.findings("npm install playwright\n")
        self.assertEqual(len(found), 1)
        self.assertIn("without a version", found[0])

    def test_an_executable_after_from_is_not_a_second_package(self) -> None:
        self.assertEqual(
            self.findings("uvx --from solomons-sword==0.1.7 solomons-sword s99b-check --gross 1\n"),
            [],
        )

    def test_a_flag_value_is_not_a_package(self) -> None:
        self.assertEqual(
            self.findings("pip install --index-url https://example.invalid/simple .\n"), []
        )

    def test_a_second_command_on_the_line_does_not_leak_into_the_first(self) -> None:
        found = self.findings("pip install solomons-sword && echo acme-widgets\n")
        self.assertEqual(found, [])

    def test_a_second_command_after_a_separator_is_read(self) -> None:
        """A chained line runs both commands, so both are reviewed."""
        found = self.findings("pip install solomons-sword && pip install acme-widgets\n")
        self.assertEqual(len(found), 1)
        self.assertIn("acme-widgets", found[0])

    def test_a_package_added_to_a_runner_environment_is_read(self) -> None:
        """uvx --with adds a package to the run, and npx -p names the package."""
        found = self.findings(
            "uvx --with acme-extra --from solomons-sword==0.1.7 solomons-sword run\n"
        )
        self.assertEqual(len(found), 1)
        self.assertIn("acme-extra", found[0])

    def test_an_npx_package_flag_is_read(self) -> None:
        found = self.findings("npx -p acme-cli some-command\n")
        self.assertEqual(len(found), 1)
        self.assertIn("acme-cli", found[0])

    def test_a_requirements_install_must_pin_its_hashes(self) -> None:
        """Nothing the gate reads lists what a requirements file installs."""
        found = self.findings("pip install -r requirements.txt\n")
        self.assertEqual(len(found), 1)
        self.assertIn("--require-hashes", found[0])

    def test_a_hash_pinned_requirements_install_passes(self) -> None:
        self.assertEqual(
            self.findings("python -m pip install --require-hashes -r requirements.lock\n"), []
        )

    def test_an_extra_does_not_hide_the_tool_being_run(self) -> None:
        """uvx --with adds a package beside the one it runs, rather than replacing it."""
        found = self.findings("uvx --with solomons-sword acme-tool\n")
        self.assertEqual(len(found), 1, found)
        self.assertIn("acme-tool", found[0])

    def test_a_second_package_flag_is_read(self) -> None:
        found = self.findings("npx --package skills@1.5.22 --package acme-cli command\n")
        self.assertEqual(len(found), 1, found)
        self.assertIn("acme-cli", found[0])

    def test_a_command_after_an_unrelated_one_is_read_as_a_command(self) -> None:
        """The second command is a command, whatever opened the line."""
        found = self.findings("echo preparing && pip install solomons-sword acme-widgets\n")
        self.assertEqual(len(found), 1, found)
        self.assertIn("acme-widgets", found[0])

    def test_a_second_use_of_one_package_is_checked_on_its_own_terms(self) -> None:
        """A pinned use earlier on the line must not excuse an unpinned one after it."""
        found = self.findings("npx skills@1.5.22 add first && npx skills add second\n")
        self.assertEqual(len(found), 1, found)
        self.assertIn("without a version", found[0])

    def test_a_manifest_an_agent_is_pointed_at_is_scanned(self) -> None:
        """llms.txt links the agent-skills manifest, which carries an npx line."""
        found = self.findings(
            '{"install": "npx acme-cli@1.0.0 add ."}\n',
            name=".well-known/agent-skills/index.json",
        )
        self.assertEqual(len(found), 1)
        self.assertIn("acme-cli", found[0])

    def test_a_published_markdown_file_is_scanned(self) -> None:
        found = self.findings("    pip install acme-widgets\n", name="rates/register/README.md")
        self.assertEqual(len(found), 1)
        self.assertIn("acme-widgets", found[0])

    def test_a_page_text_alternate_is_scanned_too(self) -> None:
        found = self.findings("npm install acme-widgets\n", name="tools/thing/index.txt")
        self.assertEqual(len(found), 1)
        self.assertIn("acme-widgets", found[0])

    def test_a_checkout_under_an_excluded_directory_name_is_still_scanned(self) -> None:
        """GitHub Actions checks out under /home/runner/work, which is not ours.

        Matching the exclusions against the absolute path discarded every file
        the globs found, leaving the gate reading four files and reporting a
        pass.
        """
        checkout = self.root / "work" / "site"
        (checkout / "tools").mkdir(parents=True)
        (checkout / "tools" / "index.txt").write_text(
            "pip install acme-widgets\n", encoding="utf-8"
        )
        found = [finding.what for finding in agent.check(checkout, POLICY)]
        self.assertEqual(len(found), 1, found)
        self.assertIn("acme-widgets", found[0])

    def test_an_excluded_directory_inside_the_checkout_is_skipped(self) -> None:
        checkout = self.root / "site"
        (checkout / "node_modules" / "other").mkdir(parents=True)
        (checkout / "node_modules" / "other" / "README.md").write_text(
            "npm install some-dependency\n", encoding="utf-8"
        )
        self.assertEqual(agent.check(checkout, POLICY), [])


class HiddenTextTests(AgentFileFixture):
    def test_a_zero_width_character_is_refused(self) -> None:
        found = self.findings("A line a reader sees.\nAnd one" + ZERO_WIDTH + "with a gap.\n")
        self.assertEqual(len(found), 1)
        self.assertIn("U+200B", found[0])

    def test_a_bidirectional_override_is_refused(self) -> None:
        found = self.findings("Install " + RIGHT_TO_LEFT + "gnihtemos" + POP_DIRECTION + " now.\n")
        self.assertIn("U+202E", found[0])

    def test_a_unicode_tag_character_is_refused(self) -> None:
        found = self.findings("Ordinary text." + TAG_LETTER + "\n")
        self.assertIn("U+E0041", found[0])

    def test_an_arabic_letter_mark_is_refused(self) -> None:
        """A zero-width right-to-left control the first pass left out."""
        found = self.findings("Ordinary text." + ARABIC_LETTER_MARK + "\n")
        self.assertIn("U+061C", found[0])

    def test_the_finding_names_the_line(self) -> None:
        self.findings("one\ntwo\nthree" + ZERO_WIDTH + "\n")
        findings = agent.check(self.root, POLICY)
        self.assertTrue(findings[0].where.endswith(":3"), findings[0].where)

    def test_clean_text_passes(self) -> None:
        self.assertEqual(self.findings('Plain text with an em rule, a dash and "quotes".\n'), [])


class CommittedFilesTest(unittest.TestCase):
    def test_the_published_files_pass_their_own_check(self) -> None:
        self.assertEqual([finding.what for finding in agent.check()], [])


if __name__ == "__main__":
    unittest.main()
