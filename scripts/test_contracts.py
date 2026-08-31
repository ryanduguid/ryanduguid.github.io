"""Focused mutation tests for the site's design and public contracts."""

from __future__ import annotations

import hashlib
import re
import shutil
import struct
import tempfile
from contextlib import contextmanager
from pathlib import Path

import check_design
import seo_core as core
import site_contracts as contracts


ROOT = Path(__file__).resolve().parents[1]
COPY_IGNORE = shutil.ignore_patterns(
    ".git", "node_modules", "work", "__pycache__", "GATES.md"
)


@contextmanager
def copied_site():
    """Copy committed site inputs without generated or local-only directories."""
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory) / "site"
        shutil.copytree(ROOT, root, ignore=COPY_IGNORE)
        yield root


def read_text(root: Path, rel: str) -> str:
    return (root / rel).read_text(encoding="utf-8")


def changed_text(
    source: str,
    old: str,
    new: str,
) -> str:
    assert old in source, f"mutation source is stale: {old!r}"
    changed = source.replace(old, new, 1)
    assert changed != source, f"mutation made no change: {old!r}"
    return changed


def replace_file(
    root: Path,
    rel: str,
    old: str,
    new: str,
) -> None:
    path = root / rel
    path.write_text(
        changed_text(path.read_text(encoding="utf-8"), old, new),
        encoding="utf-8",
    )


def append_file(root: Path, rel: str, addition: str) -> None:
    path = root / rel
    path.write_text(path.read_text(encoding="utf-8") + addition, encoding="utf-8")


def expect_failure(label: str, failures: list[str], expected: str) -> None:
    assert any(expected in failure for failure in failures), (
        f"{label}: expected {expected!r}, found {failures!r}"
    )


def assert_clean(label: str, failures: list[str]) -> None:
    assert not failures, f"{label}: unexpected failures: {failures!r}"


def test_parked_consultancy_surface() -> None:
    """Keep the public site an open-source index with no engagement route."""
    homepage = read_text(ROOT, "index.html")
    homepage_root = core.parse_structure(homepage)
    homepage_hrefs = core.anchor_hrefs(homepage)
    homepage_ids = {
        element.attr("id")
        for element in core.descendants(homepage_root, rendered_only=True)
    }
    assert "engage" not in homepage_ids
    assert "/#engage" not in homepage_hrefs
    assert "Discuss a workflow" not in core.visible_text(homepage)

    for rel in ("about/index.html", "contact/index.html"):
        page = read_text(ROOT, rel)
        page_text = core.visible_text(page)
        assert "mailto:" not in page.casefold(), f"{rel}: consultancy email route remains"
        assert "not a practice" in page_text.casefold(), f"{rel}: practice boundary missing"
        assert (
            "not accepting professional engagements through this site"
            in page_text.casefold()
        ), f"{rel}: engagement boundary missing"

    llms = read_text(ROOT, "llms.txt")
    route_section = core.markdown_section(llms, "Choose a route")
    assert "**Engage**" not in route_section
    assert "firm workflow" not in llms.casefold()
    assert "not accepting professional engagements through this site" in llms.casefold()

    for path in core.html_files(ROOT):
        rel = path.relative_to(ROOT).as_posix()
        if rel in {"changelog/index.html", "engage/index.html"}:
            continue
        public_html = path.read_text(encoding="utf-8")
        assert "/#engage" not in public_html.casefold(), f"{rel}: Engage URL remains"
        assert "firm workflow or controlled pilot" not in public_html.casefold(), (
            f"{rel}: firm-workflow route remains"
        )

    redirect = ROOT / "engage" / "index.html"
    assert redirect.is_file(), "engage/index.html: quiet redirect page missing"
    assert_clean(
        "retired Engage route",
        contracts.check_static_redirect(
            redirect.read_text(encoding="utf-8"),
            "engage/index.html",
            "https://duguid.com.au/",
        ),
    )


