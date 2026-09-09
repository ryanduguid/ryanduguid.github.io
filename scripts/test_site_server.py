"""Regression test for the cross-platform static-site server."""

from __future__ import annotations

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
                socket.create_connection(
                    (server_module.HOST, queued_server.server_port), timeout=1
                )
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
            f".mjs must remain executable when the host MIME map is wrong; "
            f"found {content_type!r}"
        )
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
        mimetypes.guess_type = original_guess_type

    print("site server connection queue and MIME tests passed")


if __name__ == "__main__":
    main()
