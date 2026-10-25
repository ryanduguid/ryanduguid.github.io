//! The site policy tables of scripts/site_contracts.py at base c8a8239.
use std::sync::LazyLock;

pub const SITE: &str = "https://duguid.com.au";
pub const NOT_INDEXED: [&str; 1] = ["404.html"];
pub const PERSON_ID: &str = "https://duguid.com.au/about/#person";
pub const EVIDENCE_REL: &str = "evidence/index.html";
pub const EVIDENCE_URL: &str = "https://duguid.com.au/evidence/";
pub const AUTHORITY_PATHS: [(&str, &str); 2] = [("adopt", "Adopt"), ("verify", "Verify")];
pub const AUTHORITY_STATEMENTS: [(&str, &str); 2] = [
    ("adopt", "Try each tool with fictional data first"),
    ("verify", "Check the source before the result"),
];
pub const AUTHORITY_URLS: [(&str, &str); 2] = [
    (
        "adopt",
        "https://duguid.com.au/tools/australian-tax-ai-agents/#install",
    ),
    ("verify", EVIDENCE_URL),
];
pub const CODEX_MCP_INSTALL_PATTERN: &str =
    r"\bcodex\s+mcp\s+add\s+aus-accounting\s+--\s+uvx\s+aus-accounting-mcp\b";
pub const GITHUB_AGENT_SKILLS_URL: &str = "https://github.com/ryanduguid/github-agent-skills";
pub const GITHUB_AGENT_SKILLS_BOUNDARY: &str = "github-agent-skills gives Codex and Claude Code the GitHub maintenance workflows this portfolio uses, and keeps the fictional-data and human review boundaries.";
pub const GITHUB_AGENT_SKILLS_INSTALL_PATTERN: &str = concat!(
    r"\bgit\s+clone\s+https://github\.com/ryanduguid/github-agent-skills\.git\s+",
    r"cd\s+github-agent-skills\s+python\s+scripts/validate_skills\.py\s+--strict\b"
);
pub const STABLE_SKILLS_INSTALL_PATTERN: &str = concat!(
    r"\bgit\s+clone\s+https://github\.com/ryanduguid/australian-accounting-skills\.git\s+",
    r"accounting-skills-release\s+git\s+-C\s+accounting-skills-release\s+checkout\s+",
    r"--detach\s+v0\.4\.0\s+",
    r"npx\s+--yes\s+skills@1\.5\.22\s+add\s+",
    r"\./accounting-skills-release\s+--agent\s+codex\s+claude-code\s+",
    r"--skill\s+'\*'\s+--yes\s+--copy\b"
);
pub const PRIMARY_INSTALL_PATTERNS: [&str; 5] = [
    r"\bclaude\s+mcp\s+add\s+aus-accounting\s+--\s+uvx\s+aus-accounting-mcp\b",
    CODEX_MCP_INSTALL_PATTERN,
    STABLE_SKILLS_INSTALL_PATTERN,
    r"\bnpx\s+--yes\s+skills@1\.5\.22\s+add\s+ryanduguid/australian-accounting-skills\b",
    GITHUB_AGENT_SKILLS_INSTALL_PATTERN,
];
pub const RETIRED_GITHUB_SOURCE_INSTALL_PATTERN: &str = concat!(
    r"\bclaude\s+mcp\s+add\s+aus-accounting\s+--\s+uvx\s+--from\s*",
    r"(?:\\\s*)?git\+https://github\.com/ryanduguid/aus-accounting-mcp\s+",
    r"aus-accounting-mcp\b"
);
pub const CA_ANZ_NON_ENDORSEMENT: &str =
    "I am a Provisional CA ANZ Member. CA ANZ has not endorsed this site or its tools.";