def page_metadata_failures(root: Path, rel: str) -> list[str]:
    """Run the configured metadata checks for one page under an arbitrary root."""
    social_image, social_alt = contracts.social_metadata_for_page(rel)
    return core.check_file_metadata(
        root / rel,
        site=contracts.SITE,
        not_indexed=contracts.NOT_INDEXED,
        title_exceptions=contracts.TITLE_EXCEPTIONS,
        warnings=[],
        expected_social_image=social_image,
        expected_social_alt=social_alt,
        description_limits=(
            contracts.TIGHT_META_DESCRIPTION_LIMITS
            if rel in contracts.TIGHT_META_DESCRIPTION_PAGES
            else None
        ),
        root=root,
    )


def check_metadata_text(html: str, rel: str, failures: list[str]) -> None:
    """Run the share and referrer contracts directly against mutated HTML."""
    canonical_match = re.search(r'<link rel="canonical" href="(.*?)"', html)
    canonical = canonical_match.group(1) if canonical_match else None
    social_image, social_alt = contracts.social_metadata_for_page(rel)
    assert social_image is not None and social_alt is not None
    core.check_social_metadata(
        html,
        rel,
        description=core.meta(html, "name", "description"),
        canonical=canonical,
        expected_image=social_image,
        expected_alt=social_alt,
        failures=failures,
    )
    if re.search(r'<link\s+rel="stylesheet"(?:\s|/?>)', html):
        core.check_referrer_policy(html, rel, failures)


