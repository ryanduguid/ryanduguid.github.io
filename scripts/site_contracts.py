"""Ryan Duguid site-specific SEO and content contracts."""

from __future__ import annotations

import hashlib
import html as html_lib
import json
import re
import struct
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path
from urllib.parse import urlsplit

import seo_core as core

SITE = "https://duguid.com.au"
STATIC_REDIRECTS = {
    "engage/index.html": "https://duguid.com.au/",
    "tools/review-ready-gate/index.html": (
        "https://duguid.com.au/tools/workpaper-review-gate/"
    ),
}
NOT_INDEXED = {"404.html"} | set(STATIC_REDIRECTS)

PERSON_ID = f"{SITE}/about/#person"
EVIDENCE_REL = "evidence/index.html"
EVIDENCE_URL = f"{SITE}/evidence/"
TITLE_EXCEPTIONS: dict[str, str] = {}
AUTHORITY_PATHS = {
    "adopt": "Adopt",
    "verify": "Verify",
}
AUTHORITY_STATEMENTS = {
    "adopt": "Test it with fabricated data first.",
    "verify": "Check the source before the result.",
}
AUTHORITY_URLS = {
    "adopt": f"{SITE}/#adopt",
    "verify": EVIDENCE_URL,
}
CODEX_MCP_INSTALL_PATTERN = (
    r"\bcodex\s+mcp\s+add\s+aus-accounting\s+--\s+uvx\s+aus-accounting-mcp\b"
)
GITHUB_AGENT_SKILLS_URL = "https://github.com/ryanduguid/github-agent-skills"
GITHUB_AGENT_SKILLS_BOUNDARY = (
    "github-agent-skills gives Codex and Claude Code the GitHub maintenance workflows "
    "this portfolio uses, and keeps the fabricated-data and human-review boundaries."
)
GITHUB_AGENT_SKILLS_INSTALL_PATTERN = (
    r"\bgit\s+clone\s+https://github\.com/ryanduguid/github-agent-skills\.git\s+"
    r"cd\s+github-agent-skills\s+pwsh\s+-File\s+scripts/sync-skills\.ps1\b"
)
PRIMARY_INSTALL_PATTERNS = (
    r"\bclaude\s+mcp\s+add\s+aus-accounting\s+--\s+uvx\s+aus-accounting-mcp\b",
    CODEX_MCP_INSTALL_PATTERN,
    r"\bnpx\s+skills\s+add\s+ryanduguid/australian-accounting-skills\b",
    GITHUB_AGENT_SKILLS_INSTALL_PATTERN,
)
RETIRED_GITHUB_SOURCE_INSTALL_PATTERN = (
    r"\bclaude\s+mcp\s+add\s+aus-accounting\s+--\s+uvx\s+--from\s*"
    r"(?:\\\s*)?git\+https://github\.com/ryanduguid/aus-accounting-mcp\s+"
    r"aus-accounting-mcp\b"
)
CA_ANZ_NON_ENDORSEMENT = (
    "Ryan Duguid states that he is a provisional member of Chartered Accountants "
    "Australia and New Zealand. CA ANZ has not endorsed this site or its tools."
)
MCP_REL = "tools/australian-tax-ai-agents/index.html"
MCP_REVIEW_DATE = "2026-09-03"
MCP_VISIBLE_REVIEW_DATE = "3 September 2026"
MCP_PAGE_INSTALL_PATTERNS = (
    r"\bclaude\s+mcp\s+add\s+aus-accounting\s+--\s+uvx\s+aus-accounting-mcp\b",
    CODEX_MCP_INSTALL_PATTERN,
)
ASSURANCE_ANCHORS = {
    "identity-and-credentials": "Identity and credentials",
    "packages-releases-and-repositories": "Packages, releases and repositories",
    "sources-and-review-dates": "Sources and review dates",
    "data-and-privacy-boundary": "Data and privacy boundary",
    "security-tests-and-release-evidence": "Security, tests and release evidence",
    "human-accountability-and-refusals": "Human accountability and refusals",
    "independent-evaluation": "Independent evaluation",
}
ASSURANCE_HEADINGS = tuple(ASSURANCE_ANCHORS.values())
AUS_ACCOUNTING_PYPI = "https://pypi.org/project/aus-accounting-mcp/"
PERSON_SAME_AS = [
    "https://github.com/ryanduguid",
    "https://www.linkedin.com/in/ryan-duguid",
]
PERSON_REQUIRED_FIELDS = {
    "name": "Ryan Duguid",
    "jobTitle": "Accountant",
    "url": f"{SITE}/about/",
}
PERSON_ADDRESS = {
    "@type": "PostalAddress",
    "addressLocality": "Newcastle",
    "addressRegion": "NSW",
    "addressCountry": "AU",
}
CURRENT_SOFTWARE_REPOSITORIES = {
    "payday-super-checker": (
        "payday-super-checker",
        "https://github.com/ryanduguid/australian-accounting/tree/main/packages/payday-super-checker",
        "Experimental tool for checking Payday Super timing and preparing exceptions for review.",
    ),
    "xero-trial-balance-export": (
        "xero-trial-balance-export",
        "https://github.com/ryanduguid/accounting-review-pipeline/tree/main/packages/xero-trial-balance-export",
        "Export reconciled Xero trial balances to validated CSV for Power BI, Excel and pandas.",
    ),
    "Ozzit": (
        "ozzit",
        "https://github.com/ryanduguid/Ozzit",
        "134 native Excel LAMBDA functions for AU modelling and GST arithmetic.",
    ),
    "accounting-excel-toolkit": (
        "accounting-excel-toolkit",
        "https://github.com/ryanduguid/accounting-review-pipeline/tree/main/adapters/accounting-excel-toolkit",
        "Power Query and VBA utilities for Australian ledger work.",
    ),
    "aus-accounting-mcp": (
        "aus-accounting-mcp",
        "https://github.com/ryanduguid/australian-accounting/tree/main/apps/aus-accounting-mcp",
        "Local MCP server for Australian accounting review: ATO small-business "
        "benchmarks, Payday Super 2026, refused Division 7A and synthetic SBR "
        "fixtures. Not advice.",
    ),
    "australian-accounting-skills": (
        "australian-accounting-skills",
        "https://github.com/ryanduguid/australian-accounting-skills",
        "Claude Code and Codex skills for Australian public-practice workflows. "
        "Not lodgement.",
    ),
    "workpaper-review-gate": (
        "workpaper-review-gate",
        "https://github.com/ryanduguid/accounting-review-pipeline/tree/main/packages/review-ready-gate",
        "Stop incomplete workpapers reaching manager review. Deterministic readiness "
        "gate for Australian public-practice packs. Not advice.",
    ),
    "australian-accounting-power-bi": (
        "australian-accounting-power-bi",
        "https://github.com/ryanduguid/accounting-review-pipeline/tree/main/apps/australian-accounting-power-bi",
        "Source-controlled Power BI project for Australian accounting analytics, "
        "consolidation, ATO benchmarks and Payday Super review.",
    ),
    "monthly-close-controls": (
        "monthly-close-controls",
        "https://github.com/ryanduguid/accounting-review-pipeline/tree/main/packages/monthly-close-control-plane",
        "Deterministic monthly-close controls for Xero-shaped trial-balance exports, "
        "exception packs and human review.",
    ),
    "au-tax-legislation-corpus": (
        "au-tax-legislation-corpus",
        "https://github.com/ryanduguid/au-tax-legislation-corpus",
        "Provenance-rich corpus of in-force Commonwealth tax legislation.",
    ),
}
# A component source URL retains its own licence inside the monorepo.
AUTHORED_SOFTWARE = {
    name: {
        "id": f"{SITE}/#software-{slug}",
        "repository": repository,
        "license": (
            f"{repository.replace('/tree/main/', '/blob/main/')}/LICENSE"
            if "/tree/main/" in repository
            else f"{repository}/blob/main/LICENSE"
        ),
        "description": description,
    }
    for name, (slug, repository, description) in CURRENT_SOFTWARE_REPOSITORIES.items()
}
RETRIEVAL_CRAWLERS = {
    "Googlebot",
    "Bingbot",
    "OAI-SearchBot",
    "ChatGPT-User",
    "Claude-SearchBot",
    "Claude-Search",
    "Claude-User",
    "PerplexityBot",
    "Applebot",
    "YouBot",
    "anthropic-ai",
    "Claude-Web",
}
TRAINING_CRAWLERS = {
    "GPTBot",
    "ClaudeBot",
    "Google-Extended",
    "Applebot-Extended",
    "CCBot",
    "Bytespider",
    "Amazonbot",
    "cohere-ai",
    "Diffbot",
    "FacebookBot",
    "meta-externalagent",
}
UNCLASSIFIED_CRAWLERS: set[str] = set()
CRAWLER_POLICY_COMMENTS = (
    "Search indexing and user-requested citation fetches are allowed. "
    "Named training crawlers remain blocked.",
    "Unnamed agents must not silently redefine this policy; named rows state "
    "the intended treatment.",
)


def check_static_redirect(html: str, rel: str, target: str) -> list[str]:
    target_path = urlsplit(target).path or "/"
    failures = []
    for marker in (
        '<meta name="robots" content="noindex, follow" />',
        f'<link rel="canonical" href="{target}" />',
    ):
        if marker not in html:
            failures.append(f"{rel}: missing redirect marker {marker}")
    refresh_targets = {target, target_path}
    if not any(
        f'<meta http-equiv="refresh" content="0; url={candidate}" />' in html
        for candidate in refresh_targets
    ):
        failures.append(f"{rel}: missing immediate redirect to {target}")
    if not set(core.anchor_hrefs(html)).intersection(refresh_targets):
        failures.append(f"{rel}: missing fallback link to {target}")
    return failures


