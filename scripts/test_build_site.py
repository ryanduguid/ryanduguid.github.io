"""Check the rendered site and preview against a small Jekyll fixture."""

from __future__ import annotations

import tempfile
import threading
from pathlib import Path
from urllib.request import urlopen

import build_site
import serve_site


def main() -> None:
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
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)
    print("Jekyll build and rendered preview tests passed")


if __name__ == "__main__":
    main()