def test_design_contracts() -> int:
    """Exercise the main design boundaries against copies of the real site."""
    assert_clean("current design", check_design.check_repository(ROOT))

    with copied_site() as root:
        replace_file(
            root,
            "rates/super-guarantee/index.html",
            '<li><a href="/rates/">Rates</a></li>',
            '<li><a href="/rates-copy/">Rates</a></li>',
        )
        assert_clean(
            "rate breadcrumb is outside the protected content digest",
            check_design.check_repository(root),
        )

    text_mutations = (
        (
            "protected rate copy",
            "rates/super-guarantee/index.html",
            "<strong>12%</strong>",
            "<strong>13%</strong>",
            "protected main text changed: rates/super-guarantee/index.html",
        ),
        (
            "protected source link",
            "rates/super-guarantee/index.html",
            "https://www.ato.gov.au/tax-rates-and-codes/key-superannuation-rates-and-thresholds/super-guarantee",
            "https://example.invalid/rate",
            "protected main links changed: rates/super-guarantee/index.html",
        ),
        (
            "structured data drift",
            "index.html",
            '"@type": "WebPage",\n        "@id": "https://duguid.com.au/#webpage"',
            '"@type": "Article",\n        "@id": "https://duguid.com.au/#webpage"',
            "JSON-LD changed: index.html",
        ),
        (
            "legal boundary drift",
            "index.html",
            "Nothing here is tax, legal or financial advice. Computational outputs are review aids for a qualified professional, not compliance determinations, and lodgement decisions stay with a human.",
            "Nothing here is tax, legal or financial advice. Outputs need review.",
            "protected text count changed",
        ),
        (
            "font loading regression",
            "assets/tokens.css",
            "font-display: optional;",
            "font-display: swap;",
            "font face 1 must use font-display: optional",
        ),
        (
            "font coverage removed",
            "assets/tokens.css",
            "unicode-range:",
            "unicode-ranges:",
            "font face 1 must declare unicode-range",
        ),
        (
            "OLED canvas drift",
            "assets/tokens.css",
            "--colour-canvas: #000000;",
            "--colour-canvas: #010101;",
            "OLED canvas must be #000000",
        ),
        (
            "mobile wrapping removed",
            "assets/site.css",
            "overflow-wrap: anywhere;",
            "overflow-wrap: normal;",
            "body must wrap unbroken identifiers at the 320px boundary",
        ),
        (
            "interaction timing drift",
            "assets/site.css",
            "transition:\n    color var(--motion-standard) var(--ease-standard),\n    text-decoration-color var(--motion-standard) var(--ease-standard);",
            "transition:\n    color var(--motion-fast) var(--ease-standard),\n    text-decoration-color var(--motion-fast) var(--ease-standard);",
            "links and controls must use the standard motion duration",
        ),
        (
            "token stylesheet removed",
            "index.html",
            '<link rel="stylesheet" href="/assets/tokens.css" />',
            "",
            "index.html: expected one tokens stylesheet before site stylesheet",
        ),
        (
            "machine index removed",
            "index.html",
            '<a href="/llms.txt">Machine-readable index</a>',
            "",
            "index.html: expected one visible machine-readable index link",
        ),
        (
            "hero action drift",
            "index.html",
            'class="button" href="/tools/"',
            'class="button" href="/missing-tools/"',
            "index.html: expected exactly one /tools/ homepage action",
        ),
        (
            "trust record drift",
            "index.html",
            "Human sign-off.",
            "Human sign-off changed.",
            "index.html: trust-band records must match the approved four-item tuple",
        ),
        (
            "category preview removed",
            "index.html",
            "home-tool-preview",
            "removed-tool-preview",
            "index.html: expected one home-tool-preview",
        ),
        (
            "extra technical label",
            "index.html",
            "</main>",
            '<p class="technical-label">Extra context</p></main>',
            "index.html: expected exactly three evidence-bearing technical labels",
        ),
        (
            "proof loaded eagerly",
            "index.html",
            'loading="lazy"',
            'loading="eager"',
            "index.html: Coal LSL proof image must load lazily",
        ),
        (
            "proof dimensions drift",
            "index.html",
            'height="580"',
            'height="581"',
            "index.html: Coal LSL proof image must keep its height",
        ),
        (
            "proof mobile source removed",
            "index.html",
            '<source media="(max-width: 40rem)" srcset="/assets/coal-lsl-calculator-mobile.webp"',
            '<source media="(max-width: 40rem)" srcset="/assets/missing-mobile.webp"',
            "index.html: Coal LSL proof picture must offer the mobile source",
        ),
        (
            "proof alternative removed",
            "index.html",
            'alt="Coal LSL calculator result showing Formula B, eligible wages, levy and the applied section 3B branch for a synthetic example"',
            'alt=""',
            "index.html: Coal LSL proof image must have descriptive alt text",
        ),
        (
            "font URL broken",
            "assets/tokens.css",
            "/assets/fonts/IBMPlexSerif-Regular-Latin1.woff2",
            "/assets/fonts/Missing.woff2",
            "font face target missing: assets/fonts/Missing.woff2",
        ),
        (
            "favicon palette drift",
            "assets/favicon.svg",
            "#4dff88",
            "#5c2d91",
            "favicon colour outside OLED palette: #5c2d91",
        ),
        (
            "byline warning colour restored",
            "assets/site.css",
            ".byline {\n  padding: var(--space-4) 0 var(--space-4) var(--space-5);\n  border-left: var(--rule-strong) solid var(--colour-rule-strong);",
            ".byline {\n  padding: var(--space-4) 0 var(--space-4) var(--space-5);\n  border-left: var(--rule-strong) solid var(--colour-alert);",
            "bylines must use the neutral register rule",
        ),
        (
            "informational route note warning colour restored",
            "assets/site.css",
            ".route-note {\n  padding: var(--space-4) 0 var(--space-4) var(--space-5);\n  border-left: var(--rule-strong) solid var(--colour-rule-strong);",
            ".route-note {\n  padding: var(--space-4) 0 var(--space-4) var(--space-5);\n  border-left: var(--rule-strong) solid var(--colour-alert);",
            "informational route notes must use the neutral register rule",
        ),
        (
            "boundary route note neutral colour restored",
            "assets/site.css",
            ".route-note.boundary {\n  border-left-color: var(--colour-alert);",
            ".route-note.boundary {\n  border-left-color: var(--colour-rule-strong);",
            "boundary route notes must retain the alert rule",
        ),
        (
            "homepage opening review date moved",
            "index.html",
            '<p class="page-meta">Last reviewed 31 August 2026.</p>',
            '<p class="moved-page-meta">Last reviewed 31 August 2026.</p>',
            "index.html: expected exactly one opening page-meta",
        ),
        (
            "Tools opening review date moved",
            "tools/index.html",
            '<p class="page-meta">Last reviewed 30 August 2026.</p>',
            '<p class="moved-page-meta">Last reviewed 30 August 2026.</p>',
            "tools/index.html: expected exactly one opening page-meta",
        ),
        (
            "Evidence opening review date moved",
            "evidence/index.html",
            '<p class="page-meta">Last reviewed 30 August 2026.</p>',
            '<p class="moved-page-meta">Last reviewed 30 August 2026.</p>',
            "evidence/index.html: expected exactly one opening page-meta",
        ),
    )

    for label, rel, old, new, expected in text_mutations:
        with copied_site() as root:
            replace_file(root, rel, old, new)
            expect_failure(label, check_design.check_repository(root), expected)

    review_date_paths = (
        ("index.html", "31 August 2026", "2026-08-31"),
        ("tools/index.html", "30 August 2026", "2026-08-30"),
        ("evidence/index.html", "30 August 2026", "2026-08-30"),
    )
    for rel, visible_date, structured_date in review_date_paths:
        with copied_site() as root:
            replace_file(
                root,
                rel,
                f"Last reviewed {visible_date}.",
                "Last reviewed 1 September 2026.",
            )
            expect_failure(
                f"{rel} review date disagrees with structured freshness",
                check_design.check_opening_review_dates(root),
                "does not match JSON-LD dateModified",
            )

        with copied_site() as root:
            replace_file(
                root,
                rel,
                f"Last reviewed {visible_date}.",
                "Last reviewed 1 September 2026.",
            )
            replace_file(
                root,
                rel,
                f'"dateModified": "{structured_date}"',
                '"dateModified": "2026-09-01"',
            )
            assert_clean(
                f"{rel} accepts a matching future review date",
                check_design.check_opening_review_dates(root),
            )

    with copied_site() as root:
        append_file(
            root,
            "assets/site.css",
            "\n.mutation-gradient { background: linear-gradient(#000, #fff); }\n",
        )
        expect_failure(
            "banned gradient",
            check_design.check_repository(root),
            "banned CSS pattern linear-gradient",
        )

    with copied_site() as root:
        (root / "assets/coal-lsl-calculator.webp").write_bytes(b"not-a-webp")
        expect_failure(
            "invalid proof image",
            check_design.check_repository(root),
            "assets/coal-lsl-calculator.webp: proof image is not a WebP container",
        )

    with copied_site() as root:
        (root / "assets/fonts/IBMPlexSerif-Regular-Latin1.woff2").unlink()
        expect_failure(
            "protected font removed",
            check_design.check_repository(root),
            "protected font missing: assets/fonts/IBMPlexSerif-Regular-Latin1.woff2",
        )

    with copied_site() as root:
        append_file(
            root,
            "assets/site.css",
            "\n.route-section > h2 { position: sticky; }\n",
        )
        expect_failure(
            "sticky route rail restored",
            check_design.check_repository(root),
            "route labels must not be sticky",
        )

    return len(text_mutations) + 5 + (2 * len(review_date_paths))