pub const MCP_REL: &str = "tools/australian-tax-ai-agents/index.html";
pub const MCP_REVIEW_DATE: &str = "2026-10-21";
pub const MCP_VISIBLE_REVIEW_DATE: &str = "21 October 2026";
pub const ASSURANCE_ANCHORS: [(&str, &str); 10] = [
    (
        "quarter-close-to-forecast",
        "From monthly close to a cash forecast",
    ),
    ("accepted-upstream-work", "Accepted upstream work"),
    ("identity-and-credentials", "Identity and credentials"),
    (
        "packages-releases-and-repositories",
        "Packages, releases and repositories",
    ),
    ("sources-and-review-dates", "Sources and review dates"),
    ("data-and-privacy-boundary", "Data and privacy boundary"),
    (
        "security-tests-and-release-evidence",
        "Security, tests and release evidence",
    ),
    (
        "supplier-information-for-ai-registers",
        "Supplier information for AI registers",
    ),
    (
        "human-accountability-and-refusals",
        "Human accountability and refusals",
    ),
    ("independent-evaluation", "Published evaluations"),
];
pub const AUS_ACCOUNTING_PYPI: &str = "https://pypi.org/project/aus-accounting-mcp/";
pub const PERSON_SAME_AS: [&str; 4] = [
    "https://github.com/ryanduguid",
    "https://www.linkedin.com/in/ryan-duguid",
    "https://www.openaccountants.com/network/368408e7-bf06-431d-95a6-0b72e168ddeb",
    "https://pypi.org/user/ryanduguid/",
];
pub const PERSON_REQUIRED_FIELDS: [(&str, &str); 3] = [
    ("name", "Ryan Duguid"),
    ("jobTitle", "Senior Accountant"),
    ("url", "https://duguid.com.au/about/"),
];
pub const PERSON_ADDRESS: [(&str, &str); 4] = [
    ("@type", "PostalAddress"),
    ("addressLocality", "Newcastle"),
    ("addressRegion", "NSW"),
    ("addressCountry", "AU"),
];
/// name, slug, repository, description.
pub const CURRENT_SOFTWARE_REPOSITORIES: [(&str, &str, &str, &str); 10] = [
    (
        "payday-super-checker",
        "payday-super-checker",
        "https://github.com/ryanduguid/australian-accounting/tree/main/packages/payday-super-checker",
        "Experimental tool for checking Payday Super timing and preparing exceptions for review.",
    ),
    (
        "xero-trial-balance-export",
        "xero-trial-balance-export",
        "https://github.com/ryanduguid/accounting-review-pipeline/tree/main/packages/xero-trial-balance-export",
        "Export reconciled Xero trial balances to validated CSV for Power BI, Excel and pandas.",
    ),
    (
        "Ozzit",
        "ozzit",
        "https://github.com/ryanduguid/Ozzit",
        "143 native Excel LAMBDA functions plus five help tables for AU modelling and GST arithmetic.",
    ),
    (
        "accounting-excel-toolkit",
        "accounting-excel-toolkit",
        "https://github.com/ryanduguid/accounting-review-pipeline/tree/main/adapters/accounting-excel-toolkit",
        "Power Query and VBA utilities for Australian ledger work.",
    ),
    (
        "aus-accounting-mcp",
        "aus-accounting-mcp",
        "https://github.com/ryanduguid/australian-accounting/tree/main/apps/aus-accounting-mcp",
        "Local MCP server v0.6.0 for ATO benchmarks, Payday Super timing, limited Division 7A review, GST coding and BAS reconciliation review, 14 bounded tax worksheets, optional local Markdown search and synthetic SBR fixtures. Not advice.",
    ),
    (
        "australian-accounting-skills",
        "australian-accounting-skills",
        "https://github.com/ryanduguid/australian-accounting-skills",
        "Claude Code and Codex skills for Australian public practice workflows. Not lodgement.",
    ),
    (
        "review-ready-gate",
        "review-ready-gate",
        "https://github.com/ryanduguid/accounting-review-pipeline/tree/main/packages/review-ready-gate",
        "Stop incomplete workpapers reaching manager review. Deterministic readiness gate for Australian public practice packs. Not advice.",
    ),
    (
        "australian-accounting-power-bi",
        "australian-accounting-power-bi",
        "https://github.com/ryanduguid/accounting-review-pipeline/tree/main/apps/australian-accounting-power-bi",
        "Source-controlled Power BI project for Australian accounting analytics, consolidation, ATO benchmarks and Payday Super review.",
    ),
    (
        "monthly-close-control-plane",
        "monthly-close-control-plane",
        "https://github.com/ryanduguid/accounting-review-pipeline/tree/main/packages/monthly-close-control-plane",
        "Deterministic monthly close controls for Xero-shaped trial balance exports, exception packs and human review.",
    ),
    (
        "au-tax-legislation-corpus",
        "au-tax-legislation-corpus",
        "https://github.com/ryanduguid/au-tax-legislation-corpus",
        "Provenance-rich corpus of in-force Commonwealth tax legislation.",
    ),
];

pub struct Software {
    pub name: &'static str,
    pub id: String,
    pub repository: &'static str,
    pub license: String,
    pub description: &'static str,
}

/// AUTHORED_SOFTWARE: a component source URL retains its own licence inside the monorepo.
pub static AUTHORED_SOFTWARE: LazyLock<Vec<Software>> = LazyLock::new(|| {
    CURRENT_SOFTWARE_REPOSITORIES
        .iter()
        .map(|(name, slug, repository, description)| Software {
            name,
            id: format!("{SITE}/#software-{slug}"),
            repository,
            license: if repository.contains("/tree/main/") {
                format!(
                    "{}/LICENSE",
                    repository.replace("/tree/main/", "/blob/main/")
                )
            } else {
                format!("{repository}/blob/main/LICENSE")
            },
            description,
        })
        .collect()
});

pub const RETRIEVAL_CRAWLERS: [&str; 13] = [
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
    "Google-Extended",
];
pub const ALLOWED_TRAINING_CRAWLERS: [&str; 5] = [
    "CCBot",
    "Bytespider",
    "GPTBot",
    "ClaudeBot",
    "Applebot-Extended",
];
pub const BLOCKED_TRAINING_CRAWLERS: [&str; 5] = [
    "Amazonbot",
    "cohere-ai",
    "Diffbot",
    "FacebookBot",
    "meta-externalagent",
];
pub const CRAWLER_POLICY_COMMENTS: [&str; 5] = [
    "Search indexing and user-requested citation fetches are allowed.",
    "Training crawl by Common Crawl (CCBot), Bytespider, GPTBot, ClaudeBot and Applebot-Extended is allowed.",
    "The other named training crawlers below remain blocked.",
    "Unnamed agents must not silently redefine this policy; named rows state the intended treatment.",
    "Google-Extended is allowed so Gemini and Vertex AI grounding can cite this site; it is not a search crawler.",
];

