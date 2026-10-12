"""Fuzz the changelog-to-Atom feed builder.

Every refusal must name the changelog and every built feed must be well-formed
XML. The fuzzing CI job runs this after main pushes, weekly and on demand;
scripts/test_feed.py replays the seed corpus on every check run. On Linux with
Python 3.14:

    python -m pip install --require-hashes --only-binary :all: -r scripts/requirements-fuzz.txt
    python scripts/fuzz_feed.py scripts/fuzz-corpus/feed -max_total_time=60 -max_len=4096
"""

from __future__ import annotations

import sys

# Parses only the feed build_feed just wrote; expat resolves no external entities.
from xml.etree import ElementTree  # nosec B405 # nosemgrep

import build_feed


def test_one_input(data: bytes) -> None:
    source = data.decode("utf-8", errors="replace")
    try:
        feed = build_feed.build(source)
    except SystemExit as refusal:
        # Every refusal names the changelog; anything else is a crash.
        if not str(refusal.code).startswith("changelog: "):
            raise AssertionError(f"unexpected refusal {refusal.code!r}") from refusal
        return
    try:
        ElementTree.fromstring(feed)  # nosec B314: parses the feed this script just built
    except ElementTree.ParseError as error:
        raise AssertionError(f"built a malformed feed: {error}") from error


if __name__ == "__main__":
    import atheris

    atheris.instrument_all()
    atheris.Setup(sys.argv, test_one_input)
    atheris.Fuzz()
