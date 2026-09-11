"""Serve the repository over loopback with stable JavaScript MIME types."""

from __future__ import annotations

import gzip
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
from pathlib import Path
from socket import SOMAXCONN
from typing import BinaryIO
from urllib.parse import urlsplit

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

    def accepts_gzip(self) -> bool:
        wildcard = False
        encodings = ",".join(self.headers.get_all("Accept-Encoding", []))
        for encoding in encodings.lower().split(","):
            coding, _, parameter = encoding.strip().partition(";")
            coding = coding.strip()
            if coding in {"gzip", "*"}:
                if not parameter:
                    accepted = True
                else:
                    try:
                        accepted = (
                            parameter.strip().startswith("q=")
                            and 0 < float(parameter.strip()[2:]) <= 1
                        )
                    except ValueError:
                        accepted = False
                if coding == "gzip":
                    return accepted
                wildcard = accepted
        return wildcard

    def end_headers(self) -> None:
        self.send_header("Vary", "Accept-Encoding")
        super().end_headers()

    def send_head(self) -> BinaryIO | None:
        # Match GitHub Pages text compression; retain standard redirects and cache handling.
        path = Path(self.translate_path(self.path))
        if path.is_dir() and urlsplit(self.path).path.endswith("/"):
            path = next(
                (path / name for name in ("index.html", "index.htm") if (path / name).is_file()),
                path,
            )
        if (
            not self.accepts_gzip()
            or "If-Modified-Since" in self.headers
            or "Range" in self.headers
            or path.suffix.lower()
            not in {".html", ".htm", ".css", ".mjs", ".js", ".txt", ".xml", ".json", ".svg"}
        ):
            return super().send_head()
        try:
            data = gzip.compress(path.read_bytes(), mtime=0)
            modified = path.stat().st_mtime
        except OSError:
            return super().send_head()
        self.send_response(200)
        self.send_header("Content-type", self.guess_type(str(path)))
        self.send_header("Content-Encoding", "gzip")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Last-Modified", self.date_time_string(modified))
        self.end_headers()
        return BytesIO(data)


class SiteHTTPServer(ThreadingHTTPServer):
    """Queue parallel browser asset connections while the accept loop catches up."""

    request_queue_size = SOMAXCONN


def create_server(*, directory: Path = ROOT / "_site", port: int = PORT) -> ThreadingHTTPServer:
    handler = partial(SiteRequestHandler, directory=str(directory))
    return SiteHTTPServer((HOST, port), handler)


def main() -> None:
    build()
    with create_server() as server:
        print(f"Serving HTTP on {HOST} port {server.server_port}", flush=True)
        server.serve_forever()


if __name__ == "__main__":
    main()
