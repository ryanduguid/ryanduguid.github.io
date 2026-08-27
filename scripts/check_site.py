from __future__ import annotations

import re
import unittest
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[1]
HOME = ROOT / "index.html"

PROJECTS = {
    "payday-super-checker": (
        "https://github.com/ryanduguid/payday-super-checker",
        ("Python CLI", "Payroll controls", "MIT"),
    ),
    "xero-trial-balance-export": (
        "https://github.com/ryanduguid/xero-trial-balance-export",
        ("Python CLI", "Xero reporting", "MIT"),
    ),
    "ozzit": (
        "https://github.com/ryanduguid/Ozzit",
        ("Excel LAMBDA", "Financial modelling", "MIT"),
    ),
    "accounting-excel-toolkit": (
        "https://github.com/ryanduguid/accounting-excel-toolkit",
        ("Power Query and VBA", "Ledger workflows", "MIT"),
    ),
    "aus-accounting-mcp": (
        "https://github.com/ryanduguid/aus-accounting-mcp",
        ("Python MCP server", "Review workflows", "MIT"),
    ),
    "australian-accounting-skills": (
        "https://github.com/ryanduguid/australian-accounting-skills",
        ("Agent skills", "Public practice", "MIT"),
    ),
    "workpaper-review-gate": (
        "https://github.com/ryanduguid/workpaper-review-gate",
        ("Python CLI", "Workpaper review", "MIT"),
    ),
    "australian-accounting-power-bi": (
        "https://github.com/ryanduguid/australian-accounting-power-bi",
        ("Power BI", "Financial analytics", "MIT"),
    ),
    "monthly-close-controls": (
        "https://github.com/ryanduguid/monthly-close-controls",
        ("Python CLI", "Month-end close", "MIT"),
    ),
    "au-tax-legislation-corpus": (
        "https://github.com/ryanduguid/au-tax-legislation-corpus",
        ("Python corpus pipeline", "Tax legislation", "MIT"),
    ),
}


class SiteDocument(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.main_ids: list[str | None] = []
        self.heading_stack: list[tuple[str, list[str]]] = []
        self.headings: list[tuple[str, str]] = []
        self.links: list[tuple[str, str]] = []
        self.link_attributes: list[dict[str, str | None]] = []
        self.assets: list[str] = []
        self.metadata: dict[str, str] = {}
        self.elements: list[tuple[str, dict[str, str | None]]] = []
        self.projects: list[tuple[str | None, tuple[str, ...]]] = []
        self.visible_text: list[str] = []
        self._anchor: tuple[str, list[str]] | None = None
        self._project: tuple[str | None, list[str]] | None = None
        self._in_project_metadata = False
        self._metadata_parts: list[str] | None = None
        self._ignored_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        self.elements.append((tag, values))
        if tag in {"script", "style"}:
            self._ignored_depth += 1
        if tag == "meta":
            key = values.get("property") or values.get("name")
            content = values.get("content")
            if key and content:
                self.metadata[key] = content
        if tag == "main":
            self.main_ids.append(values.get("id"))
        if tag == "article" and "project" in (values.get("class") or "").split():
            self._project = (values.get("id"), [])
        if tag == "ul" and "project-meta" in (values.get("class") or "").split():
            self._in_project_metadata = True
        if tag == "li" and self._in_project_metadata:
            self._metadata_parts = []
        if tag in {"h1", "h2", "h3"}:
            self.heading_stack.append((tag, []))
        if tag == "a" and values.get("href"):
            self._anchor = (values["href"] or "", [])
            self.link_attributes.append(values)
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
        if tag == "li" and self._metadata_parts is not None and self._project:
            self._project[1].append(" ".join(self._metadata_parts).strip())
            self._metadata_parts = None
        if tag == "ul" and self._in_project_metadata:
            self._in_project_metadata = False
        if tag == "article" and self._project:
            project_id, metadata = self._project
            self.projects.append((project_id, tuple(metadata)))
            self._project = None
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
        if self._metadata_parts is not None:
            self._metadata_parts.append(text)


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

    def test_profile_has_explicit_person_identity(self) -> None:
        self.assertIn(
            "Ryan Duguid builds open-source tools for Australian tax, payroll, "
            "financial reporting and accounting review.",
            self.page_text,
        )

        body = next(attrs for tag, attrs in self.document.elements if tag == "body")
        main = next(
            attrs
            for tag, attrs in self.document.elements
            if tag == "main" and attrs.get("id") == "main"
        )
        self.assertIn("itemscope", body)
        self.assertEqual(body.get("itemtype"), "https://schema.org/ProfilePage")
        self.assertIn("itemscope", main)
        self.assertEqual(main.get("itemprop"), "mainEntity")
        self.assertEqual(main.get("itemtype"), "https://schema.org/Person")

        identity_links = {
            attrs["href"]: attrs
            for attrs in self.document.link_attributes
            if attrs.get("href")
            in {
                "https://github.com/ryanduguid",
                "https://www.linkedin.com/in/ryan-duguid",
            }
        }
        self.assertEqual(len(identity_links), 2)
        for attrs in identity_links.values():
            self.assertIn("me", (attrs.get("rel") or "").split())
            self.assertEqual(attrs.get("itemprop"), "sameAs")

    def test_projects_have_stable_deep_links_and_compact_metadata(self) -> None:
        self.assertEqual(
            self.document.projects,
            [(project_id, details) for project_id, (_, details) in PROJECTS.items()],
        )

    def test_discovery_file_matches_the_page_identity_and_projects(self) -> None:
        discovery = (ROOT / "llms.txt").read_text(encoding="utf-8")
        self.assertIn(
            "Ryan Duguid builds open-source tools for Australian tax, payroll, "
            "financial reporting and accounting review.",
            discovery,
        )
        self.assertIn(
            "LinkedIn (hibernated): https://www.linkedin.com/in/ryan-duguid",
            discovery,
        )
        for project_id, (url, _) in PROJECTS.items():
            label = "Ozzit" if project_id == "ozzit" else project_id
            self.assertRegex(discovery, rf"(?m)^- \[{re.escape(label)}\]\({re.escape(url)}\): .+$")

    def test_social_card_metadata_is_complete(self) -> None:
        expected = {
            "og:image": "https://ryanduguid.github.io/assets/og-card.png",
            "og:image:alt": "Ryan Duguid, open-source accounting tools",
            "og:image:width": "1200",
            "og:image:height": "630",
            "twitter:card": "summary_large_image",
            "twitter:image": "https://ryanduguid.github.io/assets/og-card.png",
            "twitter:image:alt": "Ryan Duguid, open-source accounting tools",
        }
        self.assertEqual(
            {key: self.document.metadata.get(key) for key in expected}, expected
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