WORKED_EXAMPLES = {
    "tools/payday-super/index.html": {
        "fixture_urls": [
            "https://github.com/ryanduguid/australian-accounting/blob/"
            "8e9bd7235030b2c42bc8f2e7d2e8a60dce627182/packages/payday-super-checker/"
            "tests/test_integration.py#L849-L901"
        ],
        "labels": {
            "on-time": r"\bon[-_ ]time\b",
            "late": r"\blate\b",
            "at-risk or unknown": r"\b(?:at[-_ ]risk|unknown)\b",
        },
    },
    "tools/xero-trial-balance/index.html": {
        "fixture_urls": [
            "https://github.com/ryanduguid/accounting-review-pipeline/blob/"
            "3ae854911bf36f00bd3cc3eeafd1855848896629/packages/xero-trial-balance-export/"
            "tests/test_export_tb.py#L191-L210",
            "https://github.com/ryanduguid/accounting-review-pipeline/blob/"
            "3ae854911bf36f00bd3cc3eeafd1855848896629/packages/xero-trial-balance-export/"
            "tests/test_export_tb.py#L421-L433",
        ],
        "labels": {
            "balanced": r"\bbalanced\b",
            "write": r"\b(?:write|writes|written)\b",
            "unbalanced": r"\bunbalanced\b",
            "refused": r"\brefus\w*\b",
        },
    },
}
EVALUATION_PACKS = {
    "evaluate/manager-review-gate/index.html": {
        "url": f"{SITE}/evaluate/manager-review-gate/",
        "product_repository": "https://github.com/ryanduguid/accounting-review-pipeline",
        "product_evidence_contract": (
            "global review-ready-gate evidence hrefs must match approved "
            "review-ready-gate/v0.1.3 URLs exactly once"
        ),
        "permanent_commit": "2de565b3ce3916afe718b2b895d5474930030aee",
        "sections": (
            ("accounting-problem", "Accounting problem"),
            ("fabricated-inputs", "Fabricated inputs"),
            ("expected-result", "Expected result"),
            ("controls-triggered", "Controls triggered"),
            ("human-decision", "Human decision"),
            ("reproduce", "Reproduce"),
            ("primary-sources", "Primary sources"),
            ("versions", "Versions"),
            ("limitations", "Limitations"),
        ),
        "labels": (
            "Accounting problem",
            "Fabricated inputs",
            "Expected result",
            "Controls triggered",
            "Human decision",
            "Reproduce",
            "Primary sources",
            "Versions",
            "Limitations",
        ),
        "version_labels": (
            "Product release v0.1.3",
            "fixture version 1",
            "source reviewed 2026-08-26",
        ),
        "reproduction_recipe": (
            "git clone --branch review-ready-gate/v0.1.3 --depth 1 "
            "https://github.com/ryanduguid/accounting-review-pipeline.git",
            "cd accounting-review-pipeline/packages/review-ready-gate",
            "uv sync --locked --all-extras",
            "uv run review-ready gate --profile bas --pack examples/bas-not-ready "
            "--output outputs/evaluation-not-ready",
            "uv run review-ready gate --profile bas --pack examples/bas-ready "
            "--output outputs/evaluation-ready",
            "uv run pytest tests/test_evaluation_pack.py -q",
        ),
        "contract_text": (
            "Exit 2 with NOT_READY",
            "MISSING_ARTEFACT for gst_control_gl",
            "SELF_REVIEW_INCOMPLETE",
            "OPEN_ITEM_BLOCKING",
            "Exit 0 with READY and no configured findings",
            "READY means no configured gate tripped; it is not approval, advice or "
            "lodgement authority.",
        ),
        "product_evidence_urls": (
            "https://github.com/ryanduguid/accounting-review-pipeline/releases/tag/"
            "review-ready-gate/v0.1.3",
            "https://github.com/ryanduguid/accounting-review-pipeline/tree/"
            "2de565b3ce3916afe718b2b895d5474930030aee/packages/review-ready-gate/"
            "evaluation/manager_review_gate",
            "https://github.com/ryanduguid/accounting-review-pipeline/blob/"
            "2de565b3ce3916afe718b2b895d5474930030aee/packages/review-ready-gate/"
            "evaluation/manager_review_gate/expected_results.json",
            "https://github.com/ryanduguid/accounting-review-pipeline/blob/"
            "2de565b3ce3916afe718b2b895d5474930030aee/packages/review-ready-gate/"
            "tests/test_evaluation_pack.py",
        ),
        "primary_source_urls": (
            "https://www.ato.gov.au/businesses-and-organisations/"
            "preparing-lodging-and-paying/business-activity-statements-bas",
            "https://www.ato.gov.au/businesses-and-organisations/"
            "gst-excise-and-indirect-taxes/gst/lodging-your-bas-or-annual-gst-return/"
            "options-for-reporting-and-paying-gst/monthly-gst-reporting",
        ),
    },
    "evaluate/xero-trial-balance-integrity/index.html": {
        "url": f"{SITE}/evaluate/xero-trial-balance-integrity/",
        "product_repository": (
            "https://github.com/ryanduguid/accounting-review-pipeline"
        ),
        "product_evidence_contract": (
            "global xero-trial-balance-export evidence hrefs must match approved "
            "permanent URLs exactly once"
        ),
        "permanent_commit": "3ae854911bf36f00bd3cc3eeafd1855848896629",
        "sections": (
            ("accounting-problem", "Accounting problem"),
            ("intended-reviewer", "Intended reviewer"),
            ("fabricated-inputs", "Fabricated inputs"),
            ("reproduce", "Reproduce"),
            ("expected-result", "Expected result"),
            ("controls-triggered", "Controls triggered"),
            ("primary-sources", "Primary sources"),
            ("versions", "Versions"),
            ("human-decision", "Human decision"),
            ("limitations", "Limitations"),
        ),
        "labels": (
            "Accounting problem",
            "Fabricated inputs",
            "Expected result",
            "Controls triggered",
            "Human decision",
            "Reproduce",
            "Primary sources",
            "Versions",
            "Limitations",
        ),
        "version_labels": (
            "Product release v0.1.6",
            "fixture version 1",
            "source reviewed 2026-08-26",
        ),
        "reproduction_recipe": (
            "python -m pip install --require-hashes -r requirements.lock",
            "python -B -m unittest tests.test_evaluation_pack -v",
            "python -B -m unittest discover -s tests -v",
            "python evaluation/xero_tb_integrity/run.py "
            "../../contracts/xero-trial-balance-v1/fixtures/passing.csv",
            "python evaluation/xero_tb_integrity/run.py "
            "../../contracts/xero-trial-balance-v1/fixtures/failing_movement.csv",
            "python evaluation/xero_tb_integrity/run.py "
            "../../contracts/xero-trial-balance-v1/fixtures/failing_ytd.csv",
        ),
        "contract_text": (
            "The production tool reads trial balance data directly from Xero's "
            "Accounting API Reports endpoint.",
            "This pack is for a reviewer who wants to reproduce the offline integrity "
            "gate without connecting to Xero or handling client data.",
            "The three CSV files are fabricated output-shape fixtures.",
            "They are not Xero API responses or client records, and no OAuth flow runs "
            "in this evaluation.",
            "No Xero tenant credentials or tenant data are used.",
            "Dependency installation may download the hash-locked packages.",
            "Once dependencies are installed, the three evaluation runner commands "
            "are fully offline, make no network request and write no output file.",
            "passing.csv exits 0 and reports that movement and YTD balance.",
            "failing_movement.csv exits 1, identifies the movement pair and reports "
            "Nothing written.",
            "failing_ytd.csv exits 1, identifies the YTD pair and reports Nothing "
            "written.",
            "failing_movement.csv breaks only the current-month Debit/Credit pair.",
            "failing_ytd.csv breaks only the YTDDebit/YTDCredit pair.",
            "The evaluation runner calls the production check_balanced gate before "
            "any CSV write.",
            "A balanced export passes this integrity control only; a human still "
            "decides completeness, classification, accounting treatment and fitness "
            "for review.",
            "This control does not prove completeness, classification, accounting "
            "treatment or client approval.",
            "It does not assess source-data accuracy, reporting-period suitability or "
            "fitness for a particular client review.",
        ),
        "product_evidence_urls": (
            "https://github.com/ryanduguid/accounting-review-pipeline/releases/tag/"
            "xero-trial-balance-export/v0.1.6",
            "https://github.com/ryanduguid/accounting-review-pipeline/tree/"
            "3ae854911bf36f00bd3cc3eeafd1855848896629/packages/"
            "xero-trial-balance-export/evaluation/xero_tb_integrity",
            "https://github.com/ryanduguid/accounting-review-pipeline/blob/"
            "3ae854911bf36f00bd3cc3eeafd1855848896629/contracts/"
            "xero-trial-balance-v1/expected_results.json",
            "https://github.com/ryanduguid/accounting-review-pipeline/blob/"
            "3ae854911bf36f00bd3cc3eeafd1855848896629/packages/"
            "xero-trial-balance-export/tests/test_evaluation_pack.py",
        ),
        "primary_source_urls": (
            "https://developer.xero.com/documentation/api/accounting/reports",
            "https://developer.xero.com/documentation/guides/oauth2/scopes/",
        ),
    },
    "evaluate/payday-super-evidence/index.html": {
        "url": f"{SITE}/evaluate/payday-super-evidence/",
        "product_repository": "https://github.com/ryanduguid/australian-accounting",
        "product_evidence_contract": (
            "global payday-super-checker evidence hrefs must match approved "
            "release, permanent evaluation and source-review URLs exactly once"
        ),
        "permanent_commit": "8e9bd7235030b2c42bc8f2e7d2e8a60dce627182",
        "sections": (
            ("accounting-problem", "Accounting problem"),
            ("intended-reviewer", "Intended reviewer"),
            ("fabricated-inputs", "Fabricated inputs"),
            ("reproduce", "Reproduce"),
            ("expected-result", "Expected result"),
            ("controls-triggered", "Controls triggered"),
            ("primary-sources", "Primary sources"),
            ("versions", "Versions"),
            ("human-decision", "Human decision"),
            ("limitations", "Limitations"),
        ),
        "labels": (
            "Accounting problem",
            "Intended reviewer",
            "Fabricated inputs",
            "Reproduce",
            "Expected result",
            "Controls triggered",
            "Primary sources",
            "Versions",
            "Human decision",
            "Limitations",
        ),
        "version_labels": (
            "Product release v0.1.3",
            "fixture version 1",
            "source reviewed 15 August 2026",
        ),
        "reproduction_recipe": (
            "uv run --locked --extra dev --python 3.12 payday-super-check "
            "evaluation/payday_super_evidence/fixtures/timely_remittance_no_receipt.csv "
            "--as-at 2026-08-20 -o timely-report.csv",
            "uv run --locked --extra dev --python 3.12 payday-super-check "
            "evaluation/payday_super_evidence/fixtures/late_remittance_no_receipt.csv "
            "--as-at 2026-08-20 -o late-remittance-report.csv",
            "uv run --locked --extra dev --python 3.12 payday-super-check "
            "evaluation/payday_super_evidence/fixtures/receipt_on_due_date.csv "
            "--as-at 2026-08-20 -o on-time-report.csv",
            "uv run --locked --extra dev --python 3.12 payday-super-check "
            "evaluation/payday_super_evidence/fixtures/receipt_after_due_date.csv "
            "--as-at 2026-08-20 -o late-receipt-report.csv",
            "uv run --locked --extra dev --python 3.12 pytest tests/test_evaluation_pack.py -q",
        ),
        "contract_text": (
            "No client, employee or live payroll data is included.",
            "17 August 2026",
            "20 August 2026",
            "timely_remittance_no_receipt.csv exits 2 with AT_RISK",
            "late_remittance_no_receipt.csv exits 2 with LATE",
            "receipt_on_due_date.csv exits 0 with ON_TIME",
            "receipt_after_due_date.csv exits 2 with LATE",
            "A missing receipt cannot prove on-time, remittance timing can prove late, "
            "and timely remittance without receipt remains at-risk.",
            "Remittance evidence can show operational timing but cannot prove on-time; "
            "a human must establish eligible fund receipt, allocation and the other "
            "assessment facts before relying on a statutory conclusion.",
            "Experimental review aid. Not a compliance determination.",
            "the first to contain the evaluation directory",
            "evaluation artefacts are fixed to that release's commit",
        ),
        "product_evidence_urls": (
            "https://github.com/ryanduguid/australian-accounting/releases/tag/"
            "payday-super-checker/v0.1.3",
            "https://github.com/ryanduguid/australian-accounting/tree/"
            "8e9bd7235030b2c42bc8f2e7d2e8a60dce627182/packages/payday-super-checker/"
            "evaluation/payday_super_evidence",
            "https://github.com/ryanduguid/australian-accounting/blob/"
            "8e9bd7235030b2c42bc8f2e7d2e8a60dce627182/packages/payday-super-checker/"
            "evaluation/payday_super_evidence/expected_results.json",
            "https://github.com/ryanduguid/australian-accounting/blob/"
            "8e9bd7235030b2c42bc8f2e7d2e8a60dce627182/packages/payday-super-checker/"
            "tests/test_evaluation_pack.py",
        ),
        "primary_source_urls": (
            "https://www.legislation.gov.au/C2004A04402/latest/text",
            "https://www.ato.gov.au/law/view/document?DocID=COG%2FLCR20262%2FNAT%2FATO%2F00001",
            "https://github.com/ryanduguid/australian-accounting/blob/"
            "8e9bd7235030b2c42bc8f2e7d2e8a60dce627182/packages/payday-super-checker/"
            "docs/primary-source-review-2026-08-15.md",
        ),
        "section_contract_text": {
            "fabricated-inputs": (
                "supported due date of 17 August 2026 and an as-at date of 20 August 2026",
            ),
            "reproduce": (
                "Use a checkout of the australian-accounting monorepo fixed at commit 8e9bd7235030b2c42bc8f2e7d2e8a60dce627182 (tag payday-super-checker/v0.1.3) and run these commands from packages/payday-super-checker. The first four commands write the four reports; the final command runs the evaluation contract test.",
            ),
            "limitations": (
                "This evaluation does not provide advice or make an ATO assessment.",
            ),
        },
        "sitemap_lastmod": "2026-09-04",
        "llms_section": "Evaluation packs",
    },
}
ARTICLE_TOC_EXTERNAL_LINKS = {
    "tools/payday-super/index.html": (
        "/evaluate/payday-super-evidence/",
        "Reproduce the evaluation",
        "Synthetic worked example",
    ),
}

warnings: list[str] = []

PRIMARY_NAV_LINKS = [
    ("/tools/", "Tools"),
    ("/rates/", "Rates"),
    ("/evidence/", "Evidence"),
    ("/about/", "About"),
    ("/contact/", "Contact"),
]

BREADCRUMB_LEAF_NAMES = {
    "tools/ato-benchmarks/index.html": "ATO benchmark comparison",
    "tools/australian-tax-ai-agents/index.html": "Australian tax tools for AI agents",
    "tools/coal-lsl-levy/index.html": "Coal LSL levy calculator",
    "tools/company-tax-franking/index.html": "Company tax and franking checks",
    "tools/payday-super/index.html": "Payday Super timing",
    "tools/subcontractor-ledgers/index.html": "Subcontract ledger skills",
    "tools/trust-distributions/index.html": "Trust distribution checks",
    "tools/wip-schedule/index.html": "Construction WIP schedule",
    "tools/workpaper-review-gate/index.html": "Workpaper Review Gate",
    "tools/xero-trial-balance/index.html": "Xero trial balance CSV export",
}

COLLECTION_HUBS: dict[str, dict[str, object]] = {
    "tools/index.html": {
        "h1": "Tools",
        "entries": [
            ("/tools/xero-trial-balance/", "Xero trial balance CSV export"),
            ("/tools/subcontractor-ledgers/", "Subcontract ledger skills"),
            ("/tools/wip-schedule/", "Construction WIP schedule"),
            ("/tools/payday-super/", "Payday Super timing"),
            ("/tools/ato-benchmarks/", "ATO benchmark comparison"),
            ("/tools/coal-lsl-levy/", "Coal LSL levy calculator"),
            ("/tools/trust-distributions/", "Trust distribution checks"),
            ("/tools/company-tax-franking/", "Company tax and franking checks"),
            ("/tools/workpaper-review-gate/", "Workpaper Review Gate"),
            ("/tools/australian-tax-ai-agents/", "Australian tax tools for AI agents"),
        ],
    },
    "evaluate/index.html": {
        "h1": "Evaluations",
        "entries": [
            ("/evaluate/manager-review-gate/", "Manager review gate evaluation"),
            (
                "/evaluate/xero-trial-balance-integrity/",
                "Xero trial balance integrity evaluation",
            ),
            (
                "/evaluate/payday-super-evidence/",
                "Payday Super timing evidence evaluation",
            ),
        ],
    },
    "rates/index.html": {
        "h1": "Rates",
        "entries": [
            ("/rates/super-guarantee/", "Super guarantee rate history"),
            (
                "/rates/div7a-benchmark-rate/",
                "Division 7A benchmark interest rate",
            ),
            (
                "/rates/cents-per-kilometre/",
                "Cents per kilometre car-expense rate",
            ),
        ],
    },
}