def contract_mutation(
    label: str,
    source: str,
    old: str,
    new: str,
    checker,
    expected: str,
) -> None:
    failures: list[str] = []
    checker(changed_text(source, old, new), failures)
    expect_failure(label, failures, expected)


def test_public_contracts() -> int:
    """Characterise high-value SEO, accessibility and authority contracts."""
    home = read_text(ROOT, "index.html")
    calculator = read_text(ROOT, contracts.CALCULATOR_REL)
    evidence = read_text(ROOT, contracts.EVIDENCE_REL)
    payday = read_text(ROOT, "tools/payday-super/index.html")
    xero = read_text(ROOT, "tools/xero-trial-balance/index.html")
    robots = read_text(ROOT, "robots.txt")

    html_paths = core.html_files(ROOT)
    indexed_rels = [
        path.relative_to(ROOT).as_posix()
        for path in html_paths
        if path.relative_to(ROOT).as_posix() not in contracts.NOT_INDEXED
    ]
    assert len(indexed_rels) == 24, (
        f"expected 24 canonical HTML pages, found {len(indexed_rels)}"
    )
    metadata_failures = [
        failure
        for path in html_paths
        for failure in page_metadata_failures(
            ROOT, path.relative_to(ROOT).as_posix()
        )
    ]
    assert_clean("complete page metadata", metadata_failures)

    failures: list[str] = []
    contracts.check_homepage_contract(home, failures)
    contracts.check_shared_shell(home, "index.html", failures)
    contracts.check_calculator_contract(calculator, failures)
    contracts.check_article_pattern(evidence, contracts.EVIDENCE_REL, failures)
    contracts.check_rate_table_region(
        read_text(ROOT, "rates/super-guarantee/index.html"),
        "rates/super-guarantee/index.html",
        failures,
    )
    assert_clean("page contracts", failures)
    assert_clean("evidence surface", contracts.check_evidence_page(ROOT))
    assert_clean("authority surface", contracts.check_authority_surface(ROOT))

    github_agent_skills_route = (
        "https://github.com/ryanduguid/github-agent-skills",
        "git clone https://github.com/ryanduguid/github-agent-skills.git",
        "cd github-agent-skills",
        "pwsh -File scripts/sync-skills.ps1",
        "github-agent-skills supplies GitHub maintenance workflows for Codex and "
        "Claude Code while preserving fabricated-data and human-review boundaries.",
    )
    home_text = core.visible_text(home)
    assert "Four supported adoption routes" in home_text, (
        "index.html: github-agent-skills adoption band must name four supported "
        "adoption routes"
    )
    for required in github_agent_skills_route:
        assert required in home_text, (
            "index.html: missing github-agent-skills adoption route "
            f"requirement {required!r}"
        )
    with copied_site() as root:
        replace_file(
            root,
            "index.html",
            "pwsh -File scripts/sync-skills.ps1",
            "pwsh -File scripts/sync-skills-copy.ps1",
        )
        expect_failure(
            "github-agent-skills bootstrap command",
            contracts.check_authority_surface(root),
            "index.html: install commands must appear only inside #adopt",
        )
    with copied_site() as root:
        replace_file(
            root,
            "index.html",
            github_agent_skills_route[-1],
            "github-agent-skills changes the maintenance workflow.",
        )
        expect_failure(
            "github-agent-skills boundary",
            contracts.check_authority_surface(root),
            "index.html: github-agent-skills boundary must be",
        )

    assert_clean("evaluation packs", contracts.check_evaluation_packs(ROOT))
    assert_clean("collection hubs", contracts.check_collection_hubs(ROOT))
    assert_clean("social cards", contracts.check_social_cards(ROOT))
    assert_clean("robots policy", contracts.check_robots_policy(robots))
    assert_clean("payday receipt boundary", contracts.check_payday_receipt_boundary(payday))
    assert_clean(
        "AI-agent review date",
        contracts.check_mcp_review_dates(
            read_text(ROOT, contracts.MCP_REL)
        ),
    )
    sitemap_failures, _ = core.check_sitemap(
        core.html_files(ROOT),
        site=contracts.SITE,
        not_indexed=contracts.NOT_INDEXED,
        root=ROOT,
    )
    assert_clean("sitemap and machine-index coverage", sitemap_failures)

    parse_failures: list[str] = []
    about = read_text(ROOT, "about/index.html")
    people = [
        node
        for block in core.json_ld_blocks(about, "about/index.html", parse_failures)
        for node in core.nodes(block)
        if core.has_type(node, "Person")
    ]
    assert_clean("About JSON-LD", parse_failures)
    assert len(people) == 1, f"expected one canonical Person, found {len(people)}"
    assert_clean("canonical Person", contracts.check_canonical_person(people[0]))
    changed_person = dict(people[0])
    changed_person["sameAs"] = list(reversed(changed_person["sameAs"]))
    expect_failure(
        "canonical identity order",
        contracts.check_canonical_person(changed_person),
        "Person sameAs must contain only",
    )
    contract_mutation(
        "About opening",
        about,
        contracts.ABOUT_OPENING,
        "I build software.",
        lambda html, found: contracts.check_approved_page_opening(
            html, "about/index.html", found
        ),
        "about/index.html: page opening must be",
    )
    contract_mutation(
        "Evidence opening",
        evidence,
        contracts.EVIDENCE_OPENING,
        "This register links claims.",
        lambda html, found: contracts.check_approved_page_opening(
            html, contracts.EVIDENCE_REL, found
        ),
        "evidence/index.html: page opening must be",
    )

    homepage_mutations = (
        (
            "homepage title",
            "<title>Open-source Australian accounting tools | Ryan Duguid</title>",
            "<title>Wrong homepage title</title>",
            "index.html: homepage title is",
        ),
        (
            "homepage description",
            contracts.HOMEPAGE_DESCRIPTION,
            "Wrong homepage description",
            "index.html: homepage description is",
        ),
        (
            "homepage heading",
            f'<h1 id="home-title">{contracts.HOMEPAGE_HEADING}</h1>',
            '<h1 id="home-title">Controls for accounting work.</h1>',
            "index.html: homepage H1 must be",
        ),
        (
            "homepage primary action",
            "Browse the tools",
            "Browse every tool",
            "index.html: homepage actions are",
        ),
        (
            "homepage category anchor",
            'href="/tools/#control-tools"',
            'href="/tools/#missing-control-tools"',
            "index.html: category preview is",
        ),
        (
            "homepage Adopt anchor",
            'id="adopt"',
            'id="adopt-copy"',
            "index.html: expected exactly one valid #adopt anchor",
        ),
        (
            "homepage evaluation route",
            'href="/evaluate/payday-super-evidence/"',
            'href="/missing-evaluation/"',
            "missing visible homepage route /evaluate/payday-super-evidence/",
        ),
        (
            "proof evidence route",
            '<a href="/evidence/">Review the evidence register</a>',
            '<a href="/missing-evidence/">Review the evidence register</a>',
            "proof feature is missing required link /evidence/",
        ),
    )
    for label, old, new, expected in homepage_mutations:
        contract_mutation(
            label,
            home,
            old,
            new,
            contracts.check_homepage_contract,
            expected,
        )

    metadata_mutations = (
        (
            "Open Graph field",
            '  <meta property="og:image:height" content="630" />\n',
            "",
            "expected exactly one non-empty og:image:height",
        ),
        (
            "Twitter field",
            '  <meta name="twitter:image:alt" content="OLED register card: Review-ready controls for Australian accounting work." />\n',
            "",
            "expected exactly one non-empty twitter:image:alt",
        ),
        (
            "canonical and Open Graph URL",
            '<meta property="og:url" content="https://duguid.com.au/" />',
            '<meta property="og:url" content="https://duguid.com.au/copy/" />',
            "og:url is 'https://duguid.com.au/copy/'",
        ),
        (
            "social-card context",
            '<meta property="og:image" content="https://duguid.com.au/assets/social-card-site.png" />',
            '<meta property="og:image" content="https://duguid.com.au/assets/social-card-tools.png" />',
            "og:image is 'https://duguid.com.au/assets/social-card-tools.png'",
        ),
        (
            "referrer policy",
            '  <meta name="referrer" content="strict-origin-when-cross-origin" />\n',
            "",
            "referrer policy is []",
        ),
        (
            "Open Graph description mirror",
            f'<meta property="og:description" content="{contracts.HOMEPAGE_DESCRIPTION}" />',
            '<meta property="og:description" content="Different share description." />',
            "og:description is 'Different share description.'",
        ),
        (
            "Twitter title mirror",
            '<meta name="twitter:title" content="Open-source Australian accounting tools | Ryan Duguid" />',
            '<meta name="twitter:title" content="Different share title" />',
            "twitter:title is 'Different share title'",
        ),
    )
    for label, old, new, expected in metadata_mutations:
        contract_mutation(
            label,
            home,
            old,
            new,
            lambda html, found: check_metadata_text(html, "index.html", found),
            expected,
        )

    payday_description = (
        "Check whether super reaches the fund within seven business days of payday "
        "from 1 July 2026, and estimate the SG charge for review."
    )
    short_payday_description = (
        "Check Payday Super timing from payroll exports and estimate the SG charge "
        "for review, with fund receipt status visible."
    )
    assert payday.count(payday_description) == 3, (
        "Payday Super metadata must reuse its canonical description three times"
    )
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        rel = "tools/payday-super/index.html"
        path = root / rel
        path.parent.mkdir(parents=True)
        path.write_text(
            payday.replace(payday_description, short_payday_description),
            encoding="utf-8",
        )
        expect_failure(
            "tight description range",
            page_metadata_failures(root, rel),
            "outside required 120 to 155",
        )

    calculator_mutations = (
        (
            "calculator blank policy",
            contracts.CALCULATOR_COMMON_HELP,
            "Blank monetary amounts are accepted.",
            "form must contain one exact blank-as-zero note",
        ),
        (
            "calculator monetary help",
            'aria-describedby="money-blank-help baseRate-help"',
            'aria-describedby="baseRate-help"',
            "#baseRate aria-describedby must retain common and field-specific help",
        ),
        (
            "calculator reporting month required",
            'id="reportingMonth" name="reportingMonth" required',
            'id="reportingMonth" name="reportingMonth"',
            "#reportingMonth must have required",
        ),
        (
            "calculator print action",
            '>Print working</button>',
            '>Print result</button>',
            "result actions are",
        ),
        (
            "calculator privacy warning",
            contracts.CALCULATOR_PRIVACY_WARNING,
            "Enter an employee name or identifier.",
            "missing visible direct-identifier warning",
        ),
        (
            "calculator CSV action",
            '>Download CSV</button>',
            '>Export CSV</button>',
            "missing visible CSV action",
        ),
        (
            "calculator zero explanation",
            contracts.CALCULATOR_BLANK_RESULT_EXPLANATION,
            "Blank values were zero.",
            "zero result needs the blank-as-zero explanation",
        ),
        (
            "calculator field name",
            'id="sacrificed" name="sacrificed"',
            'id="sacrificed" name="sacrificed-broken"',
            "#sacrificed name must be 'sacrificed'",
        ),
        (
            "calculator branch values",
            'name="branch" value="baseRate"',
            'name="branch" value="wrong"',
            "branch radio contract changed",
        ),
        (
            "calculator result status",
            'id="result" role="status"',
            'id="result" role="region"',
            "#result must be a polite status region",
        ),
        (
            "calculator engine import",
            "from '/assets/levy.mjs'",
            "from '/assets/levy-copy.mjs'",
            "protected levy engine import changed",
        ),
    )
    for label, old, new, expected in calculator_mutations:
        contract_mutation(
            label,
            calculator,
            old,
            new,
            contracts.check_calculator_contract,
            expected,
        )

    contract_mutation(
        "article contents navigator",
        evidence,
        'aria-label="On this page"',
        'aria-label="Contents"',
        lambda html, found: contracts.check_article_pattern(
            html, contracts.EVIDENCE_REL, found
        ),
        "expected exactly one On this page navigation",
    )
    contract_mutation(
        "shared skip link",
        home,
        'class="skip-link" href="#main"',
        'class="skip-link" href="#content"',
        lambda html, found: contracts.check_shared_shell(html, "index.html", found),
        "expected exactly one .skip-link targeting #main",
    )
    contract_mutation(
        "contact dropped from primary navigation",
        home,
        '<a href="/contact/">Contact</a>',
        '<a href="/contact-us/">Contact</a>',
        lambda html, found: contracts.check_shared_shell(html, "index.html", found),
        "index.html: primary navigation is",
    )
    contract_mutation(
        "tool review date outside header",
        xero,
        '<p class="page-meta">Published 24 August 2026. Last reviewed 30 August 2026.</p>',
        '<p class="moved-page-meta">Published 24 August 2026. Last reviewed 30 August 2026.</p>',
        lambda html, found: contracts.check_header_review_date(
            html, "tools/xero-trial-balance/index.html", found
        ),
        "Published/Last reviewed line must be in the page header",
    )

    def xero_breadcrumb_failures(root: Path) -> list[str]:
        found: list[str] = []
        contracts.check_collection_breadcrumb(
            read_text(root, "tools/xero-trial-balance/index.html"),
            "tools/xero-trial-balance/index.html",
            found,
        )
        return found

    collection_mutations = (
        (
            "missing Tools hub",
            "tools/index.html",
            None,
            None,
            contracts.check_collection_hubs,
            "tools/index.html: missing collection hub",
        ),
        (
            "tool breadcrumb parent",
            "tools/xero-trial-balance/index.html",
            '<li><a href="/tools/">Tools</a></li>',
            '<li><a href="/">Tools</a></li>',
            xero_breadcrumb_failures,
            "breadcrumb 'Tools' points to '/', expected '/tools/'",
        ),
        (
            "hub ItemList count",
            "tools/index.html",
            '"numberOfItems": 10',
            '"numberOfItems": 9',
            contracts.check_collection_hubs,
            "tools/index.html: ItemList count does not match visible entries",
        ),
    )
    for label, rel, old, new, checker, expected in collection_mutations:
        with copied_site() as root:
            if old is None:
                (root / rel).unlink()
            else:
                replace_file(root, rel, old, new)
            expect_failure(label, checker(root), expected)

    site_card_rel = "assets/social-card-site.png"
    with copied_site() as root:
        card_path = root / site_card_rel
        card = bytearray(card_path.read_bytes())
        struct.pack_into(">I", card, 16, 1199)
        card_path.write_bytes(card)
        expect_failure(
            "social card dimensions",
            contracts.check_social_cards(root),
            f"{site_card_rel}: social card dimensions changed",
        )

    with copied_site() as root:
        card_path = root / site_card_rel
        card = card_path.read_bytes()
        card_path.write_bytes(
            card + b"\0" * (contracts.SOCIAL_CARD_MAX_BYTES - len(card))
        )
        expect_failure(
            "social card byte budget",
            contracts.check_social_cards(root),
            f"{site_card_rel}: social card must be under 50,000 bytes",
        )

    with copied_site() as root:
        replace_file(
            root,
            "assets/social-cards.json",
            "Review-ready controls",
            "Review controls",
        )
        expect_failure(
            "social card context copy",
            contracts.check_social_cards(root),
            "social-card context copy or mapping is stale",
        )

    with copied_site() as root:
        card = (root / site_card_rel).read_bytes()
        replace_file(
            root,
            "README.md",
            hashlib.sha256(card).hexdigest(),
            "0" * 64,
        )
        expect_failure(
            "social card checksum",
            contracts.check_social_cards(root),
            f"README.md: stale checksum for {site_card_rel}",
        )

    with copied_site() as root:
        replace_file(
            root,
            "sitemap.xml",
            "</urlset>",
            "  <url><loc>https://duguid.com.au/llms.txt</loc></url>\n</urlset>",
        )
        failures, _ = core.check_sitemap(
            core.html_files(root),
            site=contracts.SITE,
            not_indexed=contracts.NOT_INDEXED,
            root=root,
        )
        expect_failure(
            "machine index in XML sitemap",
            failures,
            "sitemap.xml: lists https://duguid.com.au/llms.txt",
        )

    invalid_receipt = '<p>Without a fund receipt date, a line can only be "at risk".</p>'
    expect_failure(
        "categorical missing-receipt claim",
        contracts.check_payday_receipt_boundary(invalid_receipt),
        "must not say a missing receipt can only be at-risk or unknown",
    )
    changed_robots = changed_text(
        robots,
        "User-agent: GPTBot\nDisallow: /",
        "User-agent: GPTBot\nAllow: /",
    )
    expect_failure(
        "training crawler opened",
        contracts.check_robots_policy(changed_robots),
        "robots.txt: GPTBot must have exactly",
    )

    authority_mutations = (
        (
            "evidence canonical",
            "evidence/index.html",
            '<link rel="canonical" href="https://duguid.com.au/evidence/" />',
            '<link rel="canonical" href="https://duguid.com.au/evidence-copy/" />',
            contracts.check_evidence_page,
            "evidence/index.html: canonical is",
        ),
        (
            "authority route",
            "index.html",
            'id="verify"',
            'id="missing-verify"',
            contracts.check_authority_surface,
            "index.html: missing visible authority section #verify",
        ),
        (
            "evaluation section order",
            "evaluate/manager-review-gate/index.html",
            'id="versions"',
            'id="releases"',
            contracts.check_evaluation_packs,
            "evaluation section order must be",
        ),
    )
    for label, rel, old, new, checker, expected in authority_mutations:
        with copied_site() as root:
            replace_file(root, rel, old, new)
            expect_failure(label, checker(root), expected)

    return len(homepage_mutations) + len(calculator_mutations) + 30


def main() -> None:
    test_parked_consultancy_surface()
    design_count = test_design_contracts()
    public_count = test_public_contracts()
    print(
        f"contract tests passed ({design_count} design mutations, "
        f"{public_count} public-contract mutations)"
    )


if __name__ == "__main__":
    main()
