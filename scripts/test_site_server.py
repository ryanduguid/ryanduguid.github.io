"""Regression test for the cross-platform static-site server."""

from __future__ import annotations

import gzip
import http.client
import mimetypes
import os
import socket
import threading
from contextlib import ExitStack
from urllib.request import urlopen

import serve_site as server_module


def main() -> None:
    # Parallel pages can connect their assets before the accept loop catches up.
    with server_module.create_server(port=0) as queued_server, ExitStack() as connections:
        for _ in range(8):
            connections.enter_context(
                socket.create_connection((server_module.HOST, queued_server.server_port), timeout=1)
            )

    original_guess_type = mimetypes.guess_type

    def hostile_guess_type(
        url: str | os.PathLike[str], strict: bool = True
    ) -> tuple[str | None, str | None]:
        if str(url).lower().endswith(".mjs"):
            return "application/octet-stream", None
        return original_guess_type(url, strict=strict)

    mimetypes.guess_type = hostile_guess_type
    server = server_module.create_server(directory=server_module.ROOT, port=0)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with urlopen(
            f"http://127.0.0.1:{server.server_port}/assets/levy.mjs",
            timeout=5,
        ) as response:
            content_type = response.headers.get_content_type()
        assert content_type == "text/javascript", (
            f".mjs must remain executable when the host MIME map is wrong; found {content_type!r}"
        )
        connection = http.client.HTTPConnection(server_module.HOST, server.server_port, timeout=5)
        try:
            connection.connect()
            original_socket = connection.sock
            for method, path in (
                ("GET", "/assets/levy.mjs"),
                ("HEAD", "/assets/levy.mjs"),
                ("GET", "/assets/fonts/PublicSans-Regular.woff2"),
            ):
                connection.request(method, path, headers={"Accept-Encoding": "gzip"})
                response = connection.getresponse()
                body = response.read()
                assert response.status == 200
                assert response.version == 11, "asset requests must support HTTP/1.1 reuse"
                assert connection.sock is original_socket, "asset request closed its connection"
                if method == "HEAD":
                    assert body == b""
                    continue
                assert len(body) == int(response.getheader("Content-Length", "0"))
                if response.getheader("Content-Encoding") == "gzip":
                    body = gzip.decompress(body)
                assert body == (server_module.ROOT / path.lstrip("/")).read_bytes()
        finally:
            connection.close()
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
        mimetypes.guess_type = original_guess_type

    print("site server connection queue, reuse, response framing and MIME tests passed")


if __name__ == "__main__":
    main()