HOMEPAGE_HEADING = "Review-ready controls for Australian accounting work."
HOMEPAGE_SUPPORT = (
    "Open-source checks for payroll, Xero, workpapers and AI workflows, with "
    "every source and calculation kept visible."
)
HOMEPAGE_ACTIONS = (
    ("/tools/", "Browse the tools"),
)
HOMEPAGE_PREVIEW_ENTRIES = (
    ("Extract", "/tools/#extract-tools", "/tools/xero-trial-balance/"),
    ("Calculate", "/tools/#calculate-tools", "/tools/coal-lsl-levy/"),
    ("Control", "/tools/#control-tools", "/tools/workpaper-review-gate/"),
    ("Inspect", "/tools/#inspect-tools", "/tools/australian-tax-ai-agents/"),
)
HOMEPAGE_ANCHORS = ("adopt", "verify")
ABOUT_OPENING = (
    "I build open-source controls for Australian tax, payroll, ledgers and "
    "workpapers. They show sources and working, use fabricated examples, and "
    "leave judgement and lodgement with a person."
)
EVIDENCE_HEADING = "Evidence behind the tools"
EVIDENCE_OPENING = (
    "This register links public claims to identity records, releases, primary "
    "source reviews, repository controls and reproducible tests. It supports "
    "limited claims about the software. It does not turn an output into advice, "
    "approval, a compliance decision or a lodgement."
)
HOMEPAGE_REQUIRED_TEXT = [
    HOMEPAGE_HEADING,
    HOMEPAGE_SUPPORT,
    "Test it with fabricated data first.",
    "Check the source before the result.",
    "Useful before impressive",
    "Sources beside claims",
    "Working stays visible",
    "Unknown means unknown",
    "A person signs off",
]
HOMEPAGE_TITLE = "Ryan Duguid: open-source Australian accounting controls"
HOMEPAGE_DESCRIPTION = (
    "Personal index of open-source Australian accounting tools for payroll, Xero, "
    "workpapers and AI workflows, with sources and working kept visible."
)
HOMEPAGE_REQUIRED_HREFS = [
    "/evidence/",
    "/tools/xero-trial-balance/",
    "/tools/australian-tax-ai-agents/",
    "/tools/coal-lsl-levy/",
    "/tools/workpaper-review-gate/",
    "/evaluate/payday-super-evidence/",
]
HOMEPAGE_PROOF_HREFS = [
    "/tools/coal-lsl-levy/",
    "/evidence/",
    "https://coallsl.com.au/guidance-notes/eligible-wages",
    "https://coallsl.com.au/about-us/governing-legislation/legislation",
]
ARTICLE_PATTERN_PAGES = {
    "about/index.html",
    "evaluate/manager-review-gate/index.html",
    "evaluate/payday-super-evidence/index.html",
    "evaluate/xero-trial-balance-integrity/index.html",
    "evidence/index.html",
    "tools/ato-benchmarks/index.html",
    "tools/australian-tax-ai-agents/index.html",
    "tools/company-tax-franking/index.html",
    "tools/payday-super/index.html",
    "tools/workpaper-review-gate/index.html",
    "tools/refusals/index.html",
    "tools/subcontractor-ledgers/index.html",
    "tools/trust-distributions/index.html",
    "tools/wip-schedule/index.html",
    "tools/xero-trial-balance/index.html",
    "rates/super-guarantee/index.html",
    "rates/div7a-benchmark-rate/index.html",
    "rates/cents-per-kilometre/index.html",
}
RATE_PAGES = {
    "rates/super-guarantee/index.html",
    "rates/div7a-benchmark-rate/index.html",
    "rates/cents-per-kilometre/index.html",
}
CALCULATOR_REL = "tools/coal-lsl-levy/index.html"
LEVY_PAGE_MODULE = "assets/levy-page.mjs"
LEVY_PAGE_SCRIPT = '<script type="module" src="/assets/levy-page.mjs"></script>'
HEADER_DATED_PAGES = {
    rel
    for rel in ARTICLE_PATTERN_PAGES
    if rel.startswith(("tools/", "evaluate/"))
} | {CALCULATOR_REL, "rates/index.html", "evaluate/index.html"}
CALCULATOR_MARKERS = [
    'name="branch"',
    'id="branch-fields"',
    'id="sacrificed"',
    'id="bonus-rows"',
    'type="submit"',
]
CALCULATOR_REQUIRED_IDS = {
    "calc-form",
    "branch-fields",
    "sacrificed",
    "bonus-rows",
    "add-bonus",
    "result",
    "employeeLabel",
    "add-employee",
    "employee-table",
    "employee-rows",
    "employee-total-wages",
    "employee-total-levy",
    "export-csv",
    "money-blank-help",
    "result-actions",
    "print-working",
    "employee-reference-help",
    "fields-baseRate",
    "baseRate",
    "overtime",
    "allowances",
    "fields-annual",
    "annualSalary",
    "fields-casual",
    "reportingMonth",
    "instrumentSpecifiesLoading",
    "loadingQuantifiable",
    "casualBasePay",
    "casualLoading",
    "ordinaryPay",
    "bonus-row-template",
}
CALCULATOR_COMMON_HELP = (
    "Leave a monetary amount blank to treat it as $0.00."
)
CALCULATOR_BLANK_RESULT_EXPLANATION = (
    "All monetary amounts were blank, so the calculator treated each as $0.00."
)
CALCULATOR_PRIVACY_WARNING = (
    "Use an internal payroll reference such as EMP-001. Do not enter an employee "
    "name, TFN or other direct identifier."
)
CALCULATOR_NUMBER_INPUT_IDS = (
    "sacrificed",
    "baseRate",
    "overtime",
    "allowances",
    "annualSalary",
    "casualBasePay",
    "casualLoading",
    "ordinaryPay",
)
CALCULATOR_FIELD_HELP_IDS = {
    identifier: f"{identifier}-help" for identifier in CALCULATOR_NUMBER_INPUT_IDS
}
SOCIAL_CARD_CONTEXTS = {
    "site": {
        "label": "Public register / Australian accounting controls",
        "heading": [
            "Review-ready controls",
            "for Australian",
            "accounting work.",
        ],
        "host": "duguid.com.au",
        "output": "social-card-site.png",
    },
    "tools": {
        "label": "Open-source tools",
        "heading": ["Accounting checks that", "show their working."],
        "host": "duguid.com.au/tools/",
        "output": "social-card-tools.png",
    },
    "evaluations": {
        "label": "Reproducible evaluations",
        "heading": [
            "Fabricated inputs.",
            "Expected results.",
            "Visible limits.",
        ],
        "host": "duguid.com.au/evaluate/",
        "output": "social-card-evaluations.png",
    },
    "rates": {
        "label": "Maintained reference tables",
        "heading": ["Australian rates,", "sources and review dates."],
        "host": "duguid.com.au/rates/",
        "output": "social-card-rates.png",
    },
    "evidence": {
        "label": "Evidence register",
        "heading": ["Claims linked to sources,", "releases and tests."],
        "host": "duguid.com.au/evidence/",
        "output": "social-card-evidence.png",
    },
}
SOCIAL_CARD_DIMENSIONS = (1200, 630)
SOCIAL_CARD_MAX_BYTES = 50_000
SOCIAL_CARD_COLOURS = frozenset({"#000000", "#eef4f0", "#4dff88", "#9aa89f"})
SOCIAL_CARD_TEMPLATE_PLACEHOLDERS = frozenset(
    {
        "{{FONT_SERIF}}",
        "{{FONT_SANS}}",
        "{{FONT_MONO}}",
        "{{TITLE}}",
        "{{DESCRIPTION}}",
        "{{LABEL}}",
        "{{HEADING_LINES}}",
        "{{HOST}}",
    }
)
TIGHT_META_DESCRIPTION_PAGES = {
    "tools/payday-super/index.html",
    "tools/australian-tax-ai-agents/index.html",
    "tools/coal-lsl-levy/index.html",
}
TIGHT_META_DESCRIPTION_LIMITS = (120, 155)
BONUS_FREQUENCIES = [
    "weekly",
    "fortnightly",
    "monthly",
    "quarterly",
    "halfYearly",
    "annually",
]


def social_metadata_for_page(rel: str) -> tuple[str | None, str | None]:
    """Return the approved social-card image and alt for one canonical page."""
    if rel in {
        "index.html",
        "about/index.html",
        "contact/index.html",
        "changelog/index.html",
    }:
        context = "site"
    elif rel == EVIDENCE_REL:
        context = "evidence"
    elif rel.startswith("tools/"):
        context = "tools"
    elif rel.startswith("evaluate/"):
        context = "evaluations"
    elif rel.startswith("rates/"):
        context = "rates"
    else:
        return None, None

    card = SOCIAL_CARD_CONTEXTS[context]
    image = f"{SITE}/assets/{card['output']}"
    alt = "OLED register card: " + " ".join(card["heading"])
    return image, alt


def check_homepage_contract(html: str, failures: list[str]) -> None:
    """Keep the approved homepage claims and primary proof routes visible."""
    titles = re.findall(r"<title>(.*?)</title>", html, re.S)
    title = html_lib.unescape(titles[0].strip()) if len(titles) == 1 else None
    if title != HOMEPAGE_TITLE:
        failures.append(
            f"index.html: homepage title is {title!r}, expected {HOMEPAGE_TITLE!r}"
        )
    description = core.meta(html, "name", "description")
    if description != HOMEPAGE_DESCRIPTION:
        failures.append(
            "index.html: homepage description is "
            f"{description!r}, expected {HOMEPAGE_DESCRIPTION!r}"
        )
    for property_name, expected in (
        ("og:title", HOMEPAGE_TITLE),
        ("og:description", HOMEPAGE_DESCRIPTION),
    ):
        actual = core.meta(html, "property", property_name)
        if actual != expected:
            failures.append(
                f"index.html: {property_name} is {actual!r}, expected {expected!r}"
            )
    text = core.visible_text(html)
    for required in HOMEPAGE_REQUIRED_TEXT:
        if required not in text:
            failures.append(f"index.html: missing approved homepage text {required!r}")
    root = core.parse_structure(html)
    h1s = core.descendants(root, "h1", rendered_only=True)
    if len(h1s) != 1 or core.element_text(h1s[0]) != HOMEPAGE_HEADING:
        failures.append(f"index.html: homepage H1 must be {HOMEPAGE_HEADING!r}")

    summaries = [
        element
        for element in core.descendants(root, rendered_only=True)
        if element.has_class("home-hero__summary")
    ]
    if len(summaries) != 1 or core.element_text(summaries[0]) != HOMEPAGE_SUPPORT:
        failures.append(
            f"index.html: homepage support text must be {HOMEPAGE_SUPPORT!r}"
        )

    action_groups = [
        element
        for element in core.descendants(root, "nav", rendered_only=True)
        if element.has_class("home-hero__actions")
    ]
    actual_actions: list[tuple[str | None, str]] = []
    if len(action_groups) == 1:
        actual_actions = [
            (link.attr("href"), core.element_text(link))
            for link in core.descendants(action_groups[0], "a", rendered_only=True)
        ]
    if actual_actions != list(HOMEPAGE_ACTIONS):
        failures.append(
            f"index.html: homepage actions are {actual_actions!r}, "
            f"expected {list(HOMEPAGE_ACTIONS)!r}"
        )

    previews = [
        element
        for element in core.descendants(root, rendered_only=True)
        if element.has_class("home-tool-preview")
    ]
    actual_preview: list[tuple[str, str | None, str | None]] = []
    if len(previews) == 1:
        entries = [
            element
            for element in core.descendants(previews[0], rendered_only=True)
            if element.has_class("home-tool-preview__entry")
        ]
        for entry in entries:
            headings = core.descendants(entry, "h3", rendered_only=True)
            links = core.descendants(entry, "a", rendered_only=True)
            actual_preview.append(
                (
                    core.element_text(headings[0]) if len(headings) == 1 else "",
                    links[0].attr("href") if len(links) >= 1 else None,
                    links[1].attr("href") if len(links) >= 2 else None,
                )
            )
    if actual_preview != list(HOMEPAGE_PREVIEW_ENTRIES):
        failures.append(
            f"index.html: category preview is {actual_preview!r}, "
            f"expected {list(HOMEPAGE_PREVIEW_ENTRIES)!r}"
        )

    all_elements = core.descendants(root, rendered_only=True)
    for identifier in HOMEPAGE_ANCHORS:
        count = sum(element.attr("id") == identifier for element in all_elements)
        if count != 1:
            failures.append(
                f"index.html: expected exactly one valid #{identifier} anchor, found {count}"
            )

    rendered = core.visible_html(html)
    sequence = (
        rendered.find('class="home-tool-preview'),
        rendered.find('class="route-section proof-feature'),
        rendered.find('id="adopt"'),
        rendered.find('id="verify"'),
    )
    if any(position < 0 for position in sequence) or tuple(sorted(sequence)) != sequence:
        failures.append(
            "index.html: content order must be preview, proof, Adopt, Verify"
        )

    hrefs = [
        link.attr("href")
        for link in core.descendants(root, "a", rendered_only=True)
    ]
    for href in HOMEPAGE_REQUIRED_HREFS:
        if href not in hrefs:
            failures.append(f"index.html: missing visible homepage route {href}")

    proof_features = [
        element
        for element in core.descendants(root, rendered_only=True)
        if element.has_class("proof-feature")
    ]
    if len(proof_features) != 1:
        failures.append(
            f"index.html: expected exactly one proof feature, found {len(proof_features)}"
        )
        return
    proof_hrefs = {
        link.attr("href")
        for link in core.descendants(proof_features[0], "a", rendered_only=True)
    }
    for href in HOMEPAGE_PROOF_HREFS:
        if href not in proof_hrefs:
            failures.append(f"index.html: proof feature is missing required link {href}")


