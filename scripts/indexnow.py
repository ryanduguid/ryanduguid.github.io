"""Tell IndexNow that this site's pages changed.

IndexNow is a push protocol: instead of waiting for a crawler to notice an
edit, the site posts the changed URLs and the participating engines fetch them.
Bing, Yandex, Seznam and Naver share one submission. Google does not
participate. Bing matters here out of proportion to its search share, because
the answer engines that retrieve from it reach a lot more people than its
search box does.

Ownership is proved by a key file served from this host at the path in
KEY_LOCATION. The key is public by design: anyone can read it, and it only
authorises submitting URLs on this host, which is what the site wants anyway.

The URL list comes from sitemap.xml, so this file never holds a second copy of
the site's page list. Run it after a deploy, or let the workflow do it:

    python scripts/indexnow.py          # submit every URL in the sitemap
    python scripts/indexnow.py --dry-run  # print the payload and stop

Exit 0 on success or on any 2xx from the endpoint, 1 otherwise. Stdlib only.
"""

from __future__ import annotations

import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HOST = "ryanduguid.github.io"
KEY = "faa11c6917849844449d0fd32076f414"
KEY_LOCATION = f"https://{HOST}/{KEY}.txt"
ENDPOINT = "https://api.indexnow.org/indexnow"
MAX_URLS = 10000


def sitemap_urls() -> list[str]:
    xml = (ROOT / "sitemap.xml").read_text(encoding="utf-8")
    urls = re.findall(r"<loc>(.*?)</loc>", xml)
    if not urls:
        raise SystemExit("sitemap.xml lists no URLs")
    if len(urls) > MAX_URLS:
        raise SystemExit(f"{len(urls)} URLs, over the {MAX_URLS} per submission limit")
    for url in urls:
        if not url.startswith(f"https://{HOST}/"):
            raise SystemExit(f"{url} is not on {HOST}, and a key only covers its own host")
    return urls


def payload(urls: list[str]) -> dict:
    return {"host": HOST, "key": KEY, "keyLocation": KEY_LOCATION, "urlList": urls}


def key_file_matches() -> bool:
    """The endpoint fetches the key file, so a mismatch here is a silent failure."""
    path = ROOT / f"{KEY}.txt"
    return path.is_file() and path.read_text(encoding="utf-8").strip() == KEY


def submit(body: dict) -> int:
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        ENDPOINT,
        data=data,
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            print(f"{resp.status} {resp.reason} for {len(body['urlList'])} URLs")
            return 0 if 200 <= resp.status < 300 else 1
    except urllib.error.HTTPError as exc:
        # 422 means the key file did not verify, which is worth saying plainly.
        print(f"HTTP {exc.code}: {exc.read().decode('utf-8', 'replace')[:200]}")
        return 1
    except Exception as exc:  # noqa: BLE001 - report every failure mode
        print(f"submission failed: {exc}")
        return 1


def _self_check() -> None:
    assert re.fullmatch(r"[A-Za-z0-9-]{8,128}", KEY), "key is not 8 to 128 hex characters"
    assert key_file_matches(), f"{KEY}.txt is missing or does not contain the key"
    body = payload(["https://ryanduguid.github.io/"])
    assert set(body) == {"host", "key", "keyLocation", "urlList"}
    assert json.loads(json.dumps(body)) == body
    print("self-check OK")


def main() -> int:
    _self_check()
    urls = sitemap_urls()
    body = payload(urls)
    if "--dry-run" in sys.argv:
        print(json.dumps(body, indent=2))
        return 0
    return submit(body)


if __name__ == "__main__":
    sys.exit(main())
