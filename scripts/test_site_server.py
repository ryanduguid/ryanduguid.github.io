"""Regression test for the cross-platform static-site server."""

from __future__ import annotations

import importlib.util
import mimetypes
import threading
from pathlib import Path
from types import ModuleType
from urllib.request import urlopen


ROOT = Path(__file__).resolve().parents[1]
SERVER_PATH = ROOT / "scripts" / "serve_site.py"


def load_site_server() -> ModuleType:
    """Load the real server while producing a focused pre-implementation failure."""
    assert SERVER_PATH.exists(), "site server with an explicit .mjs MIME type is missing"
    spec = importlib.util.spec_from_file_location("serve_site", SERVER_PATH)
    assert spec and spec.loader, "site server could not be loaded"
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> None:
    server_module = load_site_server()
    original_guess_type = mimetypes.guess_type

    def hostile_guess_type(url: str, strict: bool = True):
        if str(url).lower().endswith(".mjs"):
            return "application/octet-stream", None
        return original_guess_type(url, strict=strict)

    mimetypes.guess_type = hostile_guess_type
    server = server_module.create_server(port=0)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with urlopen(
            f"http://127.0.0.1:{server.server_port}/assets/levy.mjs",
            timeout=5,
        ) as response:
            content_type = response.headers.get_content_type()
        assert content_type == "text/javascript", (
            f".mjs must remain executable when the host MIME map is wrong; "
            f"found {content_type!r}"
        )
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
        mimetypes.guess_type = original_guess_type

    print("site server MIME test passed")


if __name__ == "__main__":
    main()