def check_article_pattern(html: str, rel: str, failures: list[str]) -> None:
    """Require the reusable article and local-contents pattern."""
    root = core.parse_structure(html)
    articles = core.descendants(root, "article", rendered_only=True)
    if len(articles) != 1:
        failures.append(f"{rel}: expected exactly one article element")
    toc_blocks = [
        nav
        for nav in core.descendants(root, "nav", rendered_only=True)
        if nav.attr("aria-label") == "On this page"
    ]
    if len(toc_blocks) != 1:
        failures.append(f"{rel}: expected exactly one On this page navigation")
        return
    toc = toc_blocks[0]
    if len(articles) == 1 and not core.is_descendant(toc, articles[0]):
        failures.append(f"{rel}: On this page navigation must be inside the article")

    links = core.descendants(toc, "a", rendered_only=True)
    if not links:
        failures.append(
            f"{rel}: On this page navigation must contain at least one local link"
        )
        return
    target_ids = {
        element.attr("id")
        for element in core.descendants(root, rendered_only=True)
        if element.attr("id")
    }
    valid_links = 0
    external_contract = ARTICLE_TOC_EXTERNAL_LINKS.get(rel)
    external_href = external_label = preceding_label = None
    if external_contract:
        external_href, external_label, preceding_label = external_contract
        rendered_evaluator_links = [
            link
            for link in core.descendants(root, "a", rendered_only=True)
            if link.attr("href") == external_href
        ]
        if len(rendered_evaluator_links) != 1:
            failures.append(
                f"{rel}: evaluator link {external_href!r} must appear once "
                f"across the rendered page, found {len(rendered_evaluator_links)}"
            )
        matching_external_links = [
            link for link in links if link.attr("href") == external_href
        ]
        if len(matching_external_links) != 1:
            failures.append(
                f"{rel}: external On this page link {external_href!r} must appear "
                f"once with label {external_label!r}, found {len(matching_external_links)}"
            )
        elif core.element_text(matching_external_links[0]) != external_label:
            failures.append(
                f"{rel}: external On this page link {external_href!r} must have "
                f"label {external_label!r}, found {core.element_text(matching_external_links[0])!r}"
            )
        else:
            external_index = links.index(matching_external_links[0])
            previous_label = (
                core.element_text(links[external_index - 1]) if external_index else ""
            )
            if previous_label != preceding_label:
                failures.append(
                    f"{rel}: external On this page link {external_href!r} must "
                    f"immediately follow {preceding_label!r}"
                )
    for link in links:
        href = link.attr("href") or ""
        if href == external_href:
            continue
        if not href.startswith("#") or href[1:] not in target_ids:
            failures.append(f"{rel}: local contents target does not exist: {href}")
        else:
            valid_links += 1
    if valid_links == 0:
        failures.append(
            f"{rel}: On this page navigation must contain at least one valid local link"
        )


def check_approved_page_opening(html: str, rel: str, failures: list[str]) -> None:
    """Protect the concise, tool-led About and Evidence openings."""
    expected = {
        "about/index.html": ("About Ryan Duguid", ABOUT_OPENING),
        EVIDENCE_REL: (EVIDENCE_HEADING, EVIDENCE_OPENING),
    }.get(rel)
    if expected is None:
        return
    root = core.parse_structure(html)
    h1s = core.descendants(root, "h1", rendered_only=True)
    leads = [
        element
        for element in core.descendants(root, rendered_only=True)
        if element.has_class("lead-note")
    ]
    if len(h1s) != 1 or core.element_text(h1s[0]) != expected[0]:
        failures.append(f"{rel}: page H1 must be {expected[0]!r}")
    if len(leads) != 1 or core.element_text(leads[0]) != expected[1]:
        failures.append(f"{rel}: page opening must be {expected[1]!r}")


def check_header_review_date(html: str, rel: str, failures: list[str]) -> None:
    """Keep each tool or evaluation review date visible in its page header."""
    if rel not in HEADER_DATED_PAGES:
        return
    root = core.parse_structure(html)
    headers = [
        element
        for element in core.descendants(root, "header", rendered_only=True)
        if element.has_class("article-header")
        or element.has_class("calculator-header")
    ]
    dates = [
        element
        for element in core.descendants(root, rendered_only=True)
        if element.has_class("page-meta")
    ]
    if (
        len(headers) != 1
        or len(dates) != 1
        or not core.is_descendant(dates[0], headers[0])
    ):
        failures.append(f"{rel}: Published/Last reviewed line must be in the page header")


def check_rate_table_region(html: str, rel: str, failures: list[str]) -> None:
    root = core.parse_structure(html)
    tables = core.descendants(root, "table", rendered_only=True)

    def has_labelled_region(table: core.HtmlElement) -> bool:
        ancestor = table.parent
        while ancestor is not None:
            if (
                ancestor.tag == "div"
                and ancestor.attr("role") == "region"
                and bool((ancestor.attr("aria-label") or "").strip())
                and ancestor.attr("tabindex") == "0"
            ):
                return True
            ancestor = ancestor.parent
        return False

    if not tables or any(not has_labelled_region(table) for table in tables):
        failures.append(f"{rel}: reference table is not inside a labelled keyboard-scroll region")


def check_id_contract(
    root: core.HtmlElement,
    identifier: str,
    tag: str,
    attributes: dict[str, str],
    failures: list[str],
    *,
    present: tuple[str, ...] = (),
) -> core.HtmlElement | None:
    """Require one identified control and the attributes its controller relies on."""
    matches = core.element_by_id(root, identifier)
    if len(matches) != 1:
        failures.append(
            f"{CALCULATOR_REL}: expected exactly one #{identifier}, found {len(matches)}"
        )
        return None
    element = matches[0]
    if element.tag != tag:
        failures.append(
            f"{CALCULATOR_REL}: #{identifier} must be {tag}, found {element.tag}"
        )
        return element
    for name, expected in attributes.items():
        actual = element.attr(name)
        if actual != expected:
            failures.append(
                f"{CALCULATOR_REL}: #{identifier} {name} must be {expected!r}, "
                f"found {actual!r}"
            )
    for name in present:
        if name not in element.attrs:
            failures.append(f"{CALCULATOR_REL}: #{identifier} must have {name}")
    return element


def calculator_module_source(root: Path = core.ROOT) -> str:
    """Return the calculator's external page module, or nothing if it is missing."""
    path = root / LEVY_PAGE_MODULE
    return path.read_text(encoding="utf-8") if path.is_file() else ""


def check_calculator_contract(
    html: str, failures: list[str], module_source: str | None = None
) -> None:
    positions = [html.find(marker) for marker in CALCULATOR_MARKERS]
    if any(position < 0 for position in positions) or positions != sorted(positions):
        failures.append(
            f"{CALCULATOR_REL}: calculator markers missing or out of order: {positions}"
        )

    root = core.parse_structure(html)
    all_ids = [
        element.attr("id")
        for element in core.descendants(root)
        if element.attr("id")
    ]
    ids = set(all_ids)
    duplicate_ids = sorted(
        identifier for identifier, count in Counter(all_ids).items() if count > 1
    )
    if duplicate_ids:
        failures.append(
            f"{CALCULATOR_REL}: duplicate help or control IDs: {duplicate_ids}"
        )
    missing_ids = sorted(CALCULATOR_REQUIRED_IDS - ids)
    if missing_ids:
        failures.append(f"{CALCULATOR_REL}: missing protected field IDs: {missing_ids}")

    common_help = core.element_by_id(root, "money-blank-help")
    if (
        len(common_help) != 1
        or core.element_text(common_help[0]) != CALCULATOR_COMMON_HELP
    ):
        failures.append(
            f"{CALCULATOR_REL}: form must contain one exact blank-as-zero note"
        )

    branch_radios = [
        element
        for element in core.descendants(root, "input")
        if element.attr("name") == "branch"
    ]
    branch_contract = [
        (radio.attr("type"), radio.attr("value"), "checked" in radio.attrs)
        for radio in branch_radios
    ]
    expected_branch_contract = [
        ("radio", "baseRate", True),
        ("radio", "annual", False),
        ("radio", "casual", False),
    ]
    if branch_contract != expected_branch_contract:
        failures.append(f"{CALCULATOR_REL}: branch radio contract changed")

    number_attributes = {
        "type": "number",
        "min": "0",
        "step": "0.01",
        "inputmode": "decimal",
    }
    for identifier in CALCULATOR_NUMBER_INPUT_IDS:
        control = check_id_contract(
            root,
            identifier,
            "input",
            {"name": identifier, **number_attributes},
            failures,
        )
        if control is not None:
            described_by = set(
                (control.attr("aria-describedby") or "").split()
            )
            expected_help = {
                "money-blank-help",
                CALCULATOR_FIELD_HELP_IDS[identifier],
            }
            if described_by != expected_help:
                failures.append(
                    f"{CALCULATOR_REL}: #{identifier} aria-describedby must retain "
                    "common and field-specific help"
                )
        help_nodes = core.element_by_id(root, CALCULATOR_FIELD_HELP_IDS[identifier])
        if len(help_nodes) != 1:
            failures.append(
                f"{CALCULATOR_REL}: #{identifier} needs one unique field help ID"
            )
    check_id_contract(
        root,
        "reportingMonth",
        "input",
        {
            "type": "month",
            "name": "reportingMonth",
            "aria-describedby": "reportingMonth-help",
        },
        failures,
        present=("required",),
    )
    if len(core.element_by_id(root, "reportingMonth-help")) != 1:
        failures.append(f"{CALCULATOR_REL}: reporting month needs associated help")
    for identifier in ("instrumentSpecifiesLoading", "loadingQuantifiable"):
        check_id_contract(
            root,
            identifier,
            "input",
            {"type": "checkbox", "name": identifier},
            failures,
        )
    check_id_contract(
        root,
        "employeeLabel",
        "input",
        {
            "type": "text",
            "placeholder": "EMP-001",
            "aria-describedby": "employee-reference-help",
        },
        failures,
    )
    for identifier in (
        "add-bonus",
        "add-employee",
        "export-csv",
        "print-working",
    ):
        check_id_contract(
            root, identifier, "button", {"type": "button"}, failures
        )
    export_buttons = core.element_by_id(root, "export-csv")
    if len(export_buttons) == 1 and core.element_text(export_buttons[0]) != "Download CSV":
        failures.append(f"{CALCULATOR_REL}: missing visible CSV action")

    forms = core.element_by_id(root, "calc-form")
    if len(forms) == 1:
        submit_buttons = [
            button
            for button in core.descendants(forms[0], "button")
            if button.attr("type") == "submit"
        ]
        if len(submit_buttons) != 1:
            failures.append(
                f"{CALCULATOR_REL}: #calc-form must contain exactly one submit button"
            )

    bonus_templates = core.element_by_id(root, "bonus-row-template")
    if len(bonus_templates) == 1:
        bonus_template = bonus_templates[0]
        bonus_amounts = [
            element
            for element in core.descendants(bonus_template, "input")
            if element.has_class("bonus-amount")
        ]
        if len(bonus_amounts) != 1:
            failures.append(
                f"{CALCULATOR_REL}: expected exactly one .bonus-amount input"
            )
        else:
            for name, expected in number_attributes.items():
                actual = bonus_amounts[0].attr(name)
                if actual != expected:
                    failures.append(
                        f"{CALCULATOR_REL}: .bonus-amount {name} must be "
                        f"{expected!r}, found {actual!r}"
                    )
            if bonus_amounts[0].attr("aria-describedby") != "money-blank-help":
                failures.append(
                    f"{CALCULATOR_REL}: bonus amount must retain common help before cloning"
                )
            if bonus_amounts[0].attr("data-help-template") != "bonus-amount":
                failures.append(
                    f"{CALCULATOR_REL}: bonus amount needs generated field-specific help"
                )
        bonus_help = [
            element
            for element in core.descendants(bonus_template)
            if element.attr("data-help-template") == "bonus-amount-note"
        ]
        if len(bonus_help) != 1 or bonus_help[0].attr("id") is not None:
            failures.append(
                f"{CALCULATOR_REL}: bonus template help must receive a unique cloned ID"
            )

        frequency_selects = [
            element
            for element in core.descendants(bonus_template, "select")
            if element.has_class("bonus-frequency")
        ]
        found_frequencies: list[str | None] = []
        if len(frequency_selects) == 1:
            found_frequencies = [
                option.attr("value")
                for option in core.descendants(frequency_selects[0], "option")
            ]
        if found_frequencies != BONUS_FREQUENCIES:
            failures.append(
                f"{CALCULATOR_REL}: bonus frequency values must be "
                f"{BONUS_FREQUENCIES!r}, found {found_frequencies!r}"
            )

        remove_buttons = [
            element
            for element in core.descendants(bonus_template, "button")
            if element.has_class("bonus-remove")
        ]
        if len(remove_buttons) != 1 or remove_buttons[0].attr("type") != "button":
            failures.append(
                f"{CALCULATOR_REL}: .bonus-remove must be a button with type 'button'"
            )

    result_tags = core.element_by_id(root, "result")
    if len(result_tags) != 1:
        failures.append(f"{CALCULATOR_REL}: expected one #result region")
    else:
        result_tag = result_tags[0]
        if (
            result_tag.tag != "div"
            or result_tag.attr("role") != "status"
            or result_tag.attr("aria-live") != "polite"
        ):
            failures.append(f"{CALCULATOR_REL}: #result must be a polite status region")

    result_position = html.find('id="result"')
    employee_position = html.find('id="employeeLabel"')
    disclaimer_position = html.find('id="disclaimer"')
    if not 0 <= result_position < employee_position < disclaimer_position:
        failures.append(
            f"{CALCULATOR_REL}: result, employee workflow and disclaimer are out of order"
        )

    result_actions = core.element_by_id(root, "result-actions")
    if len(result_actions) == 1:
        buttons = core.descendants(result_actions[0], "button")
        actual_actions = [
            (button.attr("id"), core.element_text(button)) for button in buttons
        ]
        expected_actions = [
            ("print-working", "Print working"),
            ("add-employee", "Add to monthly table"),
        ]
        if actual_actions != expected_actions:
            failures.append(
                f"{CALCULATOR_REL}: result actions are {actual_actions!r}, "
                f"expected {expected_actions!r}"
            )
    visible_text = core.visible_text(html)
    for required, label in (
        (CALCULATOR_PRIVACY_WARNING, "direct-identifier warning"),
        ("Employee reference", "employee reference label"),
        ("EMP-001", "employee reference example"),
        ("Download CSV", "CSV action"),
    ):
        if required not in visible_text:
            failures.append(f"{CALCULATOR_REL}: missing visible {label}")
    if module_source is None:
        module_source = calculator_module_source()
    if html.count(LEVY_PAGE_SCRIPT) != 1:
        failures.append(
            f"{CALCULATOR_REL}: page must load the calculator wiring from "
            f"{LEVY_PAGE_MODULE} exactly once"
        )
    if CALCULATOR_BLANK_RESULT_EXPLANATION not in module_source:
        failures.append(
            f"{LEVY_PAGE_MODULE}: zero result needs the blank-as-zero explanation"
        )

    if "from '/assets/levy.mjs'" not in module_source:
        failures.append(f"{LEVY_PAGE_MODULE}: protected levy engine import changed")


