from __future__ import annotations

import hashlib
import re
import struct
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser


ROOT = Path(__file__).resolve().parents[1]
HOME = ROOT / "index.html"


class SiteDocument(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.body: dict[str, str | None] = {}
        self.mains: list[dict[str, str | None]] = []
        self.headings: list[tuple[str, str]] = []
        self.links: list[tuple[dict[str, str | None], str]] = []
        self.assets: list[str] = []
        self.metadata: dict[str, str] = {}
        self.project_ids: list[str | None] = []
        self._heading: tuple[str, list[str]] | None = None
        self._anchor: tuple[dict[str, str | None], list[str]] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if tag == "body":
            self.body = values
        elif tag == "main":
            self.mains.append(values)
        elif tag == "article" and "project" in (values.get("class") or "").split():
            self.project_ids.append(values.get("id"))

        if tag == "meta":
            key = values.get("property") or values.get("name")
            if key and values.get("content"):
                self.metadata[key] = values["content"] or ""
        elif tag in {"h1", "h2", "h3"}:
            self._heading = (tag, [])
        elif tag == "a" and values.get("href"):
            self._anchor = (values, [])

        if tag in {"img", "link", "script"}:
            asset = values.get("src") or values.get("href")
            if asset:
                self.assets.append(asset)

    def handle_endtag(self, tag: str) -> None:
        if self._heading and tag == self._heading[0]:
            heading_tag, parts = self._heading
            self.headings.append((heading_tag, " ".join(parts).strip()))
            self._heading = None
        if tag == "a" and self._anchor:
            attrs, parts = self._anchor
            self.links.append((attrs, " ".join(parts).strip()))
            self._anchor = None

    def handle_data(self, data: str) -> None:
        text = " ".join(data.split())
        if self._heading and text:
            self._heading[1].append(text)
        if self._anchor and text:
            self._anchor[1].append(text)


def require(condition: object, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def local_target(url: str) -> Path | None:
    parsed = urlparse(url)
    if parsed.scheme or parsed.netloc or url.startswith("#") or not parsed.path:
        return None
    target = ROOT / parsed.path.removeprefix("/")
    return target / "index.html" if parsed.path.endswith("/") else target


def main() -> None:
    html = HOME.read_text(encoding="utf-8")
    document = SiteDocument()
    document.feed(html)

    require([attrs.get("id") for attrs in document.mains] == ["main"], "expected one main")
    require(
        [text for tag, text in document.headings if tag == "h1"] == ["Ryan Duguid"],
        "expected the portfolio owner as the only h1",
    )
    require(("h2", "Selected work") in document.headings, "missing work heading")

    project_links: list[tuple[str, str]] = []
    for attrs, text in document.links:
        match = re.fullmatch(
            r"https://github\.com/ryanduguid/([^/]+)", attrs.get("href") or ""
        )
        if match:
            project_links.append((match.group(1).lower(), text))
    require(len(project_links) == 10, "expected ten unique project links")
    require(
        document.project_ids == [slug for slug, _ in project_links],
        "project anchors must match repository names",
    )
    require(len(set(document.project_ids)) == 10, "project anchors must be unique")
    require(all(text for _, text in project_links), "project links need names")
    require('class="project-meta"' not in html, "project entries should be prose only")

    require("Ryan Duguid builds open-source tools" in html, "missing identity statement")
    require(
        "itemscope" in document.body
        and document.body.get("itemtype") == "https://schema.org/ProfilePage",
        "body must describe a ProfilePage",
    )
    person = document.mains[0]
    require(
        "itemscope" in person
        and person.get("itemprop") == "mainEntity"
        and person.get("itemtype") == "https://schema.org/Person",
        "main must describe the portfolio owner",
    )

    identity_urls = {
        "https://github.com/ryanduguid",
        "https://www.linkedin.com/in/ryan-duguid",
    }
    identity_links = {
        attrs.get("href"): (attrs, text)
        for attrs, text in document.links
        if attrs.get("href") in identity_urls
    }
    require(set(identity_links) == identity_urls, "missing identity links")
    require(
        all(
            "me" in (attrs.get("rel") or "").split()
            and attrs.get("itemprop") == "sameAs"
            for attrs, _ in identity_links.values()
        ),
        "identity links need rel=me and schema.org sameAs",
    )
    require(
        identity_links["https://www.linkedin.com/in/ryan-duguid"][1]
        == "LinkedIn (hibernated)",
        "LinkedIn must remain marked hibernated",
    )

    social = {
        "og:image": "https://ryanduguid.github.io/assets/og-card.png",
        "og:image:alt": "Ryan Duguid, open-source accounting tools",
        "og:image:width": "1200",
        "og:image:height": "630",
        "twitter:card": "summary_large_image",
        "twitter:image": "https://ryanduguid.github.io/assets/og-card.png",
        "twitter:image:alt": "Ryan Duguid, open-source accounting tools",
    }
    require(
        {key: document.metadata.get(key) for key in social} == social,
        "social card metadata is incomplete",
    )

    social_card = ROOT / "assets" / "og-card.png"
    social_card_bytes = social_card.read_bytes()
    require(social_card_bytes.startswith(b"\x89PNG\r\n\x1a\n"), "social card is not PNG")
    width, height = struct.unpack(">II", social_card_bytes[16:24])
    require((width, height) == (1200, 630), "social card dimensions changed")
    require(len(social_card_bytes) <= 350_000, "social card is larger than 350 KB")
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    digest = hashlib.sha256(social_card_bytes).hexdigest()
    require(digest in readme, "README social-card checksum is missing or stale")
    for value in ("assets/og-card.png", "MIT", "Pillow 12.3.0"):
        require(value in readme, f"README social-card provenance omits {value}")

    require(not (ROOT / "llms.txt").exists() and "llms.txt" not in html, "remove llms.txt")

    policy = RobotFileParser()
    policy.parse((ROOT / "robots.txt").read_text(encoding="utf-8").splitlines())
    homepage = "https://ryanduguid.github.io/"
    for bot in ("OAI-SearchBot", "Claude-SearchBot", "PerplexityBot"):
        require(policy.can_fetch(bot, homepage), f"robots.txt blocks {bot}")
    for bot in ("GPTBot", "ClaudeBot", "Google-Extended", "Applebot-Extended"):
        require(not policy.can_fetch(bot, homepage), f"robots.txt allows {bot}")

    workflow = (ROOT / ".github" / "workflows" / "checks.yml").read_text(encoding="utf-8")
    require(re.search(r"(?m)^  checks:\s*$", workflow), "protected check name changed")

    html_routes = {
        path.relative_to(ROOT).as_posix()
        for path in ROOT.rglob("*.html")
        if path.name == "index.html"
    }
    require(html_routes == {"index.html"}, f"unexpected routes: {sorted(html_routes)}")
    sitemap = ET.parse(ROOT / "sitemap.xml")
    namespace = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    locations = [node.text for node in sitemap.findall("s:url/s:loc", namespace)]
    require(locations == [homepage], "sitemap should contain only the homepage")

    urls = [attrs.get("href") or "" for attrs, _ in document.links] + document.assets
    missing = [url for url in urls if (target := local_target(url)) and not target.exists()]
    require(not missing, f"missing local assets: {missing}")

    scripts = [
        path.relative_to(ROOT).as_posix()
        for path in ROOT.rglob("*")
        if path.is_file() and path.suffix in {".js", ".mjs"}
    ]
    scripted_pages = [
        path.relative_to(ROOT).as_posix()
        for path in ROOT.rglob("*.html")
        if "<script" in path.read_text(encoding="utf-8").lower()
    ]
    require(not scripts and not scripted_pages, "site must not use client-side JavaScript")
    print("site checks passed")


if __name__ == "__main__":
    main()