pub struct WorkedExample {
    pub rel: &'static str,
    pub fixture_urls: &'static [&'static str],
    pub labels: &'static [(&'static str, &'static str)],
}

pub const WORKED_EXAMPLES: [WorkedExample; 2] = [
    WorkedExample {
        rel: "tools/payday-super/index.html",
        fixture_urls: &[
            "https://github.com/ryanduguid/australian-accounting/blob/8e9bd7235030b2c42bc8f2e7d2e8a60dce627182/packages/payday-super-checker/evaluation/payday_super_evidence/fixtures/timely_remittance_no_receipt.csv",
        ],
        labels: &[("at-risk or unknown", r"\b(?:at[-_ ]risk|unknown)\b")],
    },
    WorkedExample {
        rel: "tools/xero-trial-balance/index.html",
        fixture_urls: &[
            "https://github.com/ryanduguid/accounting-review-pipeline/blob/3ae854911bf36f00bd3cc3eeafd1855848896629/packages/xero-trial-balance-export/tests/test_export_tb.py#L191-L210",
            "https://github.com/ryanduguid/accounting-review-pipeline/blob/3ae854911bf36f00bd3cc3eeafd1855848896629/packages/xero-trial-balance-export/tests/test_export_tb.py#L421-L433",
        ],
        labels: &[
            ("balanced", r"\bbalanced\b"),
            ("write", r"\b(?:write|writes|written)\b"),
            ("unbalanced", r"\bunbalanced\b"),
            ("refused", r"\brefus\w*\b"),
        ],
    },
];

pub struct EvaluationPack {
    pub rel: &'static str,
    pub url: &'static str,
    pub product_repository: &'static str,
    pub product_evidence_contract: &'static str,
    pub permanent_commit: &'static str,
    pub sections: &'static [(&'static str, &'static str)],
    pub version_labels: &'static [&'static str],
    pub reproduction_recipe: &'static [&'static str],
    pub contract_text: &'static [&'static str],
    pub product_evidence_urls: &'static [&'static str],
    pub primary_source_urls: &'static [&'static str],
    pub section_contract_text: &'static [(&'static str, &'static [&'static str])],
    pub sitemap_lastmod: Option<&'static str>,
    pub llms_section: Option<&'static str>,
}