def check_canonical_person(person: dict[str, object]) -> list[str]:
    """Check the identity fields that make the canonical Person unambiguous."""
    failures: list[str] = []
    if person.get("@id") != PERSON_ID:
        failures.append(
            f"person graph: Person @id is {person.get('@id')!r}, expected {PERSON_ID!r}"
        )
    if person.get("sameAs") != PERSON_SAME_AS:
        failures.append(
            "person graph: Person sameAs must contain only the GitHub user and LinkedIn "
            "URLs in the required order"
        )
    for field, expected in PERSON_REQUIRED_FIELDS.items():
        if person.get(field) != expected:
            failures.append(
                f"person graph: Person {field} is {person.get(field)!r}, "
                f"expected {expected!r}"
            )
    if person.get("address") != PERSON_ADDRESS:
        failures.append("person graph: Person address must identify Newcastle, NSW, AU")
    if person.get("nationality") != {"@type": "Country", "name": "Australia"}:
        failures.append("person graph: Person nationality must identify Australia")
    return failures


PERSON_STUB_FIELDS = ("@type", "@id", "name", "jobTitle", "url", "sameAs")


def check_person_stub(rel: str, stub: dict[str, object], canonical: dict[str, object]) -> list[str]:
    """Check that a Person outside About is a homepage stub restating the canonical node."""
    if rel != "index.html":
        return [f"person graph: {rel} must not define a Person node; only index.html may carry a stub"]
    failures: list[str] = []
    if set(stub) != set(PERSON_STUB_FIELDS):
        failures.append(
            f"person graph: index.html Person stub must carry exactly {list(PERSON_STUB_FIELDS)}, "
            f"found {sorted(stub)}"
        )
    for field in PERSON_STUB_FIELDS:
        if field in stub and stub[field] != canonical.get(field):
            failures.append(
                f"person graph: index.html Person stub {field} differs from the canonical Person"
            )
    return failures


def check_person_stubs(
    people: list[tuple[str, dict[str, object]]], canonical: dict[str, object]
) -> list[str]:
    """Check that index.html carries exactly one stub and no other page carries any."""
    failures: list[str] = []
    stubs = [(rel, node) for rel, node in people if rel != "about/index.html"]
    for rel, node in stubs:
        failures.extend(check_person_stub(rel, node, canonical))
    if sum(1 for rel, _ in stubs if rel == "index.html") != 1:
        failures.append("person graph: index.html must carry exactly one Person stub")
    return failures


def check_person_graph(paths: list[Path]) -> list[str]:
    """Check that About owns the canonical Person, index.html may restate it, and authored works."""
    failures: list[str] = []
    graph_nodes = core.indexed_nodes(paths, failures, NOT_INDEXED)
    people = [(rel, node) for rel, node in graph_nodes if core.has_type(node, "Person")]
    canonical_people = [(rel, node) for rel, node in people if rel == "about/index.html"]
    if len(canonical_people) != 1:
        failures.append("person graph: about/index.html must contain the canonical Person node")
    else:
        canonical = canonical_people[0][1]
        failures.extend(check_canonical_person(canonical))
        failures.extend(check_person_stubs(people, canonical))

    software = [
        (rel, node) for rel, node in graph_nodes if core.has_type(node, "SoftwareSourceCode")
    ]
    if len(software) != len(AUTHORED_SOFTWARE):
        failures.append(
            f"person graph: expected {len(AUTHORED_SOFTWARE)} SoftwareSourceCode nodes, "
            f"found {len(software)}"
        )
    for name, expected in AUTHORED_SOFTWARE.items():
        matches = [(rel, node) for rel, node in software if node.get("name") == name]
        if len(matches) != 1:
            failures.append(
                f"person graph: expected one SoftwareSourceCode node named {name!r}, "
                f"found {len(matches)}"
            )
            continue
        rel, node = matches[0]
        if rel != "index.html":
            failures.append(f"person graph: {name} is in {rel}, not index.html")
        if node.get("@id") != expected["id"]:
            failures.append(f"person graph: {name} does not have its stable homepage @id")
        if node.get("author") != {"@id": PERSON_ID}:
            failures.append(f"person graph: {name} is not authored by the canonical Person")
        if node.get("url") != expected["repository"]:
            failures.append(f"person graph: {name} does not use its GitHub URL")
        if node.get("codeRepository") != expected["repository"]:
            failures.append(f"person graph: {name} does not name its GitHub repository")
        if node.get("license") != expected["license"]:
            failures.append(f"person graph: {name} does not declare its MIT licence URL")
        if node.get("description") != expected["description"]:
            failures.append(f"person graph: {name} does not use its current description")
    return failures


def check_evidence_page(root: Path = core.ROOT) -> list[str]:
    """Keep the public evidence page linked, bounded and person-referential."""
    failures: list[str] = []
    evidence_path = root / EVIDENCE_REL
    if not evidence_path.is_file():
        failures.append(f"{EVIDENCE_REL}: evidence page does not exist")

    sitemap_count = core.sitemap_urls(root).count(EVIDENCE_URL)
    if sitemap_count != 1:
        failures.append(
            f"sitemap.xml: evidence URL must appear once, found {sitemap_count}"
        )
    llms_count = (root / "llms.txt").read_text(encoding="utf-8").count(EVIDENCE_URL)
    if llms_count != 1:
        failures.append(f"llms.txt: evidence URL must appear once, found {llms_count}")

    for rel in ("index.html", "about/index.html"):
        page = (root / rel).read_text(encoding="utf-8")
        page = re.sub(r"<(script|style|template)\b.*?</\1>", " ", page, flags=re.S | re.I)
        page = re.sub(r"<!--.*?-->", " ", page, flags=re.S)
        if not re.search(r'<a\b[^>]*href="/evidence/"[^>]*>', page, re.I):
            failures.append(f"{rel}: no visible link to /evidence/")

    if not evidence_path.is_file():
        return failures

    html = evidence_path.read_text(encoding="utf-8")
    text = core.visible_text(html).casefold()
    canonical_match = re.search(r'<link rel="canonical" href="(.*?)"', html)
    if not canonical_match or canonical_match.group(1) != EVIDENCE_URL:
        found = canonical_match.group(1) if canonical_match else None
        failures.append(
            f"{EVIDENCE_REL}: canonical is {found!r}, expected {EVIDENCE_URL!r}"
        )

    nodes_on_evidence = [
        node
        for block in core.json_ld_blocks(html, EVIDENCE_REL, failures)
        for node in core.nodes(block)
    ]
    articles = [
        node
        for node in nodes_on_evidence
        if core.has_type(node, "TechArticle") or core.has_type(node, "WebPage")
    ]
    if not any(node.get("author") == {"@id": PERSON_ID} for node in articles):
        failures.append(
            f"{EVIDENCE_REL}: TechArticle or WebPage is not authored by the canonical Person"
        )
    if any(core.has_type(node, "Person") for node in nodes_on_evidence):
        failures.append(f"{EVIDENCE_REL}: must not define a local Person node")

    concepts = {
        "synthetic": r"\bsynthetic\b",
        "versioned": r"\bversion(?:ed|ing|s)?\b",
        "local": r"\blocal\b",
        "human review": r"\bhuman\b.{0,80}\breview\w*\b",
        "primary source": r"\bprimary\s+source\w*\b",
    }
    for label, pattern in concepts.items():
        if not re.search(pattern, text, re.S | re.I):
            failures.append(f"{EVIDENCE_REL}: visible text does not name {label}")
    return failures


def check_public_evaluator_invitation(root: Path = core.ROOT) -> list[str]:
    """Keep the independent reproduction request specific and public."""
    rel = EVIDENCE_REL
    path = root / rel
    if not path.is_file():
        return [f"{rel}: independent evaluation invitation is incomplete"]

    rendered = core.visible_html(path.read_text(encoding="utf-8"))
    text = core.visible_text(rendered)
    hrefs = core.anchor_hrefs(rendered)
    issue_url = "https://github.com/ryanduguid/ryanduguid.github.io/issues"
    required = (
        "Reproduce it yourself",
        "Run one fixed evaluation and record the command, release, expected result "
        "and observed result.",
        "Report any mismatch in the site repository.",
    )
    if any(value not in text for value in required) or hrefs.count(issue_url) != 1:
        return [f"{rel}: independent evaluation invitation is incomplete"]
    return []


def check_llms_authority_surface(llms: str) -> list[str]:
    """Keep machine-facing routes and the non-practice boundary aligned."""
    failures: list[str] = []
    route_section = core.markdown_section(llms, "Choose a route")
    routes_are_complete = all(
        re.search(
            rf"\*\*{re.escape(label)}\*\*\s*\({re.escape(AUTHORITY_URLS[identifier])}\)",
            route_section,
        )
        for identifier, label in AUTHORITY_PATHS.items()
    )
    required_boundaries = (
        "personal index of open-source accounting tools",
        "not a practice",
        "not accepting professional engagements through this site",
    )
    has_retired_route = "**Engage**" in route_section or "/#engage" in llms
    if (
        not routes_are_complete
        or has_retired_route
        or any(boundary not in llms for boundary in required_boundaries)
    ):
        failures.append("llms.txt: open-source route boundary is incomplete")
    return failures


def check_mcp_review_dates(html: str) -> list[str]:
    """Keep the AI-agent page's visible and structured review dates aligned."""
    failures: list[str] = []
    visible = core.visible_text(html)
    expected_visible = (
        f"Published 25 August 2026. Last reviewed {MCP_VISIBLE_REVIEW_DATE}."
    )
    if expected_visible not in visible:
        failures.append(f"{MCP_REL}: visible review date must be {MCP_VISIBLE_REVIEW_DATE}")

    parse_failures: list[str] = []
    page_nodes = [
        node
        for block in core.json_ld_blocks(html, MCP_REL, parse_failures)
        for node in core.nodes(block)
    ]
    failures.extend(parse_failures)
    for schema_type in ("TechArticle", "WebPage", "SoftwareApplication"):
        matches = [node for node in page_nodes if core.has_type(node, schema_type)]
        if len(matches) != 1 or matches[0].get("dateModified") != MCP_REVIEW_DATE:
            failures.append(
                f"{MCP_REL}: {schema_type} dateModified must be {MCP_REVIEW_DATE}"
            )
    for schema_type in ("TechArticle", "WebPage"):
        matches = [node for node in page_nodes if core.has_type(node, schema_type)]
        if len(matches) != 1 or matches[0].get("datePublished") != "2026-08-25":
            failures.append(
                f"{MCP_REL}: {schema_type} datePublished must remain 2026-08-25"
            )
    return failures


def check_authority_section(
    section_html: str,
    identifier: str,
    label: str,
    statement: str,
) -> list[str]:
    """Require one route thought, one action group and one visible boundary."""
    failures: list[str] = []
    rendered = core.visible_html(section_html)
    h2s = re.findall(r"<h2\b[^>]*>(.*?)</h2\s*>", rendered, re.S | re.I)
    if len(h2s) != 1:
        failures.append(
            f"index.html: authority section #{identifier} must have exactly one h2"
        )
    elif core.visible_text(h2s[0]) != label:
        failures.append(
            f"index.html: authority section #{identifier} heading must be {label}"
        )

    statement_matches = re.findall(
        r'<h3\b(?=[^>]*\bclass\s*=\s*["\'][^"\']*\broute-statement\b[^"\']*["\'])'
        r"[^>]*>(.*?)</h3\s*>",
        rendered,
        re.S | re.I,
    )
    if len(statement_matches) != 1 or core.visible_text(statement_matches[0]) != statement:
        failures.append(
            f"index.html: authority section #{identifier} statement must be {statement}"
        )

    action_groups = re.findall(
        r'<[a-z][\w:-]*\b(?=[^>]*\bclass\s*=\s*["\'][^"\']*\broute-actions\b[^"\']*["\'])[^>]*>',
        rendered,
        re.I,
    )
    if len(action_groups) != 1:
        failures.append(
            f"index.html: authority section #{identifier} needs one action group"
        )

    notes = re.findall(
        r'<[a-z][\w:-]*\b(?=[^>]*\bclass\s*=\s*["\'][^"\']*\broute-note\b[^"\']*["\'])[^>]*>',
        rendered,
        re.I,
    )
    if len(notes) != 1:
        failures.append(
            f"index.html: authority section #{identifier} needs one boundary or verification note"
        )
    return failures


