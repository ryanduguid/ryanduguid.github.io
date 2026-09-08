"""Serve the repository over loopback with stable JavaScript MIME types."""

from __future__ import annotations

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from build_site import build


ROOT = Path(__file__).resolve().parents[1]
HOST = "127.0.0.1"
PORT = 4173


class SiteRequestHandler(SimpleHTTPRequestHandler):
    """Keep ES modules executable when a Windows MIME registry is incorrect."""

    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".mjs": "text/javascript",
    }


def create_server(*, directory: Path = ROOT / "_site", port: int = PORT) -> ThreadingHTTPServer:
    handler = partial(SiteRequestHandler, directory=str(directory))
    return ThreadingHTTPServer((HOST, port), handler)


def main() -> None:
    build()
    with create_server() as server:
        print(f"Serving HTTP on {HOST} port {server.server_port}", flush=True)
        server.serve_forever()


if __name__ == "__main__":
    main()