pub const EVALUATION_PACKS: [EvaluationPack; 3] = [
    EvaluationPack {
        rel: "evaluate/manager-review-gate/index.html",
        url: "https://duguid.com.au/evaluate/manager-review-gate/",
        product_repository: "https://github.com/ryanduguid/accounting-review-pipeline",
        product_evidence_contract: "global review-ready-gate evidence hrefs must match approved review-ready-gate/v0.1.3 URLs exactly once",
        permanent_commit: "2de565b3ce3916afe718b2b895d5474930030aee",
        sections: &[
            ("accounting-problem", "Accounting problem"),
            ("fabricated-inputs", "Fictional inputs"),
            ("expected-result", "Expected result"),
            ("controls-triggered", "Controls triggered"),
            ("human-decision", "Human decision"),
            ("reproduce", "Reproduce"),
            ("primary-sources", "Primary sources"),
            ("versions", "Versions"),
            ("limitations", "Limitations"),
        ],
        version_labels: &[
            "Product release v0.1.3",
            "fixture version 1",
            "source reviewed 2026-08-26",
        ],
        reproduction_recipe: &[
            "git clone --branch review-ready-gate/v0.1.3 --depth 1 https://github.com/ryanduguid/accounting-review-pipeline.git",
            "cd accounting-review-pipeline/packages/review-ready-gate",
            "uv sync --locked --all-extras",
            "uv run review-ready gate --profile bas --pack examples/bas-not-ready --output outputs/evaluation-not-ready",
            "uv run review-ready gate --profile bas --pack examples/bas-ready --output outputs/evaluation-ready",
            "uv run pytest tests/test_evaluation_pack.py -q",
        ],
        contract_text: &[
            "Exit 2 with NOT_READY",
            "MISSING_ARTEFACT for gst_control_gl",
            "SELF_REVIEW_INCOMPLETE",
            "OPEN_ITEM_BLOCKING",
            "Exit 0 with READY and no configured findings",
            "READY means no configured gate tripped; it is not approval, advice or lodgement authority.",
        ],
        product_evidence_urls: &[
            "https://github.com/ryanduguid/accounting-review-pipeline/releases/tag/review-ready-gate/v0.1.3",
            "https://github.com/ryanduguid/accounting-review-pipeline/tree/2de565b3ce3916afe718b2b895d5474930030aee/packages/review-ready-gate/evaluation/manager_review_gate",
            "https://github.com/ryanduguid/accounting-review-pipeline/blob/2de565b3ce3916afe718b2b895d5474930030aee/packages/review-ready-gate/evaluation/manager_review_gate/expected_results.json",
            "https://github.com/ryanduguid/accounting-review-pipeline/blob/2de565b3ce3916afe718b2b895d5474930030aee/packages/review-ready-gate/tests/test_evaluation_pack.py",
        ],
        primary_source_urls: &[
            "https://www.ato.gov.au/businesses-and-organisations/preparing-lodging-and-paying/business-activity-statements-bas",
            "https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/when-and-how-to-report-and-pay-gst/monthly-gst-reporting",
        ],
        section_contract_text: &[],
        sitemap_lastmod: None,
        llms_section: None,
    },
    EvaluationPack {
        rel: "evaluate/xero-trial-balance-integrity/index.html",
        url: "https://duguid.com.au/evaluate/xero-trial-balance-integrity/",
        product_repository: "https://github.com/ryanduguid/accounting-review-pipeline",
        product_evidence_contract: "global xero-trial-balance-export evidence hrefs must match approved permanent URLs exactly once",
        permanent_commit: "3ae854911bf36f00bd3cc3eeafd1855848896629",
        sections: &[
            ("accounting-problem", "Accounting problem"),
            ("intended-reviewer", "Intended reviewer"),
            ("fabricated-inputs", "Fictional inputs"),
            ("reproduce", "Reproduce"),
            ("expected-result", "Expected result"),
            ("controls-triggered", "Controls triggered"),
            ("primary-sources", "Primary sources"),
            ("versions", "Versions"),
            ("human-decision", "Human decision"),
            ("limitations", "Limitations"),
        ],
        version_labels: &[
            "Product release v0.1.6",
            "fixture version 1",
            "source reviewed 2026-08-26",
        ],
        reproduction_recipe: &[
            "git clone --branch xero-trial-balance-export/v0.1.6 --depth 1 https://github.com/ryanduguid/accounting-review-pipeline.git",
            "cd accounting-review-pipeline/packages/xero-trial-balance-export",
            "python -m pip install --require-hashes -r requirements.lock",
            "python -B -m unittest tests.test_evaluation_pack -v",
            "python -B -m unittest discover -s tests -v",
            "python evaluation/xero_tb_integrity/run.py ../../contracts/xero-trial-balance-v1/fixtures/passing.csv",
            "python evaluation/xero_tb_integrity/run.py ../../contracts/xero-trial-balance-v1/fixtures/failing_movement.csv",
            "python evaluation/xero_tb_integrity/run.py ../../contracts/xero-trial-balance-v1/fixtures/failing_ytd.csv",
        ],
        contract_text: &[
            "The production tool reads trial balance data directly from Xero\u{2019}s Accounting API Reports endpoint.",
            "This pack is for a reviewer who wants to reproduce the offline integrity gate without connecting to Xero or handling client data.",
            "The 3 CSV files are fictional output-shape fixtures.",
            "They are not Xero API responses or client records, and no OAuth flow runs in this evaluation.",
            "No Xero tenant credentials or tenant data are used.",
            "Dependency installation may download the hash-locked packages.",
            "Once dependencies are installed, the 3 evaluation runner commands are fully offline, make no network request and write no output file.",
            "passing.csv exits 0 and reports that movement and YTD balance.",
            "failing_movement.csv exits 1, identifies the movement pair and reports Nothing written.",
            "failing_ytd.csv exits 1, identifies the YTD pair and reports Nothing written.",
            "failing_movement.csv breaks only the current month Debit/Credit pair.",
            "failing_ytd.csv breaks only the YTDDebit/YTDCredit pair.",
            "The evaluation runner calls the production check_balanced gate before any CSV write.",
            "A balanced export passes this integrity control only; a human still decides completeness, classification, accounting treatment and fitness for review.",
            "This control does not prove completeness, classification, accounting treatment or client approval.",
            "It does not assess source data accuracy, reporting period suitability or fitness for a particular client review.",
        ],
        product_evidence_urls: &[
            "https://github.com/ryanduguid/accounting-review-pipeline/releases/tag/xero-trial-balance-export/v0.1.6",
            "https://github.com/ryanduguid/accounting-review-pipeline/tree/3ae854911bf36f00bd3cc3eeafd1855848896629/packages/xero-trial-balance-export/evaluation/xero_tb_integrity",
            "https://github.com/ryanduguid/accounting-review-pipeline/blob/3ae854911bf36f00bd3cc3eeafd1855848896629/contracts/xero-trial-balance-v1/expected_results.json",
            "https://github.com/ryanduguid/accounting-review-pipeline/blob/3ae854911bf36f00bd3cc3eeafd1855848896629/packages/xero-trial-balance-export/tests/test_evaluation_pack.py",
        ],
        primary_source_urls: &[
            "https://developer.xero.com/documentation/api/accounting/reports",
            "https://developer.xero.com/documentation/guides/oauth2/scopes/",
        ],
        section_contract_text: &[],
        sitemap_lastmod: None,
        llms_section: None,
    },
    EvaluationPack {
        rel: "evaluate/payday-super-evidence/index.html",
        url: "https://duguid.com.au/evaluate/payday-super-evidence/",
        product_repository: "https://github.com/ryanduguid/australian-accounting",
        product_evidence_contract: "global payday-super-checker evidence hrefs must match approved release, permanent evaluation and source-review URLs exactly once",
        permanent_commit: "8e9bd7235030b2c42bc8f2e7d2e8a60dce627182",
        sections: &[
            ("accounting-problem", "Accounting problem"),
            ("intended-reviewer", "Intended reviewer"),
            ("fabricated-inputs", "Fictional inputs"),
            ("reproduce", "Reproduce"),
            ("evidence-pack", "Recorded development evidence pack"),
            ("expected-result", "Expected result"),
            ("controls-triggered", "Controls triggered"),
            ("primary-sources", "Primary sources"),
            ("versions", "Versions"),
            ("human-decision", "Human decision"),
            ("limitations", "Limitations"),
        ],
        version_labels: &[
            "Product release v0.1.3",
            "fixture version 1",
            "source reviewed 15 August 2026",
        ],
        reproduction_recipe: &[
            "git clone --branch payday-super-checker/v0.1.3 --depth 1 https://github.com/ryanduguid/australian-accounting.git",
            "cd australian-accounting/packages/payday-super-checker",
            "uv run --locked --extra dev --python 3.12 payday-super-check evaluation/payday_super_evidence/fixtures/timely_remittance_no_receipt.csv --as-at 2026-08-20 -o timely-report.csv",
            "uv run --locked --extra dev --python 3.12 payday-super-check evaluation/payday_super_evidence/fixtures/late_remittance_no_receipt.csv --as-at 2026-08-20 -o late-remittance-report.csv",
            "uv run --locked --extra dev --python 3.12 payday-super-check evaluation/payday_super_evidence/fixtures/receipt_on_due_date.csv --as-at 2026-08-20 -o on-time-report.csv",
            "uv run --locked --extra dev --python 3.12 payday-super-check evaluation/payday_super_evidence/fixtures/receipt_after_due_date.csv --as-at 2026-08-20 -o late-receipt-report.csv",
            "uv run --locked --extra dev --python 3.12 pytest tests/test_evaluation_pack.py -q",
        ],
        contract_text: &[
            "No client, employee or live payroll data is included.",
            "17 August 2026",
            "20 August 2026",
            "timely_remittance_no_receipt.csv exits 2 with AT_RISK",
            "late_remittance_no_receipt.csv exits 2 with LATE",
            "receipt_on_due_date.csv exits 0 with ON_TIME",
            "receipt_after_due_date.csv exits 2 with LATE",
            "A missing receipt cannot prove on-time, remittance timing can prove late and timely remittance without receipt remains at-risk.",
            "Remittance evidence can show operational timing but cannot prove on-time; a human must establish eligible fund receipt, allocation and the other assessment facts before relying on a statutory conclusion.",
            "Experimental review aid. Not a compliance determination.",
            "the first to contain the evaluation directory",
            "evaluation artefacts are fixed to that release\u{2019}s commit",
        ],
        product_evidence_urls: &[
            "https://github.com/ryanduguid/australian-accounting/releases/tag/payday-super-checker/v0.1.3",
            "https://github.com/ryanduguid/australian-accounting/tree/8e9bd7235030b2c42bc8f2e7d2e8a60dce627182/packages/payday-super-checker/evaluation/payday_super_evidence",
            "https://github.com/ryanduguid/australian-accounting/blob/8e9bd7235030b2c42bc8f2e7d2e8a60dce627182/packages/payday-super-checker/evaluation/payday_super_evidence/expected_results.json",
            "https://github.com/ryanduguid/australian-accounting/blob/8e9bd7235030b2c42bc8f2e7d2e8a60dce627182/packages/payday-super-checker/tests/test_evaluation_pack.py",
        ],
        primary_source_urls: &[
            "https://www.legislation.gov.au/C2004A04402/latest/text",
            "https://www.ato.gov.au/law/view/document?DocID=COG%2FLCR20262%2FNAT%2FATO%2F00001",
            "https://github.com/ryanduguid/australian-accounting/blob/8e9bd7235030b2c42bc8f2e7d2e8a60dce627182/packages/payday-super-checker/docs/primary-source-review-2026-08-15.md",
        ],
        section_contract_text: &[
            (
                "fabricated-inputs",
                &["supported due date of 17 August 2026 and an as-at date of 20 August 2026"],
            ),
            (
                "reproduce",
                &[
                    "Needs Git, and uv with Python 3.12; the commands are the same on Windows, macOS and Linux. Clone the australian-accounting monorepo at tag payday-super-checker/v0.1.3 (commit 8e9bd7235030b2c42bc8f2e7d2e8a60dce627182) and run these commands from packages/payday-super-checker. The first 4 commands write the 4 reports; the final command runs the evaluation contract test.",
                ],
            ),
            (
                "limitations",
                &["This evaluation does not provide advice or make an ATO assessment."],
            ),
        ],
        sitemap_lastmod: Some("2026-09-30"),
        llms_section: Some("Evaluation packs"),
    },
];