def check_authority_surface(root: Path = core.ROOT) -> list[str]:
    """Require Adopt and Verify while keeping the consultancy route parked."""
    failures: list[str] = []
    home_path = root / "index.html"
    home = home_path.read_text(encoding="utf-8") if home_path.is_file() else ""
    rendered_home = core.visible_html(home)
    sections = {
        identifier: core.section_html(home, identifier) for identifier in AUTHORITY_PATHS
    }
    for identifier, label in AUTHORITY_PATHS.items():
        if not sections[identifier]:
            failures.append(f"index.html: missing visible authority section #{identifier}")

        section_heading = re.search(
            r"<h[1-6]\b[^>]*>(.*?)</h[1-6]\s*>", sections[identifier], re.S | re.I
        )
        heading_label = core.visible_text(section_heading.group(1)) if section_heading else ""
        if heading_label != label:
            failures.append(
                f"index.html: authority section #{identifier} heading must be {label}"
            )
        failures.extend(
            check_authority_section(
                sections[identifier],
                identifier,
                label,
                AUTHORITY_STATEMENTS[identifier],
            )
        )

    home_text = core.visible_text(rendered_home)
    adopt_text = core.visible_text(sections["adopt"])
    if any(
        len(re.findall(pattern, home_text, re.I)) != 1
        or len(re.findall(pattern, adopt_text, re.I)) != 1
        for pattern in PRIMARY_INSTALL_PATTERNS
    ):
        failures.append("index.html: install commands must appear only inside #adopt")
    if re.search(RETIRED_GITHUB_SOURCE_INSTALL_PATTERN, home_text, re.I):
        failures.append("index.html: retired GitHub-source install command")
    if GITHUB_AGENT_SKILLS_BOUNDARY not in adopt_text:
        failures.append(
            "index.html: github-agent-skills boundary must be "
            f"{GITHUB_AGENT_SKILLS_BOUNDARY!r}"
        )

    llms_path = root / "llms.txt"
    llms = llms_path.read_text(encoding="utf-8") if llms_path.is_file() else ""
    failures.extend(check_llms_authority_surface(llms))
    if any(re.search(pattern, llms, re.I) for pattern in PRIMARY_INSTALL_PATTERNS):
        failures.append("llms.txt: supported install commands must link to /#adopt instead")
    if re.search(RETIRED_GITHUB_SOURCE_INSTALL_PATTERN, llms, re.I):
        failures.append("llms.txt: retired GitHub-source install command")
    if (
        GITHUB_AGENT_SKILLS_URL not in llms
        or GITHUB_AGENT_SKILLS_BOUNDARY not in llms
    ):
        failures.append("llms.txt: github-agent-skills adoption entry is incomplete")

    agent_tooling_path = root / "docs" / "agent-tooling.md"
    agent_tooling = (
        agent_tooling_path.read_text(encoding="utf-8")
        if agent_tooling_path.is_file()
        else ""
    )
    if (
        GITHUB_AGENT_SKILLS_URL not in agent_tooling
        or GITHUB_AGENT_SKILLS_BOUNDARY not in agent_tooling
        or any(
            command not in agent_tooling
            for command in (
                "git clone https://github.com/ryanduguid/github-agent-skills.git",
                "cd github-agent-skills",
                "pwsh -File scripts/sync-skills.ps1",
            )
        )
    ):
        failures.append("docs/agent-tooling.md: github-agent-skills setup is incomplete")

    if core.section_html(home, "engage") or "/#engage" in home.casefold():
        failures.append("index.html: retired Engage route must not be visible")

    for path in core.html_files(root):
        rel = path.relative_to(root).as_posix()
        if rel == "index.html" or rel in NOT_INDEXED:
            continue
        page_html = path.read_text(encoding="utf-8")
        page_text = core.visible_text(page_html)
        page_json_ld = " ".join(
            json.dumps(block, ensure_ascii=False)
            for block in core.json_ld_blocks(page_html, rel, failures)
        )
        indexable_text = f"{page_text} {page_json_ld}"
        if rel == MCP_REL:
            # The AI-agent page carries its own two MCP commands, mirroring the
            # canonical #adopt block, so its highest-intent readers do not have
            # to navigate back to the homepage.
            if any(
                len(re.findall(pattern, page_text, re.I)) != 1
                for pattern in MCP_PAGE_INSTALL_PATTERNS
            ):
                failures.append(
                    f"{rel}: MCP install commands must appear exactly once each"
                )
            banned_patterns = tuple(
                pattern
                for pattern in PRIMARY_INSTALL_PATTERNS
                if pattern not in MCP_PAGE_INSTALL_PATTERNS
            )
        else:
            banned_patterns = PRIMARY_INSTALL_PATTERNS
        if any(
            re.search(pattern, indexable_text, re.I)
            for pattern in banned_patterns
        ):
            failures.append(f"{rel}: supported install commands must link to /#adopt instead")
        if re.search(RETIRED_GITHUB_SOURCE_INSTALL_PATTERN, indexable_text, re.I):
            failures.append(f"{rel}: retired GitHub-source install command")

    for rel in ("about/index.html", "contact/index.html"):
        path = root / rel
        page = path.read_text(encoding="utf-8") if path.is_file() else ""
        page_text = core.visible_text(page)
        if (
            "mailto:" in page.casefold()
            or "not a practice" not in page_text.casefold()
            or "not accepting professional engagements through this site"
            not in page_text.casefold()
            or not re.search(
                r"\b(?:do\s+not|don't|never)\b.{0,100}\bclient\s+files?\b",
                page_text,
                re.S | re.I,
            )
        ):
            failures.append(f"{rel}: non-practice boundary is incomplete")

    evidence_path = root / EVIDENCE_REL
    evidence_html = evidence_path.read_text(encoding="utf-8") if evidence_path.is_file() else ""
    rendered_evidence = core.visible_html(evidence_html)
    evidence_headings = core.heading_texts(rendered_evidence)
    if any(heading.casefold() not in evidence_headings for heading in ASSURANCE_HEADINGS):
        failures.append("evidence/index.html: missing assurance heading")
    if CA_ANZ_NON_ENDORSEMENT not in core.visible_text(rendered_evidence):
        failures.append("evidence/index.html: missing CA ANZ non-endorsement boundary")

    short_answer = re.search(
        r'<p\b(?=[^>]*\bclass\s*=\s*["\'][^"\']*\bshort-answer\b[^"\']*["\'])[^>]*>'
        r".*?</p\s*>",
        rendered_evidence,
        re.S | re.I,
    )
    contents_nav = re.search(
        r'<nav\b(?=[^>]*\bclass\s*=\s*["\'][^"\']*\bcontents-nav\b[^"\']*["\'])[^>]*>'
        r".*?</nav\s*>",
        rendered_evidence,
        re.S | re.I,
    )
    first_assurance_heading = re.search(
        rf'<h[1-6]\b(?=[^>]*\bid\s*=\s*["\']{next(iter(ASSURANCE_ANCHORS))}["\'])[^>]*>',
        rendered_evidence,
        re.I,
    )
    anchored_headings = {}
    for identifier in ASSURANCE_ANCHORS:
        match = re.search(
            rf'<h[1-6]\b(?=[^>]*\bid\s*=\s*["\']{re.escape(identifier)}["\'])[^>]*>'
            r"(.*?)</h[1-6]\s*>",
            rendered_evidence,
            re.S | re.I,
        )
        anchored_headings[identifier] = core.visible_text(match.group(1)) if match else ""
    expected_contents_hrefs = [f"#{identifier}" for identifier in ASSURANCE_ANCHORS]
    contents_hrefs = core.anchor_hrefs(contents_nav.group(0)) if contents_nav else []
    contents_labels = (
        [
            core.visible_text(label)
            for label in re.findall(
                r"<a\b[^>]*>(.*?)</a\s*>", contents_nav.group(0), re.S | re.I
            )
        ]
        if contents_nav
        else []
    )
    if (
        not short_answer
        or not contents_nav
        or not first_assurance_heading
        or contents_nav.start() < short_answer.end()
        or contents_nav.end() > first_assurance_heading.start()
        or contents_hrefs != expected_contents_hrefs
        or contents_labels != list(ASSURANCE_ANCHORS.values())
        or anchored_headings != ASSURANCE_ANCHORS
    ):
        failures.append(
            "evidence/index.html: contents navigator does not match assurance headings"
        )

    for path in sorted(root.glob("tools/*/index.html")):
        rel = path.relative_to(root).as_posix()
        if rel in NOT_INDEXED:
            continue
        if "/evidence/" not in core.anchor_hrefs(core.visible_html(path.read_text(encoding="utf-8"))):
            failures.append(f"{rel}: no visible link to /evidence/")

    mcp_rel = MCP_REL
    mcp_path = root / mcp_rel
    mcp_html = mcp_path.read_text(encoding="utf-8") if mcp_path.is_file() else ""
    rendered_mcp = core.visible_html(mcp_html)
    failures.extend(check_mcp_review_dates(mcp_html))
    if AUS_ACCOUNTING_PYPI not in core.anchor_hrefs(rendered_mcp):
        failures.append(f"{mcp_rel}: no visible PyPI route")
    uncommented_mcp = re.sub(r"<!--.*?-->", " ", mcp_html, flags=re.S)
    json_ld_text = " ".join(
        json.dumps(block, ensure_ascii=False)
        for block in core.json_ld_blocks(uncommented_mcp, mcp_rel, failures)
    )
    if re.search(r"\bfirst\s+pypi\s+release\b", core.visible_text(rendered_mcp), re.I) or re.search(
        r"\bfirst\s+pypi\s+release\b", json_ld_text, re.I
    ):
        failures.append(f"{mcp_rel}: stale first-PyPI-release claim")
    return failures


def check_payday_receipt_boundary(html: str) -> list[str]:
    """Keep the three missing-receipt branches accurate without freezing prose."""
    failures: list[str] = []
    visible_html = re.sub(
        r"<(script|style|template)\b.*?</\1>", " ", html, flags=re.S | re.I
    )
    visible_html = re.sub(r"<!--.*?-->", " ", visible_html, flags=re.S)
    paragraphs = [
        core.visible_text(paragraph)
        for paragraph in re.findall(r"<p\b[^>]*>.*?</p>", visible_html, re.S | re.I)
    ]
    text = " ".join(paragraphs)

    categorical_at_risk = (
        r"\b(?:without|missing|no)\b.{0,80}\b(?:fund[- ]?)?receipt(?:\s+date|\s+evidence)?\b"
        r".{0,80}\b(?:can|will)\s+only\b.{0,40}\b(?:at[-_ ]risk|unknown)\b"
    )
    if re.search(categorical_at_risk, text, re.S | re.I):
        failures.append(
            "tools/payday-super/index.html: must not say a missing receipt can only be "
            "at-risk or unknown"
        )

    boundary_patterns = (
        r"\b(?:without|missing|no)\b.{0,80}\b(?:fund[- ]?)?receipt(?:\s+date|\s+evidence)?\b"
        r".{0,100}\b(?:cannot|can't|does\s+not|doesn't)\b.{0,40}\bprov\w*\b"
        r".{0,30}\bon[-_ ]time\b",
        r"\bremittance\s+tim\w*\b.{0,80}\bprov\w*\b.{0,30}\blate\b",
        r"\btimely\s+remittance\b.{0,80}\bwithout\b.{0,50}"
        r"\b(?:fund[- ]?)?receipt(?:\s+date|\s+evidence)?\b.{0,80}"
        r"\b(?:remain\w*|stay\w*|is)\b.{0,30}\bat[-_ ]risk\b",
    )
    if not any(
        all(re.search(pattern, paragraph, re.S | re.I) for pattern in boundary_patterns)
        for paragraph in paragraphs
    ):
        failures.append(
            "tools/payday-super/index.html: no visible paragraph says missing receipt "
            "cannot prove on-time, remittance timing can prove late, and timely remittance "
            "without receipt remains at-risk"
        )
    return failures


def check_worked_examples() -> list[str]:
    """Keep each synthetic example visible and tied to tagged test evidence."""
    failures: list[str] = []
    for rel, expected in WORKED_EXAMPLES.items():
        html = (core.ROOT / rel).read_text(encoding="utf-8")
        visible_html = re.sub(
            r"<(script|style|template)\b.*?</\1>", " ", html, flags=re.S | re.I
        )
        visible_html = re.sub(r"<!--.*?-->", " ", visible_html, flags=re.S)
        heading = re.search(
            r"<h([1-6])\b[^>]*>.*?\bsynthetic\s+worked\s+example\b.*?</h\1>",
            visible_html,
            re.S | re.I,
        )
        if not heading:
            failures.append(f"{rel}: no visible Synthetic worked example heading")
            example_html = ""
        else:
            remainder = visible_html[heading.end():]
            next_heading = re.search(r"<h[1-6]\b", remainder, re.I)
            example_end = (
                heading.end() + next_heading.start() if next_heading else len(visible_html)
            )
            example_html = visible_html[heading.start():example_end]
        example_text = core.visible_text(example_html)

        for fixture_url in expected["fixture_urls"]:
            if not re.search(
                rf'<a\b[^>]*href="{re.escape(fixture_url)}"[^>]*>',
                example_html,
                re.I,
            ):
                failures.append(f"{rel}: no visible tagged fixture link to {fixture_url}")
        if re.search(r'href="[^"]*github\.com/[^"]*/blob/main/', example_html, re.I):
            failures.append(f"{rel}: worked-example evidence must not use an unpinned main URL")

        for label, pattern in expected["labels"].items():
            if not re.search(pattern, example_text, re.I):
                failures.append(f"{rel}: visible worked example does not label {label}")
        if rel == "tools/payday-super/index.html":
            failures.extend(check_payday_receipt_boundary(html))
    return failures


def evaluation_article_html(
    rendered: str, rel: str, failures: list[str]
) -> str | None:
    """Return the sole visible evaluator article within the sole main#main."""
    root = core.parse_structure(rendered)
    mains = core.descendants(root, "main", rendered_only=True)
    if len(mains) != 1:
        failures.append(
            f"{rel}: expected exactly one visible main, found {len(mains)}"
        )
        return None
    if mains[0].attr("id") != "main":
        failures.append(
            f"{rel}: visible main id must be 'main', found {mains[0].attr('id')!r}"
        )
        return None

    articles = core.descendants(root, "article", rendered_only=True)
    contained_articles = [
        article for article in articles if core.is_descendant(article, mains[0])
    ]
    if len(contained_articles) != 1:
        failures.append(
            f"{rel}: main#main must contain exactly one visible evaluator article, "
            f"found {len(contained_articles)}"
        )
        return None
    if len(articles) != 1:
        failures.append(
            f"{rel}: expected exactly one visible evaluator article, "
            f"found {len(articles)}"
        )
        return None

    article_match = re.search(
        r"<article\b[^>]*>.*?</article\s*>", rendered, re.S | re.I
    )
    if article_match is None:
        failures.append(f"{rel}: could not isolate the visible evaluator article")
        return None
    return article_match.group(0)


