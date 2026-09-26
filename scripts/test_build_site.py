"""Check the rendered site and preview against a small Jekyll fixture."""

from __future__ import annotations

import gzip
import tempfile
import threading
from http.client import HTTPConnection
from pathlib import Path
from urllib.request import Request, urlopen

import build_site
import serve_site

CONFIG = "_config.yml"
# Jekyll always excludes its own destination, so `_config.yml` does not name it.
DESTINATION = "_site"


def site_selection(root: Path) -> tuple[set[str], set[str]]:
    """The include and exclude lists `_config.yml` hands Jekyll.

    Jekyll applies both to entries relative to the site source. Reading them
    here keeps the guard and the build looking at the same files: a second list
    in this script drifts from the config the moment either one changes.

    The file states them as two flat blocks of `- value`. Anything else is a
    shape this reader would misread, so it fails rather than silently selecting
    nothing.
    """
    include: set[str] = set()
    exclude: set[str] = set()
    current: set[str] | None = None
    for line in (root / CONFIG).read_text(encoding="utf-8").splitlines():
        if line.startswith("include:"):
            current = include
        elif line.startswith("exclude:"):
            current = exclude
        elif line.startswith("  - ") and current is not None:
            current.add(line[4:].strip().strip("/"))
        elif line and not line.startswith((" ", "#")):
            current = None
    assert include and exclude, f"{CONFIG} no longer lists include and exclude as flat blocks"
    return include, exclude


def is_site_source(relative: Path, include: set[str], exclude: set[str]) -> bool:
    """Whether Jekyll would read this path, by its own include and exclude rules.

    Exclusions match a source-relative path or anything under it, not a bare
    directory name at any depth: `_config.yml` excludes `work`, which says
    nothing about `assets/work`. A dot-entry is skipped unless `include` names
    that exact path, which is how `.well-known` reaches the build.
    """
    posix = relative.as_posix()
    if posix == DESTINATION or posix.startswith(DESTINATION + "/"):
        return False
    if any(posix == name or posix.startswith(name + "/") for name in exclude):
        return False
    for depth, part in enumerate(relative.parts, start=1):
        if part.startswith(".") and "/".join(relative.parts[:depth]) not in include:
            return False
    return True


def check_site_selection(root: Path | None = None) -> None:
    """The selection rules this guard now shares with the build."""
    root = root or build_site.ROOT
    include, exclude = site_selection(root)
    for path, expected in (
        ("assets/site.css", True),
        (".well-known/security.txt", True),
        (".git/config", False),
        ("scripts/test_build_site.py", False),
        ("service/coal-lsl-levy/src/server.mjs", False),
        ("vendor/bundle/gem.css", False),
        ("_site/index.html", False),
        ("assets/work/report.css", True),
    ):
        actual = is_site_source(Path(path), include, exclude)
        assert actual is expected, f"{path}: selected={actual}, expected {expected}"


def check_no_sass_sources(root: Path | None = None) -> int:
    """No Sass reaches the build, so the unsupported Ruby Sass in the chain never runs.

    The Gemfile pins Jekyll 3.10.0 to match the GitHub Pages build, and that
    chain carries jekyll-sass-converter 1.5.2 and Ruby Sass 3.7.4, which has
    been end of life since 26 March 2019. The site is written in plain CSS, so
    the converter is installed but never given an input. This check keeps it
    that way: a `.scss` or `.sass` source, or a stylesheet with front matter
    (which Jekyll 3 hands to the converter), would put unmaintained code on the
    build path of every page. Dropping the gem instead means leaving the Pages
    legacy build, which is a hosting decision, not a check.
    """
    root = root or build_site.ROOT
    include, exclude = site_selection(root)
    offenders = []
    checked = 0
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        if not is_site_source(path.relative_to(root), include, exclude):
            continue
        if path.suffix in {".scss", ".sass"}:
            offenders.append(f"{path.relative_to(root)}: Sass source")
        elif path.suffix == ".css":
            checked += 1
            if path.read_bytes().lstrip().startswith(b"---"):
                offenders.append(f"{path.relative_to(root)}: stylesheet with front matter")
    assert not offenders, "Sass would reach the build:\n" + "\n".join(offenders)
    assert checked, "no stylesheet was inspected; the check is looking in the wrong place"
    return checked


def main() -> None:
    check_site_selection()
    stylesheets = check_no_sass_sources()
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        (root / "_includes").mkdir()
        (root / "_layouts").mkdir()
        (root / "_includes/nav.html").write_text(
            '<nav><a href="/"{% if page.url == "/" %} aria-current="page"'
            "{% endif %}>Home</a></nav>",
            encoding="utf-8",
        )
        (root / "index.html").write_text(
            '---\n---\n{% include nav.html %}<main id="main">Café</main>',
            encoding="utf-8",
        )
        (root / "robots.txt").write_text("User-agent: *\n", encoding="utf-8")
        rendered = build_site.build(root)
        expected = '<nav><a href="/" aria-current="page">Home</a></nav>'
        expected += '<main id="main">Café</main>'
        assert (rendered / "index.html").read_text(encoding="utf-8") == expected
        assert (rendered / "robots.txt").read_text(encoding="utf-8") == "User-agent: *\n"
        assert not (rendered / "_includes").exists()
        server = serve_site.create_server(directory=rendered, port=0)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with urlopen(f"http://127.0.0.1:{server.server_port}/", timeout=5) as response:
                assert response.read().decode("utf-8") == expected
            url = f"http://127.0.0.1:{server.server_port}/"
            for accept in ["gzip, deflate", "*", "*;q=0.5", "*;q=0, gzip"]:
                request = Request(url, headers={"Accept-Encoding": accept})
                with urlopen(request, timeout=5) as response:
                    compressed = response.read()
                    assert response.headers["Content-Encoding"] == "gzip"
                    assert response.headers["Vary"] == "Accept-Encoding"
                    assert int(response.headers["Content-Length"]) == len(compressed)
                    assert gzip.decompress(compressed).decode("utf-8") == expected
            request = Request(url, method="HEAD", headers={"Accept-Encoding": "gzip"})
            with urlopen(request, timeout=5) as response:
                assert response.read() == b""
                assert int(response.headers["Content-Length"]) == len(compressed)
            for accept in [
                "gzip;q=0",
                "gzip;q=0.0, deflate",
                "br",
                "gzip;q=invalid",
                "*;q=0",
                "*, gzip;q=0",
                "gzip;q=0, *",
            ]:
                with urlopen(
                    Request(url, headers={"Accept-Encoding": accept}), timeout=5
                ) as response:
                    assert response.headers["Content-Encoding"] is None
                    assert response.read().decode("utf-8") == expected
            connection = HTTPConnection("127.0.0.1", server.server_port, timeout=5)
            try:
                connection.putrequest("GET", "/", skip_accept_encoding=True)
                connection.putheader("Accept-Encoding", "br")
                connection.putheader("Accept-Encoding", "gzip")
                connection.endheaders()
                response = connection.getresponse()
                assert response.getheader("Content-Encoding") == "gzip"
                assert gzip.decompress(response.read()).decode("utf-8") == expected
            finally:
                connection.close()
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)
    print(
        f"Jekyll build and rendered preview tests passed ({stylesheets} stylesheets carry no Sass)"
    )


if __name__ == "__main__":
    main()