/// rel, (external href, external label, preceding label).
pub const ARTICLE_TOC_EXTERNAL_LINKS: [(&str, (&str, &str, &str)); 1] = [(
    "tools/payday-super/index.html",
    (
        "/evaluate/payday-super-evidence/",
        "Reproduce the evaluation",
        "Synthetic worked example",
    ),
)];

pub const PRIMARY_NAV_LINKS: [(&str, &str); 6] = [
    ("/tools/", "Tools"),
    ("/rates/", "Rates"),
    ("/evaluate/", "Evaluations"),
    ("/evidence/", "Evidence"),
    ("/about/", "About"),
    ("/contact/", "Contact"),
];

pub const BREADCRUMB_LEAF_NAMES: [(&str, &str); 13] = [
    (
        "examples/profit-vs-cash-flow/index.html",
        "Profit vs cash flow",
    ),
    (
        "tools/monthly-close-controls/index.html",
        "Monthly Close Controls",
    ),
    ("tools/ozzit/index.html", "Ozzit Excel LAMBDA library"),
    (
        "tools/ato-benchmarks/index.html",
        "ATO benchmark comparison",
    ),
    (
        "tools/australian-tax-ai-agents/index.html",
        "Australian tax MCP server: Aus Accounting MCP",
    ),
    ("tools/coal-lsl-levy/index.html", "Coal LSL levy calculator"),
    (
        "tools/company-tax-franking/index.html",
        "Company tax and franking checks",
    ),
    ("tools/payday-super/index.html", "Payday Super timing"),
    (
        "tools/subcontractor-ledgers/index.html",
        "Subcontract ledger skills",
    ),
    (
        "tools/trust-distributions/index.html",
        "Trust distribution checks",
    ),
    ("tools/wip-schedule/index.html", "Construction WIP schedule"),
    (
        "tools/workpaper-review-gate/index.html",
        "Workpaper Review Gate",
    ),
    (
        "tools/xero-trial-balance/index.html",
        "Xero trial balance CSV export",
    ),
];