def check_evaluation_structure(
    rendered: str, rel: str, expected: dict, failures: list[str]
) -> None:
    """Require the evaluator's body sections, headings, order and assurance link."""
    root = core.parse_structure(rendered)
    configured_sections = expected["sections"]
    configured_ids = [identifier for identifier, _heading in configured_sections]
    actual_ids = [
        section.attr("id") or ""
        for section in core.descendants(root, "section", rendered_only=True)
    ]
    if actual_ids != configured_ids:
        failures.append(
            f"{rel}: evaluation section order must be {configured_ids!r}, "
            f"found {actual_ids!r}"
        )

    sections_by_id = {
        identifier: [
            section
            for section in core.descendants(root, "section", rendered_only=True)
            if section.attr("id") == identifier
        ]
        for identifier in configured_ids
    }
    for identifier, configured_heading in configured_sections:
        sections = sections_by_id[identifier]
        if len(sections) != 1:
            failures.append(
                f"{rel}: section #{identifier} must appear exactly once, "
                f"found {len(sections)}"
            )
            continue
        headings = core.descendants(sections[0], "h2", rendered_only=True)
        actual_heading = core.element_text(headings[0]) if len(headings) == 1 else ""
        if actual_heading != configured_heading:
            failures.append(
                f"{rel}: #{identifier} heading must be {configured_heading!r}, "
                f"found {actual_heading!r}"
            )

    limitations = sections_by_id.get("limitations", [])
    assurance_count = 0
    if len(limitations) == 1:
        assurance_count = sum(
            anchor.attr("href") == "/evidence/"
            and core.element_text(anchor) == "Evidence and Assurance"
            for anchor in core.descendants(limitations[0], "a", rendered_only=True)
        )
    if assurance_count != 1:
        failures.append(
            f"{rel}: #limitations must link /evidence/ with visible label "
            f"'Evidence and Assurance' exactly once, found {assurance_count}"
        )


def check_evaluation_packs(root: Path = core.ROOT) -> list[str]:
    """Keep evaluator pages tied to immutable fabricated evidence."""
    failures: list[str] = []
    listed = core.sitemap_urls(root)
    llms = (root / "llms.txt").read_text(encoding="utf-8")
    for rel, expected in EVALUATION_PACKS.items():
        url = expected["url"]
        sitemap_count = listed.count(url)
        if sitemap_count != 1:
            failures.append(
                f"sitemap.xml: evaluation URL {url} must appear once, "
                f"found {sitemap_count}"
            )
        sitemap_lastmod = expected.get("sitemap_lastmod")
        if sitemap_lastmod:
            actual_lastmods = core.sitemap_lastmods(url, root)
            if actual_lastmods != [sitemap_lastmod]:
                failures.append(
                    f"sitemap.xml: evaluation URL {url} must have lastmod "
                    f"{sitemap_lastmod!r} exactly once, found {actual_lastmods!r}"
                )
        llms_section = expected.get("llms_section")
        llms_count = llms.count(url)
        if llms_count != 1:
            global_suffix = " globally" if llms_section else ""
            failures.append(
                f"llms.txt: evaluation URL {url} must appear once{global_suffix}, "
                f"found {llms_count}"
            )
        if llms_section:
            section_count = core.markdown_section(llms, llms_section).count(url)
            if section_count != 1:
                failures.append(
                    f"llms.txt: evaluation URL {url} must appear once in ## "
                    f"{llms_section}, found {section_count}"
                )

        path = root / rel
        if not path.is_file():
            failures.append(f"{rel}: evaluation page does not exist")
            continue

        html = path.read_text(encoding="utf-8")
        page_nodes = [
            node
            for block in core.json_ld_blocks(html, rel, failures)
            for node in core.nodes(block)
        ]
        articles = [node for node in page_nodes if core.has_type(node, "TechArticle")]
        if len(articles) != 1 or articles[0].get("author") != {"@id": PERSON_ID}:
            failures.append(
                f"{rel}: TechArticle must be authored by the canonical Person"
            )

        rendered = core.visible_html(html)
        article_html = evaluation_article_html(rendered, rel, failures)
        if article_html is None:
            continue
        rendered = article_html
        text = core.visible_text(rendered)
        hrefs = core.anchor_hrefs(rendered)
        check_evaluation_structure(rendered, rel, expected, failures)
        for label in expected["labels"]:
            if label not in text:
                failures.append(f"{rel}: missing visible evaluation label {label!r}")
        for label in expected["version_labels"]:
            if label not in text:
                failures.append(f"{rel}: missing visible version label {label!r}")
        if "v0.1.0" in text:
            failures.append(
                f"{rel}: visible evaluator text must not name v0.1.0"
            )
        for contract_text in expected["contract_text"]:
            if contract_text not in text:
                failures.append(
                    f"{rel}: missing visible contract text {contract_text!r}"
                )
        for section_id, required_texts in expected.get("section_contract_text", {}).items():
            section_text = core.visible_text(core.section_html(rendered, section_id))
            for required_text in required_texts:
                if required_text not in section_text:
                    failures.append(
                        f"{rel}: #{section_id} missing visible contract text "
                        f"{required_text!r}"
                    )
        for section_id, configured_hrefs in (
            ("versions", expected["product_evidence_urls"]),
            ("primary-sources", expected["primary_source_urls"]),
        ):
            actual_hrefs = core.anchor_hrefs(core.section_html(rendered, section_id))
            missing_hrefs = list(
                (Counter(configured_hrefs) - Counter(actual_hrefs)).elements()
            )
            unexpected_hrefs = list(
                (Counter(actual_hrefs) - Counter(configured_hrefs)).elements()
            )
            if missing_hrefs or unexpected_hrefs:
                failures.append(
                    f"{rel}: #{section_id} evidence hrefs must match exactly once; "
                    f"missing {missing_hrefs!r}; unexpected {unexpected_hrefs!r}"
                )

        product_repository = expected["product_repository"].casefold().removeprefix(
            "https://"
        )
        product_hrefs = [href for href in hrefs if product_repository in href.casefold()]

        product_evidence_urls = expected["product_evidence_urls"]
        same_repository_primary_sources = [
            href
            for href in expected["primary_source_urls"]
            if product_repository in href.casefold()
        ]
        global_product_evidence_urls = (
            *product_evidence_urls,
            *same_repository_primary_sources,
        )
        permanent_commit = expected.get("permanent_commit")
        if permanent_commit:
            version_hrefs = core.anchor_hrefs(core.section_html(rendered, "versions"))
            for href in product_hrefs:
                if href not in version_hrefs:
                    continue
                if "/blob/main/" in href.casefold():
                    failures.append(
                        f"{rel}: product evidence URL must not use /blob/main/: {href}"
                    )
                revision_match = re.search(r"/(?:blob|tree)/([^/]+)/", href, re.I)
                if revision_match and not re.fullmatch(
                    r"[0-9a-f]{40}", revision_match.group(1), re.I
                ):
                    failures.append(
                        f"{rel}: product evidence URL must contain a 40-character "
                        f"commit: {href}"
                    )
                elif revision_match and revision_match.group(1) != permanent_commit:
                    failures.append(
                        f"{rel}: product evidence URL commit must be "
                        f"{permanent_commit}: {href}"
                    )
        missing_product_hrefs = list(
            (
                Counter(global_product_evidence_urls)
                - Counter(product_hrefs)
            ).elements()
        )
        unexpected_product_hrefs = list(
            (
                Counter(product_hrefs)
                - Counter(global_product_evidence_urls)
            ).elements()
        )
        if missing_product_hrefs or unexpected_product_hrefs:
            failures.append(
                f"{rel}: {expected['product_evidence_contract']}; missing "
                f"{missing_product_hrefs!r}; unexpected {unexpected_product_hrefs!r}"
            )

        reproduce_html = core.section_html(rendered, "reproduce")
        code_blocks = re.findall(
            r"<code\b[^>]*>(.*?)</code\s*>", reproduce_html, re.S | re.I
        )
        if len(code_blocks) != 1:
            failures.append(
                f"{rel}: #reproduce must contain exactly one visible code block, "
                f"found {len(code_blocks)}"
            )
        else:
            recipe = html_lib.unescape(code_blocks[0]).replace("\r\n", "\n").replace(
                "\r", "\n"
            )
            recipe_lines = [line.rstrip() for line in recipe.split("\n")]
            while recipe_lines and not recipe_lines[-1]:
                recipe_lines.pop()
            configured_recipe = list(expected["reproduction_recipe"])
            if len(recipe_lines) != len(configured_recipe):
                failures.append(
                    f"{rel}: #reproduce must contain the configured "
                    f"{len(configured_recipe)}-line recipe, "
                    f"found {len(recipe_lines)} lines"
                )
            else:
                for line_number, (actual_line, configured_line) in enumerate(
                    zip(recipe_lines, configured_recipe), start=1
                ):
                    if actual_line != configured_line:
                        failures.append(
                            f"{rel}: #reproduce line {line_number} must be "
                            f"{configured_line!r}, found {actual_line!r}"
                        )
                        break
        if "/evidence/" not in hrefs:
            failures.append(f"{rel}: no visible link to /evidence/")
        if re.search(r"\bcase[- ]stud(?:y|ies)\b", rendered, re.I):
            failures.append(f"{rel}: must not use client case-study wording")
    return failures


def check_xero_evaluation_summary(root: Path = core.ROOT) -> list[str]:
    """Keep the Xero proof summary concise, complete and review bounded."""
    rel = "evaluate/xero-trial-balance-integrity/index.html"
    path = root / rel
    if not path.is_file():
        return [f"{rel}: evaluation summary is incomplete"]

    rendered = core.visible_html(path.read_text(encoding="utf-8"))
    summaries = re.findall(
        r'<dl\b(?=[^>]*\bclass\s*=\s*["\'][^"\']*\bevaluation-summary\b'
        r'[^"\']*["\'])[^>]*>.*?</dl\s*>',
        rendered,
        re.S | re.I,
    )
    required = (
        "Problem An automated trial balance export can look tidy while one balance "
        "pair is wrong.",
        "Control Check movement and year-to-date debits against credits before any "
        "CSV write.",
        "Evidence Three fabricated fixtures isolate a passing file, a movement "
        "failure and a YTD failure.",
        "Result One run exits 0. Two runs exit 1 and report that nothing was written.",
        "Limit Balance does not prove completeness, classification or approval.",
    )
    if len(summaries) != 1:
        return [f"{rel}: evaluation summary is incomplete"]
    text = core.visible_text(summaries[0])
    if any(value not in text for value in required):
        return [f"{rel}: evaluation summary is incomplete"]
    return []


def check_robots_policy(robots: str) -> list[str]:
    """Keep search and user retrieval open while blocking training crawlers."""
    failures: list[str] = []
    if any(comment not in robots for comment in CRAWLER_POLICY_COMMENTS):
        failures.append("robots.txt: missing written search-versus-training policy")
    groups = core.robots_groups(robots)
    expected = {"*": ["Allow: /"]}
    expected.update({agent: ["Allow: /"] for agent in RETRIEVAL_CRAWLERS})
    expected.update({agent: ["Disallow: /"] for agent in TRAINING_CRAWLERS})

    for agent, directives in expected.items():
        if groups.get(agent) != directives:
            failures.append(
                f"robots.txt: {agent} must have exactly {directives!r}, found "
                f"{groups.get(agent)!r}"
            )
    unexpected = sorted(set(groups) - set(expected))
    if unexpected:
        failures.append(
            f"robots.txt: unclassified crawler groups are not allowed: {', '.join(unexpected)}"
        )
    for agent in UNCLASSIFIED_CRAWLERS:
        if agent.casefold() in robots.casefold():
            failures.append(f"robots.txt: must not mention unclassified crawler {agent}")
    return failures


def check_shared_shell(html: str, rel: str, failures: list[str]) -> None:
    """Require one skip target and the exact global primary navigation."""
    root = core.parse_structure(html)
    mains = core.descendants(root, "main", rendered_only=True)
    if len(mains) != 1 or mains[0].attr("id") != "main":
        failures.append(
            f"{rel}: expected exactly one rendered main#main, found "
            f"{len(mains)} main elements"
        )

    skip_links = []
    for link in core.descendants(root, "a", rendered_only=True):
        if link.has_class("skip-link") and link.attr("href") == "#main":
            skip_links.append(link)
    if len(skip_links) != 1:
        failures.append(
            f"{rel}: expected exactly one .skip-link targeting #main, found {len(skip_links)}"
        )

    primary_blocks = [
        nav
        for nav in core.descendants(root, "nav", rendered_only=True)
        if nav.attr("aria-label") == "Primary"
    ]
    if len(primary_blocks) != 1:
        failures.append(
            f"{rel}: expected exactly one nav labelled Primary, found {len(primary_blocks)}"
        )
        return

    links = [
        (link.attr("href"), core.element_text(link))
        for link in core.descendants(primary_blocks[0], "a", rendered_only=True)
    ]
    if links != PRIMARY_NAV_LINKS:
        failures.append(f"{rel}: primary navigation is {links!r}, expected {PRIMARY_NAV_LINKS!r}")

    expected_current: dict[str, str] = {}
    if rel == "tools/index.html":
        expected_current["/tools/"] = "page"
    elif rel.startswith("tools/"):
        expected_current["/tools/"] = "location"
    elif rel == "contact/index.html":
        expected_current["/contact/"] = "page"
    elif rel == "rates/index.html":
        expected_current["/rates/"] = "page"
    elif rel.startswith("rates/"):
        expected_current["/rates/"] = "location"
    elif rel == EVIDENCE_REL:
        expected_current["/evidence/"] = "page"
    elif rel == "about/index.html":
        expected_current["/about/"] = "page"

    actual_current = {
        link.attr("href"): link.attr("aria-current")
        for link in core.descendants(primary_blocks[0], "a", rendered_only=True)
        if link.attr("aria-current") is not None
    }
    if actual_current != expected_current:
        failures.append(
            f"{rel}: primary navigation current states are {actual_current!r}, "
            f"expected {expected_current!r}"
        )


