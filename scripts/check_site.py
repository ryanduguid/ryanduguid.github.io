from __future__ import annotations

import re
import unittest
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[1]
HOME = ROOT / "index.html"


class SiteDocument(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.main_ids: list[str | None] = []
        self.heading_stack: list[tuple[str, list[str]]] = []
        self.headings: list[tuple[str, str]] = []
        self.links: list[tuple[str, str]] = []
        self.assets: list[str] = []
        self.visible_text: list[str] = []
        self._anchor: tuple[str, list[str]] | None = None
        self._ignored_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if tag in {"script", "style"}:
            self._ignored_depth += 1
        if tag == "main":
            self.main_ids.append(values.get("id"))
        if tag in {"h1", "h2", "h3"}:
            self.heading_stack.append((tag, []))
        if tag == "a" and values.get("href"):
            self._anchor = (values["href"] or "", [])
        if tag in {"img", "link", "script"}:
            asset = values.get("src") or values.get("href")
            if asset:
                self.assets.append(asset)

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style"} and self._ignored_depth:
            self._ignored_depth -= 1
        if tag in {"h1", "h2", "h3"} and self.heading_stack:
            heading_tag, parts = self.heading_stack.pop()
            self.headings.append((heading_tag, " ".join(parts).strip()))
        if tag == "a" and self._anchor:
            href, parts = self._anchor
            self.links.append((href, " ".join(parts).strip()))
            self._anchor = None

    def handle_data(self, data: str) -> None:
        text = " ".join(data.split())
        if not text or self._ignored_depth:
            return
        self.visible_text.append(text)
        if self.heading_stack:
            self.heading_stack[-1][1].append(text)
        if self._anchor:
            self._anchor[1].append(text)


def parse(path: Path) -> SiteDocument:
    document = SiteDocument()
    document.feed(path.read_text(encoding="utf-8"))
    return document


def local_target(url: str) -> Path | None:
    parsed = urlparse(url)
    if parsed.scheme or parsed.netloc or url.startswith("#"):
        return None

    route = parsed.path
    if not route:
        return None
    if route.startswith("/"):
        target = ROOT / route.removeprefix("/")
    else:
        target = ROOT / route
    if route.endswith("/"):
        target /= "index.html"
    return target


class PortfolioSiteChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.document = parse(HOME)
        cls.page_text = " ".join(cls.document.visible_text)

    def test_homepage_is_an_accessible_portfolio(self) -> None:
        self.assertEqual(self.document.main_ids, ["main"])
        self.assertEqual(
            [text for tag, text in self.document.headings if tag == "h1"],
            ["Ryan Duguid"],
        )
        self.assertIn(("h2", "Selected work"), self.document.headings)

        project_links = [
            (href, text)
            for href, text in self.document.links
            if re.fullmatch(r"https://github\.com/ryanduguid/[^/]+", href)
        ]
        self.assertGreaterEqual(len(project_links), 8)
        self.assertLessEqual(len(project_links), 10)
        self.assertEqual(len(project_links), len({href for href, _ in project_links}))
        self.assertTrue(all(text for _, text in project_links))

    def test_linkedin_is_marked_hibernated(self) -> None:
        self.assertIn(
            ("https://www.linkedin.com/in/ryan-duguid", "LinkedIn (hibernated)"),
            self.document.links,
        )

    def test_protected_branch_check_name_is_preserved(self) -> None:
        workflow = (ROOT / ".github" / "workflows" / "checks.yml").read_text(
            encoding="utf-8"
        )
        self.assertRegex(workflow, r"(?m)^  checks:\s*$")

    def test_employment_and_sales_copy_are_not_published(self) -> None:
        lowered = self.page_text.lower()
        forbidden = {
            "luma advisors",
            "senior accountant",
            "31 august",
            "commencement",
            "controlled pilot",
            "professional engagement",
            "available to discuss",
        }
        self.assertEqual([], sorted(term for term in forbidden if term in lowered))

    def test_retired_routes_are_removed(self) -> None:
        html_routes = {
            path.relative_to(ROOT).as_posix()
            for path in ROOT.rglob("*.html")
            if path.name == "index.html"
        }
        self.assertEqual(html_routes, {"index.html"})

        sitemap = ET.parse(ROOT / "sitemap.xml")
        namespace = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
        locations = [node.text for node in sitemap.findall("s:url/s:loc", namespace)]
        self.assertEqual(locations, ["https://ryanduguid.github.io/"])

    def test_local_links_and_assets_resolve(self) -> None:
        missing: list[str] = []
        for url, _ in self.document.links:
            target = local_target(url)
            if target and not target.exists():
                missing.append(url)
        for url in self.document.assets:
            target = local_target(url)
            if target and not target.exists():
                missing.append(url)
        self.assertEqual(missing, [])

    def test_site_has_no_client_side_javascript(self) -> None:
        scripts = sorted(
            path.relative_to(ROOT).as_posix()
            for path in ROOT.rglob("*")
            if path.is_file() and path.suffix in {".js", ".mjs"}
        )
        script_tags = sorted(
            path.relative_to(ROOT).as_posix()
            for path in ROOT.rglob("*.html")
            if "<script" in path.read_text(encoding="utf-8").lower()
        )
        self.assertEqual(scripts, [])
        self.assertEqual(script_tags, [])

    def test_homepage_and_stylesheet_stay_small(self) -> None:
        self.assertLess(HOME.stat().st_size, 16_000)
        self.assertLess((ROOT / "assets" / "site.css").stat().st_size, 12_000)


if __name__ == "__main__":
    unittest.main(verbosity=2)