pub struct CollectionHub {
    pub rel: &'static str,
    pub h1: &'static str,
    pub entries: &'static [(&'static str, &'static str)],
}

pub const COLLECTION_HUBS: [CollectionHub; 3] = [
    CollectionHub {
        rel: "tools/index.html",
        h1: "Tools",
        entries: &[
            (
                "/tools/xero-trial-balance/",
                "Xero trial balance CSV export tool",
            ),
            (
                "/tools/subcontractor-ledgers/",
                "Subcontractor ledger skills for construction and mining",
            ),
            (
                "/tools/wip-schedule/",
                "TheWIPTally construction WIP schedule",
            ),
            ("/tools/payday-super/", "Payday Super receipt evidence"),
            (
                "/tools/ato-benchmarks/",
                "ATO small business benchmark comparison tool",
            ),
            ("/tools/coal-lsl-levy/", "Coal LSL levy calculator"),
            (
                "/tools/trust-distributions/",
                "Trust distribution worksheets for professional review",
            ),
            (
                "/tools/company-tax-franking/",
                "Company tax and franking worksheets",
            ),
            ("/tools/ozzit/", "Ozzit"),
            ("/tools/workpaper-review-gate/", "Workpaper Review Gate"),
            ("/tools/monthly-close-controls/", "Monthly Close Controls"),
            ("/tools/australian-tax-ai-agents/", "Aus Accounting MCP"),
        ],
    },
    CollectionHub {
        rel: "evaluate/index.html",
        h1: "Evaluations",
        entries: &[
            (
                "/evaluate/manager-review-gate/",
                "Workpaper Review Gate evaluation",
            ),
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
    CollectionHub {
        rel: "rates/index.html",
        h1: "Rates",
        entries: &[
            ("/rates/super-guarantee/", "Super guarantee rate history"),
            (
                "/rates/div7a-benchmark-rate/",
                "Division 7A benchmark interest rate",
            ),
            (
                "/rates/cents-per-kilometre/",
                "Cents per kilometre car expense rate",
            ),
            (
                "/rates/maximum-contribution-base/",
                "Maximum super contribution base",
            ),
            ("/rates/car-limit/", "Car limit for depreciation"),
            ("/rates/fbt-rate/", "FBT rate and gross-up rates"),
            (
                "/rates/announced-not-yet-law/",
                "Announced tax measures and enacted law",
            ),
        ],
    },
];

pub const CONTACT_MAILTO_HREFS: [&str; 1] =
    ["mailto:ryan@duguid.com.au?subject=Website%20or%20tool%20feedback"];
pub const HOMEPAGE_HEADING: &str = "Open source tools for Australian accountants";
pub const HOMEPAGE_HEADING_MARKUP: &str =
    "<h1 id=\"home-title\">Open source tools for Australian accountants</h1>";
pub const HOMEPAGE_SUPPORT: &str =
    "Check workpaper packs, explore cash shortfalls and inspect the calculations.";
pub const HOMEPAGE_ACTIONS: [(&str, &str); 1] = [(
    "/examples/profit-vs-cash-flow/",
    "Explore the cash flow example",
)];
pub const HOMEPAGE_PREVIEW_ENTRIES: [(&str, &str, &str); 4] = [
    (
        "Use accounting functions in Excel",
        "/tools/ozzit/",
        "/tools/ozzit/#functions",
    ),
    (
        "Review a month-end close",
        "/tools/monthly-close-controls/",
        "/tools/monthly-close-controls/#get-it",
    ),
    (
        "Calculate a Coal LSL levy",
        "/tools/coal-lsl-levy/",
        "/tools/coal-lsl-levy/",
    ),
    (
        "Check a BAS pack before manager review",
        "/evaluate/manager-review-gate/",
        "/tools/workpaper-review-gate/",
    ),
];
pub const TASK_ROUTE_ENTRIES: [(&str, &str, &str); 5] = [
    (
        "Understand why profit and cash differ",
        "/examples/profit-vs-cash-flow/",
        "/evaluate/#five-minute-cases",
    ),
    HOMEPAGE_PREVIEW_ENTRIES[0],
    HOMEPAGE_PREVIEW_ENTRIES[1],
    HOMEPAGE_PREVIEW_ENTRIES[2],
    HOMEPAGE_PREVIEW_ENTRIES[3],
];
pub const HOMEPAGE_ANCHORS: [&str; 2] = ["adopt", "verify"];
pub const ABOUT_OPENING: &str = "I\u{2019}m Ryan Duguid, a Senior Accountant in Newcastle, NSW. I build open source tools that check Australian tax, payroll, ledgers and workpapers. Each tool shows its sources and working, uses fictional examples and leaves the judgement and lodgement to a person.";
pub const EVIDENCE_HEADING: &str = "Evidence behind the tools";
pub const EVIDENCE_OPENING: &str = "Check the records behind the tools: identity records, releases, primary source reviews, repository controls and tests you can reproduce. These records support limited software claims. An output is not advice, approval, a compliance decision or a lodgement.";
pub const HOMEPAGE_REQUIRED_TEXT: [&str; 4] = [
    HOMEPAGE_HEADING,
    HOMEPAGE_SUPPORT,
    "Try each tool with fictional data first",
    "Check the source before the result",
];
pub const HOMEPAGE_TITLE: &str = "Open source tools for Australian accountants";
pub const HOMEPAGE_DESCRIPTION: &str = "Personal index of open source Australian accounting tools for payroll, Xero, workpapers and AI workflows, with sources and working kept visible.";
pub const HOMEPAGE_REQUIRED_HREFS: [&str; 5] = [
    "/evidence/",
    "/examples/profit-vs-cash-flow/",
    "/tools/australian-tax-ai-agents/#install",
    "/tools/coal-lsl-levy/",
    "/tools/workpaper-review-gate/",
];
pub const HOMEPAGE_PROOF_HREFS: [&str; 2] = ["/tools/coal-lsl-levy/", "/evidence/"];
pub const ARTICLE_PATTERN_PAGES: [&str; 35] = [
    "works-with/index.html",
    "works-with/xero/index.html",
    "works-with/claude/index.html",
    "examples/profit-vs-cash-flow/index.html",
    "tools/ozzit/index.html",
    "tools/ozzit/functions/dates/index.html",
    "tools/ozzit/functions/essentials/index.html",
    "tools/ozzit/functions/financial/index.html",
    "tools/ozzit/functions/ratios/index.html",
    "tools/ozzit/functions/utilities/index.html",
    "tools/ozzit/functions/debt/index.html",
    "tools/monthly-close-controls/index.html",
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
    "tools/limitations/index.html",
    "tools/subcontractor-ledgers/index.html",
    "tools/trust-distributions/index.html",
    "tools/wip-schedule/index.html",
    "tools/xero-trial-balance/index.html",
    "rates/super-guarantee/index.html",
    "rates/div7a-benchmark-rate/index.html",
    "rates/cents-per-kilometre/index.html",
    "rates/maximum-contribution-base/index.html",
    "rates/car-limit/index.html",
    "rates/fbt-rate/index.html",
    "rates/announced-not-yet-law/index.html",
];
pub const RATE_PAGES: [&str; 7] = [
    "rates/super-guarantee/index.html",
    "rates/div7a-benchmark-rate/index.html",
    "rates/cents-per-kilometre/index.html",
    "rates/maximum-contribution-base/index.html",
    "rates/car-limit/index.html",
    "rates/fbt-rate/index.html",
    "rates/announced-not-yet-law/index.html",
];
pub const CALCULATOR_REL: &str = "tools/coal-lsl-levy/index.html";
pub const REGULATORY_QUESTION_TOPICS: [&str; 7] = [
    "general-tax",
    "deductions",
    "business-setup",
    "gst-bas",
    "payroll-super",
    "company-compliance",
    "investments-local",
];
pub const FORMULA_B_QUESTION: &str = "What does the 75% in Formula B apply to?";
pub const FORMULA_B_ANSWER_PHRASES: [&str; 5] = [
    "non-casual employee paid a base rate",
    "allowances other than expense reimbursements",
    "section 3B(1)(b)(iii)",
    "$7,125.00",
    "$8,000.00",
];
pub const PRIVACY_REL: &str = "privacy/index.html";
pub const PRIVACY_FORBIDDEN_ABSOLUTES: [&str; 4] = [
    "reports anything to the site owner",
    "reports nothing to the site owner",
    "nothing sent anywhere",
    "nothing is sent",
];
pub const LLMS_ROUTE_SECTION: &str = "Choose a route";
pub const TASK_ROUTES_REL: &str = "tools/index.html";
pub const LEVY_PAGE_MODULE: &str = "assets/levy-page.mjs";
pub const LEVY_PAGE_SCRIPT: &str =
    "<script type=\"module\" src=\"/assets/levy-page.mjs\"></script>";
pub const CALCULATOR_MARKERS: [&str; 5] = [
    "name=\"branch\"",
    "id=\"branch-fields\"",
    "id=\"sacrificed\"",
    "id=\"bonus-rows\"",
    "type=\"submit\"",
];
pub const CALCULATOR_REQUIRED_IDS: [&str; 31] = [
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
];
pub const CALCULATOR_COMMON_HELP: &str = "Leave a monetary amount blank to treat it as $0.00.";
pub const CALCULATOR_BLANK_RESULT_EXPLANATION: &str =
    "All monetary amounts were blank, so the calculator treated each as $0.00.";
pub const CALCULATOR_PRIVACY_WARNING: &str = "Use an internal payroll reference such as EMP-001. Do not enter an employee name, TFN or other direct identifier.";
pub const CALCULATOR_NUMBER_INPUT_IDS: [&str; 8] = [
    "sacrificed",
    "baseRate",
    "overtime",
    "allowances",
    "annualSalary",
    "casualBasePay",
    "casualLoading",
    "ordinaryPay",
];

pub struct SocialCard {
    pub id: &'static str,
    pub label: &'static str,
    pub heading: &'static [&'static str],
    pub host: &'static str,
    pub output: &'static str,
}

pub const SOCIAL_CARD_CONTEXTS: [SocialCard; 5] = [
    SocialCard {
        id: "site",
        label: "Australian accounting",
        heading: &["Open source tools for", "Australian accountants"],
        host: "duguid.com.au",
        output: "social-card-site-20261016.png",
    },
    SocialCard {
        id: "tools",
        label: "Open source tools",
        heading: &["Accounting checks that", "show their working."],
        host: "duguid.com.au/tools/",
        output: "social-card-tools-20261016.png",
    },
    SocialCard {
        id: "evaluations",
        label: "Reproducible evaluations",
        heading: &["Fabricated inputs.", "Expected results.", "Visible limits."],
        host: "duguid.com.au/evaluate/",
        output: "social-card-evaluations-20261016.png",
    },
    SocialCard {
        id: "rates",
        label: "Maintained reference tables",
        heading: &["Australian rates,", "sources, and review dates."],
        host: "duguid.com.au/rates/",
        output: "social-card-rates-20261016.png",
    },
    SocialCard {
        id: "evidence",
        label: "Evidence register",
        heading: &["Claims linked to sources,", "releases, and tests."],
        host: "duguid.com.au/evidence/",
        output: "social-card-evidence-20261016.png",
    },
];
pub const SOCIAL_CARD_DIMENSIONS: (u32, u32) = (1200, 630);
pub const SOCIAL_CARD_MAX_BYTES: usize = 50_000;
pub const SOCIAL_CARD_COLOURS: [&str; 5] = ["#000000", "#ffd32a", "#fffff0", "#990024", "#dadada"];
pub const SOCIAL_CARD_TEMPLATE_PLACEHOLDERS: [&str; 8] = [
    "{{FONT_SERIF}}",
    "{{FONT_SANS}}",
    "{{FONT_MONO}}",
    "{{TITLE}}",
    "{{DESCRIPTION}}",
    "{{LABEL}}",
    "{{HEADING_LINES}}",
    "{{HOST}}",
];
pub const TIGHT_META_DESCRIPTION_PAGES: [&str; 3] = [
    "tools/payday-super/index.html",
    "tools/australian-tax-ai-agents/index.html",
    "tools/coal-lsl-levy/index.html",
];
pub const TIGHT_META_DESCRIPTION_LIMITS: (usize, usize) = (120, 155);
pub const BONUS_FREQUENCIES: [&str; 6] = [
    "weekly",
    "fortnightly",
    "monthly",
    "quarterly",
    "halfYearly",
    "annually",
];
pub const PERSON_STUB_FIELDS: [&str; 6] = ["@type", "@id", "name", "jobTitle", "url", "sameAs"];

/// HEADER_DATED_PAGES.
pub fn header_dated(rel: &str) -> bool {
    (ARTICLE_PATTERN_PAGES.contains(&rel)
        && (rel.starts_with("tools/")
            || rel.starts_with("evaluate/")
            || rel.starts_with("examples/")))
        || rel.starts_with("works-with/")
        || [CALCULATOR_REL, "rates/index.html", "evaluate/index.html"].contains(&rel)
}

/// REGULATORY_QUESTION_PAGES.
pub fn regulatory_question_page(rel: &str) -> bool {
    REGULATORY_QUESTION_TOPICS
        .iter()
        .any(|topic| rel == format!("tools/accounting-questions/{topic}/index.html"))
}

pub fn social_card(id: &str) -> &'static SocialCard {
    SOCIAL_CARD_CONTEXTS
        .iter()
        .find(|card| card.id == id)
        .expect("a configured card")
}
