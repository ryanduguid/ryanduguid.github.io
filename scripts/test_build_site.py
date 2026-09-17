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

# Directories that are not site sources: dependencies, build output and scratch.
# Dot-directories are skipped as a class because Jekyll excludes them by
# default, so nothing inside one reaches the build unless `_config.yml` names
# it. That also keeps a local virtual environment's vendored CSS out of the
# check, which would otherwise be inspected as though it were a site source.
NOT_SOURCE = {"_site", "node_modules", "vendor", "work"}


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
    offenders = []
    checked = 0
    for path in sorted(root.rglob("*")):
        parts = path.relative_to(root).parts
        if NOT_SOURCE & set(parts) or any(part.startswith(".") for part in parts[:-1]):
            continue
        if not path.is_file():
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
    stylesheets = check_no_sass_sources()
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        (root / "_includes").mkdir()
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
        "Jekyll build and rendered preview tests passed "
        f"({stylesheets} stylesheets carry no Sass)"
    )


if __name__ == "__main__":
    main()