def collection_breadcrumb_shape(
    rel: str,
    current_name: str,
) -> list[tuple[str, str | None, str]] | None:
    """Return visible href and canonical URL for a collection breadcrumb."""
    current_url = core.site_url(rel, SITE)
    if rel == "tools/index.html":
        parents = [("Home", "/", f"{SITE}/")]
    elif rel.startswith("tools/") and rel not in STATIC_REDIRECTS:
        parents = [("Home", "/", f"{SITE}/"), ("Tools", "/tools/", f"{SITE}/tools/")]
    elif rel == "evaluate/index.html":
        parents = [("Home", "/", f"{SITE}/")]
    elif rel.startswith("evaluate/"):
        parents = [
            ("Home", "/", f"{SITE}/"),
            ("Evaluations", "/evaluate/", f"{SITE}/evaluate/"),
        ]
    elif rel == "rates/index.html":
        parents = [("Home", "/", f"{SITE}/")]
    elif rel.startswith("rates/"):
        parents = [("Home", "/", f"{SITE}/"), ("Rates", "/rates/", f"{SITE}/rates/")]
    else:
        return None
    return [*parents, (current_name, None, current_url)]


def check_collection_breadcrumb(html: str, rel: str, failures: list[str]) -> None:
    """Keep visible and structured collection breadcrumbs in the same hierarchy."""
    root = core.parse_structure(html)
    h1s = core.descendants(root, "h1", rendered_only=True)
    if len(h1s) != 1:
        failures.append(f"{rel}: collection breadcrumb needs exactly one H1")
        return
    leaf_name = BREADCRUMB_LEAF_NAMES.get(rel, core.element_text(h1s[0]))
    expected = collection_breadcrumb_shape(rel, leaf_name)
    if expected is None:
        return

    breadcrumbs = [
        nav
        for nav in core.descendants(root, "nav", rendered_only=True)
        if nav.attr("aria-label") == "Breadcrumb"
    ]
    if len(breadcrumbs) != 1:
        failures.append(
            f"{rel}: expected exactly one nav labelled Breadcrumb, found {len(breadcrumbs)}"
        )
    else:
        items = core.descendants(breadcrumbs[0], "li", rendered_only=True)
        actual_names = [core.element_text(item) for item in items]
        expected_names = [name for name, _, _ in expected]
        if actual_names != expected_names:
            failures.append(
                f"{rel}: visible breadcrumb is {actual_names!r}, expected {expected_names!r}"
            )
        for index, (name, href, _) in enumerate(expected):
            if index >= len(items):
                break
            links = core.descendants(items[index], "a", rendered_only=True)
            actual_href = links[0].attr("href") if len(links) == 1 else None
            if href is not None and actual_href != href:
                failures.append(
                    f"{rel}: breadcrumb {name!r} points to {actual_href!r}, expected {href!r}"
                )
            if href is None and (
                links or items[index].attr("aria-current") != "page"
            ):
                failures.append(
                    f"{rel}: current breadcrumb {name!r} must be unlinked and aria-current=page"
                )

    parse_failures: list[str] = []
    structured = [
        node
        for block in core.json_ld_blocks(html, rel, parse_failures)
        for node in core.nodes(block)
        if core.has_type(node, "BreadcrumbList")
    ]
    failures.extend(parse_failures)
    if len(structured) != 1:
        failures.append(
            f"{rel}: expected exactly one BreadcrumbList, found {len(structured)}"
        )
        return
    elements = structured[0].get("itemListElement")
    expected_structured = [
        {
            "@type": "ListItem",
            "position": index,
            "name": name,
            "item": canonical,
        }
        for index, (name, _, canonical) in enumerate(expected, start=1)
    ]
    if elements != expected_structured:
        failures.append(f"{rel}: BreadcrumbList does not match the visible hierarchy")


def check_collection_hubs(root: Path = core.ROOT) -> list[str]:
    """Require each collection hub's visible register and ItemList to agree."""
    failures: list[str] = []
    for rel, contract in COLLECTION_HUBS.items():
        path = root / rel
        if not path.is_file():
            failures.append(f"{rel}: missing collection hub")
            continue
        html = path.read_text(encoding="utf-8")
        parsed = core.parse_structure(html)
        h1s = core.descendants(parsed, "h1", rendered_only=True)
        expected_h1 = contract["h1"]
        if len(h1s) != 1 or core.element_text(h1s[0]) != expected_h1:
            failures.append(f"{rel}: collection H1 must be {expected_h1!r}")

        registers = [
            element
            for element in core.descendants(parsed, rendered_only=True)
            if element.has_class("collection-register")
        ]
        expected_entries = contract["entries"]
        if len(registers) != 1:
            failures.append(
                f"{rel}: expected one collection register, found {len(registers)}"
            )
        else:
            rows = [
                element
                for element in core.descendants(registers[0], rendered_only=True)
                if element.has_class("collection-entry")
            ]
            actual_entries: list[tuple[str | None, str]] = []
            for row in rows:
                title_links = [
                    link
                    for link in core.descendants(row, "a", rendered_only=True)
                    if link.has_class("collection-entry__title")
                ]
                if len(title_links) == 1:
                    actual_entries.append(
                        (title_links[0].attr("href"), core.element_text(title_links[0]))
                    )
            if actual_entries != expected_entries:
                failures.append(
                    f"{rel}: collection entries are {actual_entries!r}, "
                    f"expected {expected_entries!r}"
                )

        parse_failures: list[str] = []
        nodes = [
            node
            for block in core.json_ld_blocks(html, rel, parse_failures)
            for node in core.nodes(block)
        ]
        failures.extend(parse_failures)
        webpages = [node for node in nodes if core.has_type(node, "WebPage")]
        item_lists = [node for node in nodes if core.has_type(node, "ItemList")]
        if len(webpages) != 1:
            failures.append(f"{rel}: expected exactly one WebPage in JSON-LD")
        else:
            for field in ("author", "publisher"):
                if webpages[0].get(field) != {"@id": PERSON_ID}:
                    failures.append(f"{rel}: WebPage {field} must reference the canonical Person")
        if len(item_lists) != 1:
            failures.append(f"{rel}: expected exactly one ItemList in JSON-LD")
            continue
        items = item_lists[0].get("itemListElement")
        expected_structured = [
            {
                "@type": "ListItem",
                "position": position,
                "name": name,
                "url": f"{SITE}{href}",
            }
            for position, (href, name) in enumerate(expected_entries, start=1)
        ]
        if item_lists[0].get("numberOfItems") != len(expected_entries):
            failures.append(f"{rel}: ItemList count does not match visible entries")
        if items != expected_structured:
            failures.append(f"{rel}: ItemList entries do not match the visible register")
    return failures


def check_file_contracts(path: Path) -> list[str]:
    """Check contracts specific to this site's shell and content."""
    failures: list[str] = []
    rel = path.relative_to(core.ROOT).as_posix()
    html = path.read_text(encoding="utf-8")

    if rel not in STATIC_REDIRECTS:
        check_shared_shell(html, rel, failures)
    if rel == "index.html":
        check_homepage_contract(html, failures)
    if rel in ARTICLE_PATTERN_PAGES:
        check_article_pattern(html, rel, failures)
    if rel in RATE_PAGES:
        check_rate_table_region(html, rel, failures)
    if rel == CALCULATOR_REL:
        check_calculator_contract(html, failures)
    check_approved_page_opening(html, rel, failures)
    check_header_review_date(html, rel, failures)
    check_collection_breadcrumb(html, rel, failures)

    return failures


def forbidden_identity_url_labels(text: str) -> set[str]:
    """Return exact identity URL policy violations found in public text."""
    labels: set[str] = set()
    for match in re.finditer(r"https://[^\s\"'<>]+", text):
        candidate = match.group(0).rstrip("),.;:`]}")
        parts = urlsplit(candidate)
        host = (parts.hostname or "").lower()
        if host == "ryanduguid.github.io":
            labels.add("retired github.io canonical URL")
        if (
            host in {"linkedin.com", "www.linkedin.com"}
            and parts.path.rstrip("/") == "/in/ryanduguid"
        ):
            labels.add("unhyphenated US namesake URL")
    return labels


def check_social_cards(root: Path = core.ROOT) -> list[str]:
    """Require five reproducible OLED register cards and their provenance."""
    failures: list[str] = []
    template_path = root / "assets" / "social-card-template.svg"
    if not template_path.is_file():
        failures.append("assets/social-card-template.svg: missing editable card template")
    else:
        template_text = template_path.read_text(encoding="utf-8")
        try:
            template = ET.fromstring(template_text)
        except ET.ParseError:
            failures.append(
                "assets/social-card-template.svg: editable card template is invalid SVG"
            )
        else:
            expected_width, expected_height = SOCIAL_CARD_DIMENSIONS
            if (
                template.tag.rsplit("}", 1)[-1] != "svg"
                or template.get("width") != str(expected_width)
                or template.get("height") != str(expected_height)
                or template.get("viewBox")
                != f"0 0 {expected_width} {expected_height}"
            ):
                failures.append(
                    "assets/social-card-template.svg: template dimensions changed"
                )
            fills = {
                fill.casefold()
                for element in template.iter()
                if (fill := element.get("fill")) is not None
            }
            if fills != SOCIAL_CARD_COLOURS:
                failures.append(
                    "assets/social-card-template.svg: OLED palette is incomplete or changed"
                )
            if any(
                element.tag.rsplit("}", 1)[-1] == "image"
                for element in template.iter()
            ):
                failures.append(
                    "assets/social-card-template.svg: template must not contain portrait imagery"
                )
        missing_placeholders = sorted(
            placeholder
            for placeholder in SOCIAL_CARD_TEMPLATE_PLACEHOLDERS
            if placeholder not in template_text
        )
        if missing_placeholders:
            failures.append(
                "assets/social-card-template.svg: missing renderer placeholders "
                f"{missing_placeholders!r}"
            )

    data_path = root / "assets" / "social-cards.json"
    configured: object = {}
    if not data_path.is_file():
        failures.append("assets/social-cards.json: missing social-card data")
    else:
        try:
            configured = json.loads(data_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            failures.append("assets/social-cards.json: social-card data is invalid JSON")
    expected_data = {
        card_id: {
            **record,
            "alt": "OLED register card: " + " ".join(record["heading"]),
        }
        for card_id, record in SOCIAL_CARD_CONTEXTS.items()
    }
    if configured != expected_data:
        failures.append(
            "assets/social-cards.json: social-card context copy or mapping is stale"
        )

    readme_path = root / "README.md"
    readme_lines = (
        readme_path.read_text(encoding="utf-8").splitlines()
        if readme_path.is_file()
        else []
    )
    for card_id, record in SOCIAL_CARD_CONTEXTS.items():
        output = record["output"]
        asset_rel = f"assets/{output}"
        card_path = root / asset_rel
        card: bytes | None = None
        if not card_path.is_file():
            failures.append(f"{asset_rel}: missing social card")
        else:
            card = card_path.read_bytes()
            if len(card) < 24 or not card.startswith(b"\x89PNG\r\n\x1a\n"):
                failures.append(f"{asset_rel}: social card is not PNG")
            else:
                width, height = struct.unpack(">II", card[16:24])
                if (width, height) != SOCIAL_CARD_DIMENSIONS:
                    failures.append(f"{asset_rel}: social card dimensions changed")
            if len(card) >= SOCIAL_CARD_MAX_BYTES:
                failures.append(
                    f"{asset_rel}: social card must be under 50,000 bytes"
                )

        provenance_row = next(
            (line for line in readme_lines if f"`{asset_rel}`" in line), ""
        )
        if not provenance_row:
            failures.append(f"README.md: missing provenance for {asset_rel}")
            continue
        if card is not None and hashlib.sha256(card).hexdigest() not in provenance_row:
            failures.append(f"README.md: stale checksum for {asset_rel}")
        for required in (
            "assets/social-card-template.svg",
            "assets/social-cards.json",
            "MIT",
            "Playwright 1.62.1",
            "Chromium",
            "device scale 1",
            "Refresh when",
        ):
            if required not in provenance_row:
                failures.append(
                    f"README.md: {asset_rel} provenance omits {required}"
                )
    return failures


def check_canonical_identity_urls(paths: list[Path]) -> list[str]:
    """Reject the retired site host and the US namesake's LinkedIn URL."""
    failures: list[str] = []
    checked = [
        *paths,
        core.ROOT / "README.md",
        core.ROOT / "llms.txt",
        core.ROOT / "robots.txt",
        core.ROOT / "sitemap.xml",
    ]
    for path in checked:
        if not path.is_file():
            continue
        rel = path.relative_to(core.ROOT).as_posix()
        text = path.read_text(encoding="utf-8")
        for label in sorted(forbidden_identity_url_labels(text)):
            failures.append(f"{rel}: contains the {label}")
    return failures


def check_site_contracts(paths: list[Path]) -> list[str]:
    """Check the cross-page contracts specific to this site."""
    failures: list[str] = []
    robots = (core.ROOT / "robots.txt").read_text(encoding="utf-8")
    failures.extend(check_person_graph(paths))
    failures.extend(check_evidence_page())
    failures.extend(check_authority_surface())
    failures.extend(check_worked_examples())
    failures.extend(check_evaluation_packs())
    failures.extend(check_collection_hubs())
    failures.extend(check_social_cards())
    failures.extend(check_robots_policy(robots))
    failures.extend(check_canonical_identity_urls(paths))
    for rel, target in STATIC_REDIRECTS.items():
        path = core.ROOT / rel
        if not path.is_file():
            failures.append(f"{rel}: missing static redirect page")
            continue
        failures.extend(
            check_static_redirect(path.read_text(encoding="utf-8"), rel, target)
        )
    return failures
