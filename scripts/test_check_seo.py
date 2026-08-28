"""Characterisation tests for the SEO checker modules."""

from __future__ import annotations

import json
import re
import tempfile
from pathlib import Path

import seo_core as core
import site_contracts as contracts


def site_url(rel: str) -> str:
    return core.site_url(rel, contracts.SITE)


def title_is_too_long(rel: str, title: str) -> bool:
    return core.title_is_too_long(rel, title, contracts.TITLE_EXCEPTIONS)


def self_check() -> None:
    missing_negative_failures: list[str] = []

    with tempfile.TemporaryDirectory() as directory:
        discovery_root = Path(directory)
        (discovery_root / "index.html").write_text(
            "<main>site</main>", encoding="utf-8"
        )
        for rel in (
            "work/playwright-report/index.html",
            "node_modules/example/index.html",
            ".cache/index.html",
            "google-verification.html",
        ):
            path = discovery_root / rel
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("<main>generated</main>", encoding="utf-8")
        discovered = [
            path.relative_to(discovery_root).as_posix()
            for path in core.html_files(discovery_root)
        ]
        assert discovered == ["index.html"], discovered

    def expect_failure(actual: list[str], expected: str) -> None:
        if expected not in actual:
            missing_negative_failures.append(
                f"expected {expected!r}, found {actual!r}"
            )

    redirect_rel = "tools/review-ready-gate/index.html"
    redirect_target = "https://duguid.com.au/tools/workpaper-review-gate/"
    valid_redirect = f"""
    <meta name="robots" content="noindex, follow" />
    <meta http-equiv="refresh" content="0; url={redirect_target}" />
    <link rel="canonical" href="{redirect_target}" />
    <a href="{redirect_target}">Continue to Workpaper Review Gate</a>
    """
    assert contracts.check_static_redirect(
        valid_redirect,
        redirect_rel,
        redirect_target,
    ) == []
    missing_robots = valid_redirect.replace(
        '<meta name="robots" content="noindex, follow" />',
        "",
    )
    expect_failure(
        contracts.check_static_redirect(
            missing_robots,
            redirect_rel,
            redirect_target,
        ),
        f'{redirect_rel}: missing redirect marker '
        '<meta name="robots" content="noindex, follow" />',
    )

    assert site_url("index.html") == f"{contracts.SITE}/"
    assert re.search(
        r"\b(?:email|message)\b.{0,80}\bdoes\s+not\s+create\b.{0,80}"
        r"\b(?:professional\s+)?engagement\b",
        "An email does not create a professional engagement.",
        re.I,
    )
    assert re.search(
        r"\bnothing\s+here\b.{0,80}\b(?:tax|legal|financial)\s+advice\b",
        "Nothing here is tax, legal or financial advice.",
        re.I,
    )
    assert re.search(
        r"\btools?\b.{0,80}\breview\s+aids?\b.{0,80}"
        r"\bnot\s+compliance\s+determinations?\b",
        "The tools are review aids for a qualified professional, not compliance determinations.",
        re.I,
    )
    assert site_url("about/index.html") == f"{contracts.SITE}/about/"
    assert site_url("404.html") == f"{contracts.SITE}/404.html"
    assert contracts.forbidden_identity_url_labels(
        '<a href="https://ryanduguid.github.io/about/">old host</a>'
    ) == {"retired github.io canonical URL"}
    assert contracts.forbidden_identity_url_labels(
        "https://www.linkedin.com/in/ryanduguid"
    ) == {"unhyphenated US namesake URL"}
    assert contracts.forbidden_identity_url_labels(
        "https://www.linkedin.com/in/ryan-duguid/"
    ) == set()
    assert contracts.forbidden_identity_url_labels(
        "https://example.com/https://ryanduguid.github.io/"
    ) == set()
    evidence_title = contracts.TITLE_EXCEPTIONS[contracts.EVIDENCE_REL]
    assert len(evidence_title) > core.TITLE_MAX
    assert not title_is_too_long(contracts.EVIDENCE_REL, evidence_title)
    assert title_is_too_long("about/index.html", evidence_title)
    assert title_is_too_long(contracts.EVIDENCE_REL, f"{evidence_title} extra")
    assert not title_is_too_long("index.html", f"{'x' * 64}&amp;")
    assert core.visible_text("<p>a <b>b</b></p><script>var x = 'hidden';</script>") == "a b"
    for class_attribute in (
        'class="visually-hidden"',
        "class='visually-hidden'",
        "class=visually-hidden",
    ):
        assert core.visible_text(
            f"<p>visible</p><p {class_attribute}>hidden</p>"
        ) == "visible"
    assert core.meta('<meta name="description" content="x &amp; y" />', "name", "description") == "x & y"
    valid_shell = """
    <a class="skip-link" href="#main">Skip to content</a>
    <header><nav aria-label="Primary">
      <a href="/about/">About</a><a href="/evidence/">Evidence</a>
      <a href="/tools/australian-tax-ai-agents/">AI agents</a>
      <a href="https://github.com/ryanduguid">GitHub</a>
      <a href="https://github.com/ryanduguid/awesome-australian-accounting-tech">Awesome List</a>
    </nav></header><main id="main"></main>
    """
    shell_failures: list[str] = []
    contracts.check_shared_shell(valid_shell, "self-check", shell_failures)
    assert shell_failures == []

    invalid_shell = valid_shell.replace("Awesome List", "Projects").replace(
        'id="main"', 'id="content"'
    )
    invalid_shell_failures: list[str] = []
    contracts.check_shared_shell(invalid_shell, "self-check", invalid_shell_failures)
    assert any("main#main" in failure for failure in invalid_shell_failures)
    assert any("primary navigation" in failure for failure in invalid_shell_failures)
    duplicate_main_failures: list[str] = []
    contracts.check_shared_shell(
        valid_shell.replace("</main>", "</main><main></main>"),
        "self-check",
        duplicate_main_failures,
    )
    expect_failure(
        duplicate_main_failures,
        "self-check: expected exactly one rendered main#main, found 2 main elements",
    )
    valid_homepage = f"""
    <title>{contracts.HOMEPAGE_TITLE}</title>
    <meta name="description" content="{contracts.HOMEPAGE_DESCRIPTION}">
    <meta property="og:title" content="{contracts.HOMEPAGE_TITLE}">
    <meta property="og:description" content="{contracts.HOMEPAGE_DESCRIPTION}">
    <main>
      <p>Newcastle and the Hunter Valley</p>
      <h1>Accounting tools that show their working.</h1>
      <h2>Fix the workflow before another review round.</h2>
      <h2>Test it with fabricated data first.</h2>
      <h2>Check the source before the result.</h2>
      <h2>Tools for work that still needs checking</h2>
      <h2>Useful before impressive</h2>
      <h2>Sources beside claims</h2>
      <h2>Working stays visible</h2>
      <h2>Unknown means unknown</h2>
      <h2>A person signs off</h2>
      <a href="/tools/australian-tax-ai-agents/">AI agents</a>
      <a href="/evaluate/payday-super-evidence/">Payday Super evaluation</a>
      <section class="proof-feature">
        <a href="/tools/coal-lsl-levy/">Coal LSL levy calculator</a>
        <a href="/evidence/">Evidence</a>
        <a href="https://coallsl.com.au/guidance-notes/eligible-wages">Eligible wages</a>
        <a href="https://coallsl.com.au/about-us/governing-legislation/legislation">Legislation</a>
      </section>
    </main>
    """
    homepage_failures: list[str] = []
    contracts.check_homepage_contract(valid_homepage, homepage_failures)
    assert homepage_failures == []
    for href in contracts.HOMEPAGE_REQUIRED_HREFS:
        missing_route_failures: list[str] = []
        contracts.check_homepage_contract(
            valid_homepage.replace(f'href="{href}"', 'href="/missing/"', 1),
            missing_route_failures,
        )
        expect_failure(
            missing_route_failures,
            f"index.html: missing visible homepage route {href}",
        )

    invalid_homepage = valid_homepage.replace(
        "Accounting tools that show their working.", ""
    )
    invalid_homepage_failures: list[str] = []
    contracts.check_homepage_contract(invalid_homepage, invalid_homepage_failures)
    assert any(
        "missing approved homepage text" in failure
        and "Accounting tools" in failure
        for failure in invalid_homepage_failures
    )
    misplaced_proof_link = valid_homepage.replace(
        '<a href="/evidence/">Evidence</a>', "", 1
    ).replace(
        "</main>", '<a href="/evidence/">Evidence elsewhere</a></main>', 1
    )
    misplaced_proof_failures: list[str] = []
    contracts.check_homepage_contract(misplaced_proof_link, misplaced_proof_failures)
    expect_failure(
        misplaced_proof_failures,
        "index.html: proof feature is missing required link /evidence/",
    )
    authority_sections = {
        "engage": ("Engage", "Fix the workflow before another review round."),
        "adopt": ("Adopt", "Test it with fabricated data first."),
        "verify": ("Verify", "Check the source before the result."),
    }
    for identifier, (label, statement) in authority_sections.items():
        valid_section = (
            f'<section id="{identifier}"><h2>{label}</h2>'
            f'<h3 class="route-statement">{statement}</h3>'
            '<div class="route-actions"><a href="/">Action</a></div>'
            '<p class="route-note">Boundary or verification note.</p></section>'
        )
        assert contracts.check_authority_section(
            valid_section, identifier, label, statement
        ) == []
        missing_statement = valid_section.replace(statement, "Generic platform copy")
        expect_failure(
            contracts.check_authority_section(
                missing_statement, identifier, label, statement
            ),
            f"index.html: authority section #{identifier} statement must be {statement}",
        )
        duplicate_label = valid_section.replace(
            f"<h2>{label}</h2>", f"<h2>{label}</h2><h2>Extra heading</h2>"
        )
        expect_failure(
            contracts.check_authority_section(
                duplicate_label, identifier, label, statement
            ),
            f"index.html: authority section #{identifier} must have exactly one h2",
        )
        no_actions = valid_section.replace('class="route-actions"', 'class="elsewhere"')
        expect_failure(
            contracts.check_authority_section(no_actions, identifier, label, statement),
            f"index.html: authority section #{identifier} needs one action group",
        )
        no_note = valid_section.replace('class="route-note"', 'class="elsewhere"')
        expect_failure(
            contracts.check_authority_section(no_note, identifier, label, statement),
            f"index.html: authority section #{identifier} needs one boundary or verification note",
        )
    valid_article = """
    <article><nav aria-label="On this page">
      <a href="#first">First</a><a href="#second">Second</a>
    </nav><h2 id="first">First</h2><h2 id="second">Second</h2></article>
    """
    article_failures: list[str] = []
    contracts.check_article_pattern(valid_article, "self-check", article_failures)
    assert article_failures == []
    empty_contents_failures: list[str] = []
    contracts.check_article_pattern(
        '<article><nav aria-label="On this page"></nav><h2 id="first">First</h2></article>',
        "self-check",
        empty_contents_failures,
    )
    expect_failure(
        empty_contents_failures,
        "self-check: On this page navigation must contain at least one local link",
    )
    broken_contents_failures: list[str] = []
    contracts.check_article_pattern(
        '<article><nav aria-label="On this page"><a href="#missing">Missing</a></nav>'
        '<h2 id="first">First</h2></article>',
        "self-check",
        broken_contents_failures,
    )
    expect_failure(
        broken_contents_failures,
        "self-check: local contents target does not exist: #missing",
    )
    payday_toc_rel = "tools/payday-super/index.html"
    valid_payday_toc = """
    <article><nav aria-label="On this page">
      <a href="#first">First</a>
      <a href="#synthetic-worked-example">Synthetic worked example</a>
      <a href="/evaluate/payday-super-evidence/">Evidence evaluation</a>
      <a href="#last">Last</a>
    </nav><h2 id="first">First</h2><h2 id="synthetic-worked-example">Example</h2>
    <h2 id="last">Last</h2></article>
    """
    payday_toc_failures: list[str] = []
    contracts.check_article_pattern(valid_payday_toc, payday_toc_rel, payday_toc_failures)
    assert payday_toc_failures == []
    duplicate_payday_toc_failures: list[str] = []
    contracts.check_article_pattern(
        valid_payday_toc.replace(
            '<a href="/evaluate/payday-super-evidence/">Evidence evaluation</a>',
            '<a href="/evaluate/payday-super-evidence/">Evidence evaluation</a>'
            '<a href="/evaluate/payday-super-evidence/">Evidence evaluation</a>',
            1,
        ),
        payday_toc_rel,
        duplicate_payday_toc_failures,
    )
    expect_failure(
        duplicate_payday_toc_failures,
        f"{payday_toc_rel}: external On this page link "
        "'/evaluate/payday-super-evidence/' must appear once with label "
        "'Evidence evaluation', found 2",
    )
    duplicate_payday_page_link_failures: list[str] = []
    contracts.check_article_pattern(
        valid_payday_toc.replace(
            "</article>",
            '<a href="/evaluate/payday-super-evidence/">Duplicate</a></article>',
            1,
        ),
        payday_toc_rel,
        duplicate_payday_page_link_failures,
    )
    expect_failure(
        duplicate_payday_page_link_failures,
        f"{payday_toc_rel}: evaluator link '/evaluate/payday-super-evidence/' "
        "must appear once across the rendered page, found 2",
    )
    missing_payday_toc_failures: list[str] = []
    contracts.check_article_pattern(
        valid_payday_toc.replace(
            '<a href="/evaluate/payday-super-evidence/">Evidence evaluation</a>', "", 1
        ),
        payday_toc_rel,
        missing_payday_toc_failures,
    )
    expect_failure(
        missing_payday_toc_failures,
        f"{payday_toc_rel}: external On this page link "
        "'/evaluate/payday-super-evidence/' must appear once with label "
        "'Evidence evaluation', found 0",
    )
    misplaced_payday_toc_failures: list[str] = []
    contracts.check_article_pattern(
        valid_payday_toc.replace(
            '<a href="/evaluate/payday-super-evidence/">Evidence evaluation</a>',
            "",
            1,
        ).replace(
            '<a href="#synthetic-worked-example">Synthetic worked example</a>',
            '<a href="/evaluate/payday-super-evidence/">Evidence evaluation</a>'
            '<a href="#synthetic-worked-example">Synthetic worked example</a>',
            1,
        ),
        payday_toc_rel,
        misplaced_payday_toc_failures,
    )
    expect_failure(
        misplaced_payday_toc_failures,
        f"{payday_toc_rel}: external On this page link "
        "'/evaluate/payday-super-evidence/' must immediately follow "
        "'Synthetic worked example'",
    )
    valid_rate_region = (
        '<div role="region" aria-label="Reference rates" tabindex="0">'
        "<table><tr><td>12</td></tr></table></div>"
    )
    rate_region_failures: list[str] = []
    contracts.check_rate_table_region(valid_rate_region, "self-check", rate_region_failures)
    assert rate_region_failures == []
    sibling_rate_table_failures: list[str] = []
    contracts.check_rate_table_region(
        '<div role="region" aria-label="Reference rates" tabindex="0"></div>'
        "<table><tr><td>12</td></tr></table>",
        "self-check",
        sibling_rate_table_failures,
    )
    expect_failure(
        sibling_rate_table_failures,
        "self-check: reference table is not inside a labelled keyboard-scroll region",
    )
    valid_calculator = """
    <form id="calc-form">
      <input type="radio" name="branch" value="baseRate" checked>
      <input type="radio" name="branch" value="annual">
      <input type="radio" name="branch" value="casual">
      <div id="branch-fields"></div>
      <input type="number" name="sacrificed" min="0" step="0.01"
        inputmode="decimal" id="sacrificed">
      <div id="bonus-rows"></div><button id="add-bonus" type="button"></button>
      <button type="submit"></button>
    </form>
    <div id="result" role="status" aria-live="polite"></div>
    <input type="text" id="employeeLabel">
    <button id="add-employee" type="button"></button>
    <table id="employee-table"><tbody id="employee-rows"></tbody>
      <tfoot><tr><td id="employee-total-wages"></td>
      <td id="employee-total-levy"></td></tr></tfoot></table>
    <button id="export-csv" type="button"></button><div id="disclaimer"></div>
    <template id="fields-baseRate">
      <input type="number" name="baseRate" min="0" step="0.01"
        inputmode="decimal" id="baseRate">
      <input type="number" name="overtime" min="0" step="0.01"
        inputmode="decimal" id="overtime">
      <input type="number" name="allowances" min="0" step="0.01"
        inputmode="decimal" id="allowances">
    </template>
    <template id="fields-annual">
      <input type="number" name="annualSalary" min="0" step="0.01"
        inputmode="decimal" id="annualSalary">
    </template>
    <template id="fields-casual">
      <input type="month" name="reportingMonth" id="reportingMonth" required>
      <input type="checkbox" name="instrumentSpecifiesLoading"
        id="instrumentSpecifiesLoading">
      <input type="checkbox" name="loadingQuantifiable" id="loadingQuantifiable">
      <input type="number" name="casualBasePay" min="0" step="0.01"
        inputmode="decimal" id="casualBasePay">
      <input type="number" name="casualLoading" min="0" step="0.01"
        inputmode="decimal" id="casualLoading">
      <input type="number" name="ordinaryPay" min="0" step="0.01"
        inputmode="decimal" id="ordinaryPay">
    </template>
    <template id="bonus-row-template">
      <input type="number" min="0" step="0.01" inputmode="decimal"
        class="bonus-amount">
      <select class="bonus-frequency">
        <option value="weekly">Weekly</option>
        <option value="fortnightly">Fortnightly</option>
        <option value="monthly">Monthly</option>
        <option value="quarterly">Quarterly</option>
        <option value="halfYearly">Half-yearly</option>
        <option value="annually">Annually</option>
      </select>
      <button type="button" class="bonus-remove"></button>
    </template>
    <script type="module">
      import {} from '/assets/levy.mjs';
      import { registerCoalLslTools } from '/assets/levy-webmcp.mjs';
      registerCoalLslTools(document.modelContext);
    </script>
    """
    calculator_failures: list[str] = []
    contracts.check_calculator_contract(valid_calculator, calculator_failures)
    assert calculator_failures == []
    calculator_mutations = [
        (
            valid_calculator.replace('name="sacrificed"', 'name="changedSacrificed"'),
            f"{contracts.CALCULATOR_REL}: #sacrificed name must be 'sacrificed', found "
            "'changedSacrificed'",
        ),
        (
            valid_calculator.replace('name="baseRate" min="0"', 'name="baseRate" min="-1"'),
            f"{contracts.CALCULATOR_REL}: #baseRate min must be '0', found '-1'",
        ),
        (
            valid_calculator.replace('name="overtime" min="0" step="0.01"',
                                     'name="overtime" min="0" step="1"'),
            f"{contracts.CALCULATOR_REL}: #overtime step must be '0.01', found '1'",
        ),
        (
            valid_calculator.replace('id="reportingMonth" required', 'id="reportingMonth"'),
            f"{contracts.CALCULATOR_REL}: #reportingMonth must have required",
        ),
        (
            valid_calculator.replace('id="add-employee" type="button"',
                                     'id="add-employee" type="submit"'),
            f"{contracts.CALCULATOR_REL}: #add-employee type must be 'button', found 'submit'",
        ),
        (
            valid_calculator.replace('<option value="monthly">',
                                     '<option value="yearly">'),
            f"{contracts.CALCULATOR_REL}: bonus frequency values must be "
            "['weekly', 'fortnightly', 'monthly', 'quarterly', 'halfYearly', "
            "'annually'], found ['weekly', 'fortnightly', 'yearly', 'quarterly', "
            "'halfYearly', 'annually']",
        ),
        (
            valid_calculator.replace('type="radio" name="branch" value="annual"',
                                     'type="checkbox" name="branch" value="annual"'),
            f"{contracts.CALCULATOR_REL}: branch radio contract changed",
        ),
        (
            valid_calculator.replace(
                '<div id="result" role="status" aria-live="polite"></div>',
                '<span id="result" role="status" aria-live="polite"></span>',
            ),
            f"{contracts.CALCULATOR_REL}: #result must be a polite status region",
        ),
        (
            valid_calculator.replace(
                "import { registerCoalLslTools } from '/assets/levy-webmcp.mjs';",
                "",
            ),
            f"{contracts.CALCULATOR_REL}: WebMCP adapter import missing",
        ),
        (
            valid_calculator.replace(
                "registerCoalLslTools(document.modelContext);",
                "",
            ),
            f"{contracts.CALCULATOR_REL}: top-level WebMCP registration missing",
        ),
    ]
    for mutated_calculator, expected_failure in calculator_mutations:
        mutation_failures: list[str] = []
        contracts.check_calculator_contract(mutated_calculator, mutation_failures)
        expect_failure(mutation_failures, expected_failure)

    with tempfile.TemporaryDirectory() as temp_dir:
        root = Path(temp_dir)
        calculator = root / contracts.CALCULATOR_REL
        calculator.parent.mkdir(parents=True)
        calculator.write_text(
            "import { registerCoalLslTools } from '/assets/levy-webmcp.mjs';",
            encoding="utf-8",
        )
        about = root / "about" / "index.html"
        about.parent.mkdir(parents=True)
        about.write_text(
            "import { registerCoalLslTools } from '/assets/levy-webmcp.mjs';",
            encoding="utf-8",
        )
        webmcp_scope_failures = contracts.check_webmcp_scope([calculator, about], root)
        expect_failure(
            webmcp_scope_failures,
            "about/index.html: Coal LSL WebMCP import is calculator-only",
        )

    valid_evaluation_html = """
    <main id="main">
    <article>
    <section id="accounting-problem"><h2>Accounting problem</h2></section>
    <section id="fabricated-inputs"><h2>Fabricated inputs</h2></section>
    <section id="expected-result"><h2>Expected result</h2>
      <p>Exit 2 with NOT_READY.</p>
      <p>Exit 0 with READY and no configured findings.</p>
    </section>
    <section id="controls-triggered"><h2>Controls triggered</h2>
      <p>MISSING_ARTEFACT for gst_control_gl</p>
      <p>SELF_REVIEW_INCOMPLETE</p>
      <p>OPEN_ITEM_BLOCKING</p>
    </section>
    <section id="human-decision"><h2>Human decision</h2>
      <p>READY means no configured gate tripped; it is not approval, advice or lodgment authority.</p>
    </section>
    <section id="reproduce"><h2>Reproduce</h2><pre><code>git clone --branch v0.1.1 --depth 1 https://github.com/ryanduguid/workpaper-review-gate.git
cd workpaper-review-gate
uv sync --locked --all-extras
uv run review-ready gate --profile bas --pack examples/bas-not-ready --output outputs/evaluation-not-ready
uv run review-ready gate --profile bas --pack examples/bas-ready --output outputs/evaluation-ready
uv run pytest tests/test_evaluation_pack.py -q</code></pre></section>
    <section id="primary-sources"><h2>Primary sources</h2>
      <a href="https://www.ato.gov.au/businesses-and-organisations/preparing-lodging-and-paying/business-activity-statements-bas">BAS</a>
      <a href="https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/lodging-your-bas-or-annual-gst-return/options-for-reporting-and-paying-gst/monthly-gst-reporting">GST</a>
    </section>
    <section id="versions"><h2>Versions</h2>
      <p>Product release v0.1.1; fixture version 1; source reviewed 2026-08-26.</p>
      <a href="https://github.com/ryanduguid/workpaper-review-gate/tree/v0.1.1/evaluation/manager_review_gate">Pack</a>
      <a href="https://github.com/ryanduguid/workpaper-review-gate/blob/v0.1.1/evaluation/manager_review_gate/expected_results.json">Results</a>
      <a href="https://github.com/ryanduguid/workpaper-review-gate/blob/v0.1.1/tests/test_evaluation_pack.py">Test</a>
    </section>
    <section id="limitations"><h2>Limitations</h2>
      <a href="/evidence/">Evidence and Assurance</a>
    </section>
    </article>
    </main>
    <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"TechArticle","author":{"@id":"https://duguid.com.au/about/#person"}}
    </script>
    """
    valid_xero_evaluation_html = """
    <header><a href="/evidence/">Evidence</a></header>
    <main id="main">
    <article>
    <nav aria-label="On this page">
      <a href="#accounting-problem">Accounting problem</a>
      <a href="#intended-reviewer">Intended reviewer</a>
      <a href="#fabricated-inputs">Fabricated inputs</a>
      <a href="#reproduce">Reproduce</a>
      <a href="#expected-result">Expected result</a>
      <a href="#controls-triggered">Controls triggered</a>
      <a href="#primary-sources">Primary sources</a>
      <a href="#versions">Versions</a>
      <a href="#human-decision">Human decision</a>
      <a href="#limitations">Limitations</a>
    </nav>
    <section id="accounting-problem"><h2>Accounting problem</h2>
      <p>The production tool reads trial balance data directly from Xero's Accounting API Reports endpoint.</p>
    </section>
    <section id="intended-reviewer"><h2>Intended reviewer</h2>
      <p>This pack is for a reviewer who wants to reproduce the offline integrity gate without connecting to Xero or handling client data.</p>
    </section>
    <section id="fabricated-inputs"><h2>Fabricated inputs</h2>
      <p>The three CSV files are fabricated output-shape fixtures.</p>
      <p>They are not Xero API responses or client records, and no OAuth flow runs in this evaluation.</p>
      <p>No Xero tenant credentials or tenant data are used.</p>
    </section>
    <section id="reproduce"><h2>Reproduce</h2>
      <p>Dependency installation may download the hash-locked packages.</p>
      <p>Once dependencies are installed, the three evaluation runner commands are fully offline, make no network request and write no output file.</p>
      <pre><code>python -m pip install --require-hashes -r requirements.lock
python -B -m unittest tests.test_evaluation_pack -v
python -B -m unittest discover -s tests -v
python evaluation/xero_tb_integrity/run.py evaluation/xero_tb_integrity/fixtures/passing.csv
python evaluation/xero_tb_integrity/run.py evaluation/xero_tb_integrity/fixtures/failing_movement.csv
python evaluation/xero_tb_integrity/run.py evaluation/xero_tb_integrity/fixtures/failing_ytd.csv</code></pre>
    </section>
    <section id="expected-result"><h2>Expected result</h2>
      <p>passing.csv exits 0 and reports that movement and YTD balance.</p>
      <p>failing_movement.csv exits 1, identifies the movement pair and reports Nothing written.</p>
      <p>failing_ytd.csv exits 1, identifies the YTD pair and reports Nothing written.</p>
    </section>
    <section id="controls-triggered"><h2>Controls triggered</h2>
      <p>failing_movement.csv breaks only the current-month Debit/Credit pair.</p>
      <p>failing_ytd.csv breaks only the YTDDebit/YTDCredit pair.</p>
      <p>The evaluation runner calls the production check_balanced gate before any CSV write.</p>
    </section>
    <section id="primary-sources"><h2>Primary sources</h2>
      <a href="https://developer.xero.com/documentation/api/accounting/reports">Reports</a>
      <a href="https://developer.xero.com/documentation/guides/oauth2/scopes/">Scopes</a>
    </section>
    <section id="versions"><h2>Versions</h2>
      <p>Product release v0.1.4; fixture version 1; source reviewed 2026-08-26.</p>
      <a href="https://github.com/ryanduguid/xero-trial-balance-export/releases/tag/v0.1.4">Release</a>
      <a href="https://github.com/ryanduguid/xero-trial-balance-export/tree/787f936d373fed47591102d4c24d0c5edf6b1861/evaluation/xero_tb_integrity">Pack</a>
      <a href="https://github.com/ryanduguid/xero-trial-balance-export/blob/787f936d373fed47591102d4c24d0c5edf6b1861/evaluation/xero_tb_integrity/expected_results.json">Results</a>
      <a href="https://github.com/ryanduguid/xero-trial-balance-export/blob/787f936d373fed47591102d4c24d0c5edf6b1861/tests/test_evaluation_pack.py">Test</a>
    </section>
    <section id="human-decision"><h2>Human decision</h2>
      <p>A balanced export passes this integrity control only; a human still decides completeness, classification, accounting treatment and fitness for review.</p>
    </section>
    <section id="limitations"><h2>Limitations</h2>
      <p>This control does not prove completeness, classification, accounting treatment or client approval.</p>
      <p>It does not assess source-data accuracy, reporting-period suitability or fitness for a particular client review.</p>
      <a href="/evidence/">Evidence and Assurance</a>
    </section>
    </article>
    </main>
    <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"TechArticle","author":{"@id":"https://duguid.com.au/about/#person"}}
    </script>
    """
    valid_payday_evaluation_html = """
    <main id="main"><article>
    <nav aria-label="On this page"><a href="#accounting-problem">Accounting problem</a><a href="#limitations">Limitations</a></nav>
    <section id="accounting-problem"><h2>Accounting problem</h2><p>Contribution timing needs evidence.</p></section>
    <section id="intended-reviewer"><h2>Intended reviewer</h2><p>A reviewer can reproduce this fabricated evaluation.</p></section>
    <section id="fabricated-inputs"><h2>Fabricated inputs</h2><p>The fabricated inputs use a supported due date of 17 August 2026 and an as-at date of 20 August 2026. No client, employee or live payroll data is included.</p></section>
    <section id="reproduce"><h2>Reproduce</h2><p>Use a checkout fixed at merge commit 139f4e5603f5a383b5d2f23874a4d4c345a1fb71 and run these commands from the repository root. The first four commands write the four reports; the final command runs the evaluation contract test.</p><pre><code>uv run --locked --extra dev --python 3.12 payday-super-check evaluation/payday_super_evidence/fixtures/timely_remittance_no_receipt.csv --as-at 2026-08-20 -o timely-report.csv
uv run --locked --extra dev --python 3.12 payday-super-check evaluation/payday_super_evidence/fixtures/late_remittance_no_receipt.csv --as-at 2026-08-20 -o late-remittance-report.csv
uv run --locked --extra dev --python 3.12 payday-super-check evaluation/payday_super_evidence/fixtures/receipt_on_due_date.csv --as-at 2026-08-20 -o on-time-report.csv
uv run --locked --extra dev --python 3.12 payday-super-check evaluation/payday_super_evidence/fixtures/receipt_after_due_date.csv --as-at 2026-08-20 -o late-receipt-report.csv
uv run --locked --extra dev --python 3.12 pytest tests/test_evaluation_pack.py -q</code></pre></section>
    <section id="expected-result"><h2>Expected result</h2><p>17 August 2026 and 20 August 2026.</p><p>timely_remittance_no_receipt.csv exits 2 with AT_RISK.</p><p>late_remittance_no_receipt.csv exits 2 with LATE.</p><p>receipt_on_due_date.csv exits 0 with ON_TIME.</p><p>receipt_after_due_date.csv exits 2 with LATE.</p><p>A missing receipt cannot prove on-time, remittance timing can prove late, and timely remittance without receipt remains at-risk.</p></section>
    <section id="controls-triggered"><h2>Controls triggered</h2><p>AT_RISK, ON_TIME and LATE.</p></section>
    <section id="primary-sources"><h2>Primary sources</h2><a href="https://www.legislation.gov.au/C2004A04402/latest/text">Legislation</a><a href="https://www.ato.gov.au/law/view/document?DocID=COG%2FLCR20262%2FNAT%2FATO%2F00001">Ruling</a><a href="https://github.com/ryanduguid/payday-super-checker/blob/v0.1.2/docs/primary-source-review-2026-08-15.md">Review</a></section>
    <section id="versions"><h2>Versions</h2><p>Product release v0.1.2; fixture version 1; source reviewed 15 August 2026. v0.1.2 predates the evaluation directory and the evaluation artefacts are fixed to the merge commit.</p><a href="https://github.com/ryanduguid/payday-super-checker/releases/tag/v0.1.2">Release</a><a href="https://github.com/ryanduguid/payday-super-checker/tree/139f4e5603f5a383b5d2f23874a4d4c345a1fb71/evaluation/payday_super_evidence">Pack</a><a href="https://github.com/ryanduguid/payday-super-checker/blob/139f4e5603f5a383b5d2f23874a4d4c345a1fb71/evaluation/payday_super_evidence/expected_results.json">Results</a><a href="https://github.com/ryanduguid/payday-super-checker/blob/139f4e5603f5a383b5d2f23874a4d4c345a1fb71/tests/test_evaluation_pack.py">Test</a></section>
    <section id="human-decision"><h2>Human decision</h2><p>Remittance evidence can show operational timing but cannot prove on-time; a human must establish eligible fund receipt, allocation and the other assessment facts before relying on a statutory conclusion.</p></section>
    <section id="limitations"><h2>Limitations</h2><p>Experimental review aid. Not a compliance determination. This evaluation does not provide advice or make an ATO assessment.</p><a href="/evidence/">Evidence and Assurance</a></section>
    </article></main>
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"TechArticle","author":{"@id":"https://duguid.com.au/about/#person"}}</script>
    """
    evaluation_rel = "evaluate/manager-review-gate/index.html"
    evaluation_url = "https://duguid.com.au/evaluate/manager-review-gate/"
    xero_evaluation_rel = "evaluate/xero-trial-balance-integrity/index.html"
    xero_evaluation_url = (
        "https://duguid.com.au/evaluate/xero-trial-balance-integrity/"
    )
    payday_evaluation_rel = "evaluate/payday-super-evidence/index.html"
    payday_evaluation_url = "https://duguid.com.au/evaluate/payday-super-evidence/"
    with tempfile.TemporaryDirectory() as temp_dir:
        root = Path(temp_dir)
        def check_evaluation_fixture(
            html: str = valid_evaluation_html,
            sitemap: str = (
                f"<loc>{evaluation_url}</loc>"
                f"<loc>{xero_evaluation_url}</loc>"
                f"<loc>{payday_evaluation_url}</loc><lastmod>2026-08-26</lastmod>"
            ),
            llms: str = (
                "## Evaluation packs\n"
                f"{evaluation_url}\n{xero_evaluation_url}\n{payday_evaluation_url}"
            ),
            target_rel: str = evaluation_rel,
        ) -> list[str]:
            fixtures = {
                evaluation_rel: valid_evaluation_html,
                xero_evaluation_rel: valid_xero_evaluation_html,
                payday_evaluation_rel: valid_payday_evaluation_html,
            }
            assert target_rel in fixtures
            fixtures[target_rel] = html
            for rel, fixture_html in fixtures.items():
                path = root / rel
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(fixture_html, encoding="utf-8")
            (root / "sitemap.xml").write_text(sitemap, encoding="utf-8")
            (root / "llms.txt").write_text(llms, encoding="utf-8")
            return contracts.check_evaluation_packs(root)

        def changed(old: str, new: str) -> str:
            assert old in valid_evaluation_html
            return valid_evaluation_html.replace(old, new, 1)

        def require_failures(html: str, *expected_failures: str) -> None:
            actual_failures = check_evaluation_fixture(html)
            for expected_failure in expected_failures:
                expect_failure(actual_failures, expected_failure)

        def section_href_failure(
            section_id: str, missing: list[str], unexpected: list[str]
        ) -> str:
            return (
                f"{evaluation_rel}: #{section_id} evidence hrefs must match "
                f"exactly once; missing {missing!r}; unexpected {unexpected!r}"
            )

        def global_product_href_failure(
            missing: list[str], unexpected: list[str]
        ) -> str:
            return (
                f"{evaluation_rel}: global review-ready-gate evidence hrefs "
                "must match approved v0.1.1 URLs exactly once; missing "
                f"{missing!r}; unexpected {unexpected!r}"
            )

        assert check_evaluation_fixture() == []

        evaluation_labels = (
            "Accounting problem",
            "Fabricated inputs",
            "Expected result",
            "Controls triggered",
            "Human decision",
            "Reproduce",
            "Primary sources",
            "Versions",
            "Limitations",
        )
        for label in evaluation_labels:
            require_failures(
                changed(f"<h2>{label}</h2>", "<h2>Removed heading</h2>"),
                f"{evaluation_rel}: missing visible evaluation label {label!r}",
            )

        contract_mutations = (
            ("Exit 2", "Exit 3", "Exit 2 with NOT_READY"),
            ("NOT_READY", "INCOMPLETE", "Exit 2 with NOT_READY"),
            ("Exit 0", "Exit 1", "Exit 0 with READY and no configured findings"),
            (
                "Exit 0 with READY and no configured findings.",
                "Exit 0 with REVIEWED and no configured findings.",
                "Exit 0 with READY and no configured findings",
            ),
            (
                "no configured findings.",
                "no reported findings.",
                "Exit 0 with READY and no configured findings",
            ),
            (
                "MISSING_ARTEFACT",
                "MISSING_DOCUMENT",
                "MISSING_ARTEFACT for gst_control_gl",
            ),
            (
                "gst_control_gl",
                "gst_control_ledger",
                "MISSING_ARTEFACT for gst_control_gl",
            ),
            ("SELF_REVIEW_INCOMPLETE", "SELF_REVIEW_CHANGED", "SELF_REVIEW_INCOMPLETE"),
            ("OPEN_ITEM_BLOCKING", "OPEN_ITEM_CHANGED", "OPEN_ITEM_BLOCKING"),
            (
                "READY means no configured gate tripped; it is not approval, "
                "advice or lodgment authority.",
                "READY means the pack has been approved for lodgment.",
                "READY means no configured gate tripped; it is not approval, "
                "advice or lodgment authority.",
            ),
        )
        for old, new, required_text in contract_mutations:
            require_failures(
                changed(old, new),
                f"{evaluation_rel}: missing visible contract text {required_text!r}",
            )

        version_mutations = (
            ("Product release v0.1.1", "Product release v0.1.2"),
            ("fixture version 1", "fixture version 2"),
            ("source reviewed 2026-08-26", "source reviewed 2026-08-25"),
        )
        for required_label, replacement in version_mutations:
            require_failures(
                changed(required_label, replacement),
                f"{evaluation_rel}: missing visible version label "
                f"{required_label!r}",
            )

        require_failures(
            changed(
                "<h2>Limitations</h2>",
                "<h2>Limitations</h2><code>v0.1.0</code>",
            ),
            f"{evaluation_rel}: visible evaluator text must not name v0.1.0",
        )
        require_failures(
            changed(
                "<p>SELF_REVIEW_INCOMPLETE</p>",
                "<p>SELF_REVIEW_CHANGED</p>"
                "<p class='visually-hidden'>SELF_REVIEW_INCOMPLETE</p>",
            ),
            f"{evaluation_rel}: missing visible contract text "
            "'SELF_REVIEW_INCOMPLETE'",
        )
        require_failures(
            changed(
                "<p>SELF_REVIEW_INCOMPLETE</p>",
                "<p>SELF_REVIEW_CHANGED</p>"
                '<div class="visually&#45;hidden">'
                "<span>SELF_REVIEW_INCOMPLETE</span></div>",
            ),
            f"{evaluation_rel}: missing visible contract text "
            "'SELF_REVIEW_INCOMPLETE'",
        )

        recipe_mutations = (
            (
                "git clone --branch v0.1.1 --depth 1 "
                "https://github.com/ryanduguid/workpaper-review-gate.git",
                "git clone --branch v0.1.2 --depth 1 "
                "https://github.com/ryanduguid/workpaper-review-gate.git",
            ),
            ("cd workpaper-review-gate", "cd changed-workpaper-review-gate"),
            ("uv sync --locked --all-extras", "uv sync --all-extras"),
            (
                "uv run review-ready gate --profile bas --pack "
                "examples/bas-not-ready --output outputs/evaluation-not-ready",
                "uv run review-ready gate --profile bas --pack "
                "examples/bas-other --output outputs/evaluation-not-ready",
            ),
            (
                "uv run review-ready gate --profile bas --pack examples/bas-ready "
                "--output outputs/evaluation-ready",
                "uv run review-ready gate --profile bas --pack examples/bas-other "
                "--output outputs/evaluation-ready",
            ),
            (
                "uv run pytest tests/test_evaluation_pack.py -q",
                "uv run pytest tests/test_other_pack.py -q",
            ),
        )
        for line_number, (configured_line, replacement) in enumerate(
            recipe_mutations, start=1
        ):
            require_failures(
                changed(configured_line, replacement),
                f"{evaluation_rel}: #reproduce line {line_number} must be "
                f"{configured_line!r}, found {replacement!r}",
            )
        require_failures(
            changed(
                "</code></pre></section>",
                "</code></pre><pre><code>echo duplicate</code></pre></section>",
            ),
            f"{evaluation_rel}: #reproduce must contain exactly one visible "
            "code block, found 2",
        )

        product_urls = (
            "https://github.com/ryanduguid/workpaper-review-gate/tree/v0.1.1/"
            "evaluation/manager_review_gate",
            "https://github.com/ryanduguid/workpaper-review-gate/blob/v0.1.1/"
            "evaluation/manager_review_gate/expected_results.json",
            "https://github.com/ryanduguid/workpaper-review-gate/blob/v0.1.1/"
            "tests/test_evaluation_pack.py",
        )
        primary_source_urls = (
            "https://www.ato.gov.au/businesses-and-organisations/"
            "preparing-lodging-and-paying/business-activity-statements-bas",
            "https://www.ato.gov.au/businesses-and-organisations/"
            "gst-excise-and-indirect-taxes/gst/lodging-your-bas-or-annual-gst-return/"
            "options-for-reporting-and-paying-gst/monthly-gst-reporting",
        )
        for product_url in product_urls:
            changed_url = f"{product_url}?changed=1"
            require_failures(
                changed(product_url, changed_url),
                section_href_failure("versions", [product_url], [changed_url]),
                global_product_href_failure([product_url], [changed_url]),
            )
        for source_url in primary_source_urls:
            changed_url = f"{source_url}?changed=1"
            require_failures(
                changed(source_url, changed_url),
                section_href_failure(
                    "primary-sources", [source_url], [changed_url]
                ),
            )

        duplicate_product_url = product_urls[0]
        require_failures(
            changed(
                ">Pack</a>",
                f">Pack</a><a href=\"{duplicate_product_url}\">Duplicate</a>",
            ),
            section_href_failure("versions", [], [duplicate_product_url]),
            global_product_href_failure([], [duplicate_product_url]),
        )
        duplicate_source_url = primary_source_urls[0]
        require_failures(
            changed(
                ">BAS</a>",
                f">BAS</a><a href=\"{duplicate_source_url}\">Duplicate</a>",
            ),
            section_href_failure(
                "primary-sources", [], [duplicate_source_url]
            ),
        )

        product_url_variants = (
            (product_urls[0].replace("/v0.1.1/", "/v0.1.2/"), "wrong version"),
            (product_urls[0].replace("/v0.1.1/", "/main/"), "main"),
            (product_urls[0].replace("https:", ""), "protocol relative"),
            (product_urls[0].replace("https://", "http://"), "http"),
            (f"{product_urls[0]}#changed", "fragment"),
        )
        for changed_url, _variant_name in product_url_variants:
            require_failures(
                changed(product_urls[0], changed_url),
                global_product_href_failure([product_urls[0]], [changed_url]),
            )

        extra_product_url = (
            "https://github.com/ryanduguid/workpaper-review-gate/issues"
        )
        require_failures(
            changed(
                '<a href="/evidence/">Evidence and Assurance</a>',
                f'<a href="{extra_product_url}">Extra</a>'
                '<a href="/evidence/">Evidence and Assurance</a>',
            ),
            global_product_href_failure([], [extra_product_url]),
        )
        failed_tag_url = product_urls[0].replace("/v0.1.1/", "/v0.1.0/")
        require_failures(
            changed(product_urls[0], failed_tag_url),
            global_product_href_failure([product_urls[0]], [failed_tag_url]),
        )

        require_failures(
            changed('<a href="/evidence/">Evidence and Assurance</a>', ""),
            f"{evaluation_rel}: no visible link to /evidence/",
        )
        require_failures(
            changed(
                "<h2>Limitations</h2>",
                "<h2>Limitations</h2><p>Client case study</p>",
            ),
            f"{evaluation_rel}: must not use client case-study wording",
        )
        require_failures(
            changed(
                '"author":{"@id":"https://duguid.com.au/about/#person"}',
                '"author":{"@id":"https://example.com/other-person"}',
            ),
            f"{evaluation_rel}: TechArticle must be authored by the canonical "
            "Person",
        )

        route_mutations = (
            (
                "",
                evaluation_url,
                f"sitemap.xml: evaluation URL {evaluation_url} must appear "
                "once, found 0",
            ),
            (
                f"<loc>{evaluation_url}</loc><loc>{evaluation_url}</loc>",
                evaluation_url,
                f"sitemap.xml: evaluation URL {evaluation_url} must appear "
                "once, found 2",
            ),
            (
                f"<loc>{evaluation_url}</loc>",
                "",
                f"llms.txt: evaluation URL {evaluation_url} must appear once, "
                "found 0",
            ),
            (
                f"<loc>{evaluation_url}</loc>",
                f"{evaluation_url}\n{evaluation_url}",
                f"llms.txt: evaluation URL {evaluation_url} must appear once, "
                "found 2",
            ),
        )
        for sitemap, llms, expected_failure in route_mutations:
            expect_failure(
                check_evaluation_fixture(sitemap=sitemap, llms=llms),
                expected_failure,
            )

        def check_xero_evaluation_fixture(
            html: str = valid_xero_evaluation_html,
        ) -> list[str]:
            return check_evaluation_fixture(
                html=html, target_rel=xero_evaluation_rel
            )

        assert check_xero_evaluation_fixture() == []
        article_outside_main = (
            valid_xero_evaluation_html.replace(
                '    <main id="main">\n    <article>',
                '    <main id="main"></main>\n    <article>',
                1,
            ).replace('    </article>\n    </main>', '    </article>', 1)
        )
        expect_failure(
            check_xero_evaluation_fixture(article_outside_main),
            f"{xero_evaluation_rel}: main#main must contain exactly one visible "
            "evaluator article, found 0",
        )
        xero_sections = (
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
        )
        renamed_body_heading = valid_xero_evaluation_html.replace(
            "<h2>Accounting problem</h2>",
            "<h2>Renamed accounting problem</h2>",
            1,
        )
        expect_failure(
            check_xero_evaluation_fixture(renamed_body_heading),
            f"{xero_evaluation_rel}: #accounting-problem heading must be "
            "'Accounting problem', found 'Renamed accounting problem'",
        )
        limitations_link = '<a href="/evidence/">Evidence and Assurance</a>'
        for replacement in ("", '<a href="/evidence/">Evidence record</a>'):
            expect_failure(
                check_xero_evaluation_fixture(
                    valid_xero_evaluation_html.replace(
                        limitations_link, replacement, 1
                    )
                ),
                f"{xero_evaluation_rel}: #limitations must link /evidence/ "
                "with visible label 'Evidence and Assurance' exactly once, "
                "found 0",
            )

        xero_contract_claims = (
            "The production tool reads trial balance data directly from Xero's "
            "Accounting API Reports endpoint.",
            "This pack is for a reviewer who wants to reproduce the offline "
            "integrity gate without connecting to Xero or handling client data.",
            "The three CSV files are fabricated output-shape fixtures.",
            "They are not Xero API responses or client records, and no OAuth "
            "flow runs in this evaluation.",
            "No Xero tenant credentials or tenant data are used.",
            "Dependency installation may download the hash-locked packages.",
            "Once dependencies are installed, the three evaluation runner "
            "commands are fully offline, make no network request and write no "
            "output file.",
            "passing.csv exits 0 and reports that movement and YTD balance.",
            "failing_movement.csv exits 1, identifies the movement pair and "
            "reports Nothing written.",
            "failing_ytd.csv exits 1, identifies the YTD pair and reports Nothing "
            "written.",
            "failing_movement.csv breaks only the current-month Debit/Credit pair.",
            "failing_ytd.csv breaks only the YTDDebit/YTDCredit pair.",
            "The evaluation runner calls the production check_balanced gate "
            "before any CSV write.",
            "A balanced export passes this integrity control only; a human still "
            "decides completeness, classification, accounting treatment and "
            "fitness for review.",
            "This control does not prove completeness, classification, accounting "
            "treatment or client approval.",
            "It does not assess source-data accuracy, reporting-period suitability "
            "or fitness for a particular client review.",
        )
        relocated_claim = xero_contract_claims[1]
        relocated_claim_html = valid_xero_evaluation_html.replace(
            f"      <p>{relocated_claim}</p>\n", "", 1
        ).replace(
            "    </main>\n",
            f"    </main>\n    <p>{relocated_claim}</p>\n",
            1,
        )
        expect_failure(
            check_xero_evaluation_fixture(relocated_claim_html),
            f"{xero_evaluation_rel}: missing visible contract text "
            f"{relocated_claim!r}",
        )
        for claim in xero_contract_claims:
            assert claim in valid_xero_evaluation_html
            expect_failure(
                check_xero_evaluation_fixture(
                    valid_xero_evaluation_html.replace(claim, "", 1)
                ),
                f"{xero_evaluation_rel}: missing visible contract text {claim!r}",
            )

        primary_section = core.section_html(
            valid_xero_evaluation_html, "primary-sources"
        )
        versions_section = core.section_html(valid_xero_evaluation_html, "versions")
        assert primary_section and versions_section
        swapped_sections_html = (
            valid_xero_evaluation_html.replace(
                primary_section, "XERO_SECTION_SWAP_PLACEHOLDER", 1
            )
            .replace(versions_section, primary_section, 1)
            .replace("XERO_SECTION_SWAP_PLACEHOLDER", versions_section, 1)
        )
        expected_section_ids = [identifier for identifier, _label in xero_sections]
        swapped_section_ids = expected_section_ids.copy()
        swapped_section_ids[6], swapped_section_ids[7] = (
            swapped_section_ids[7],
            swapped_section_ids[6],
        )
        expect_failure(
            check_xero_evaluation_fixture(swapped_sections_html),
            f"{xero_evaluation_rel}: evaluation section order must be "
            f"{expected_section_ids!r}, found {swapped_section_ids!r}",
        )
        xero_commit = "787f936d373fed47591102d4c24d0c5edf6b1861"
        xero_blob_url = (
            "https://github.com/ryanduguid/xero-trial-balance-export/blob/"
            f"{xero_commit}/tests/test_evaluation_pack.py"
        )
        blob_main_url = xero_blob_url.replace(f"/{xero_commit}/", "/main/")
        expect_failure(
            check_xero_evaluation_fixture(
                valid_xero_evaluation_html.replace(
                    xero_blob_url, blob_main_url, 1
                )
            ),
            f"{xero_evaluation_rel}: product evidence URL must not use "
            f"/blob/main/: {blob_main_url}",
        )
        short_commit_url = xero_blob_url.replace(xero_commit, xero_commit[:7])
        expect_failure(
            check_xero_evaluation_fixture(
                valid_xero_evaluation_html.replace(
                    xero_blob_url, short_commit_url, 1
                )
            ),
            f"{xero_evaluation_rel}: product evidence URL must contain a "
            f"40-character commit: {short_commit_url}",
        )
        other_commit = "0123456789abcdef0123456789abcdef01234567"
        other_commit_url = xero_blob_url.replace(xero_commit, other_commit)
        expect_failure(
            check_xero_evaluation_fixture(
                valid_xero_evaluation_html.replace(
                    xero_blob_url, other_commit_url, 1
                )
            ),
            f"{xero_evaluation_rel}: product evidence URL commit must be "
            f"{xero_commit}: {other_commit_url}",
        )

        def check_payday_evaluation_fixture(
            html: str = valid_payday_evaluation_html,
            sitemap: str | None = None,
            llms: str | None = None,
        ) -> list[str]:
            args = {"html": html, "target_rel": payday_evaluation_rel}
            if sitemap is not None:
                args["sitemap"] = sitemap
            if llms is not None:
                args["llms"] = llms
            return check_evaluation_fixture(**args)

        assert check_payday_evaluation_fixture() == []
        payday_article_pattern_failures: list[str] = []
        contracts.check_article_pattern(
            valid_payday_evaluation_html,
            payday_evaluation_rel,
            payday_article_pattern_failures,
        )
        assert payday_article_pattern_failures == []
        missing_payday_article_toc = valid_payday_evaluation_html.replace(
            '<nav aria-label="On this page"><a href="#accounting-problem">Accounting problem</a><a href="#limitations">Limitations</a></nav>',
            "",
            1,
        )
        missing_payday_article_toc_failures: list[str] = []
        contracts.check_article_pattern(
            missing_payday_article_toc,
            payday_evaluation_rel,
            missing_payday_article_toc_failures,
        )
        expect_failure(
            missing_payday_article_toc_failures,
            f"{payday_evaluation_rel}: expected exactly one On this page navigation",
        )
        payday_section_contracts = {
            "fabricated-inputs": (
                "supported due date of 17 August 2026 and an as-at date of 20 August 2026"
            ),
            "reproduce": (
                "Use a checkout fixed at merge commit 139f4e5603f5a383b5d2f23874a4d4c345a1fb71 and run these commands from the repository root. The first four commands write the four reports; the final command runs the evaluation contract test."
            ),
            "limitations": (
                "This evaluation does not provide advice or make an ATO assessment."
            ),
        }
        for section_id, required_text in payday_section_contracts.items():
            expect_failure(
                check_payday_evaluation_fixture(
                    valid_payday_evaluation_html.replace(required_text, "", 1)
                ),
                f"{payday_evaluation_rel}: #{section_id} missing visible "
                f"contract text {required_text!r}",
            )
        reversed_dates = (
            "supported due date of 20 August 2026 and an as-at date of 17 August 2026"
        )
        expect_failure(
            check_payday_evaluation_fixture(
                valid_payday_evaluation_html.replace(
                    payday_section_contracts["fabricated-inputs"], reversed_dates, 1
                )
            ),
            f"{payday_evaluation_rel}: #fabricated-inputs missing visible "
            f"contract text {payday_section_contracts['fabricated-inputs']!r}",
        )
        valid_payday_sitemap = (
            f"<loc>{evaluation_url}</loc><loc>{xero_evaluation_url}</loc>"
            f"<loc>{payday_evaluation_url}</loc><lastmod>2026-08-26</lastmod>"
        )
        expect_failure(
            check_payday_evaluation_fixture(
                sitemap=valid_payday_sitemap.replace("2026-08-26", "2026-08-25", 1)
            ),
            f"sitemap.xml: evaluation URL {payday_evaluation_url} must have "
            "lastmod '2026-08-26' exactly once, found ['2026-08-25']",
        )
        expect_failure(
            check_payday_evaluation_fixture(
                sitemap=valid_payday_sitemap.replace(
                    "<lastmod>2026-08-26</lastmod>", "", 1
                )
            ),
            f"sitemap.xml: evaluation URL {payday_evaluation_url} must have "
            "lastmod '2026-08-26' exactly once, found []",
        )
        moved_payday_llms = (
            "## Evaluation packs\n"
            f"{evaluation_url}\n{xero_evaluation_url}\n"
            f"## Other\n{payday_evaluation_url}"
        )
        expect_failure(
            check_payday_evaluation_fixture(llms=moved_payday_llms),
            f"llms.txt: evaluation URL {payday_evaluation_url} must appear "
            "once in ## Evaluation packs, found 0",
        )
        duplicate_payday_llms = (
            "## Evaluation packs\n"
            f"{evaluation_url}\n{xero_evaluation_url}\n{payday_evaluation_url}\n"
            f"## Other\n{payday_evaluation_url}"
        )
        expect_failure(
            check_payday_evaluation_fixture(llms=duplicate_payday_llms),
            f"llms.txt: evaluation URL {payday_evaluation_url} must appear "
            "once globally, found 2",
        )
        payday_source_url = (
            "https://github.com/ryanduguid/payday-super-checker/blob/v0.1.2/"
            "docs/primary-source-review-2026-08-15.md"
        )
        payday_source_main_url = payday_source_url.replace("/v0.1.2/", "/main/")
        expect_failure(
            check_payday_evaluation_fixture(
                valid_payday_evaluation_html.replace(
                    payday_source_url, payday_source_main_url, 1
                )
            ),
            f"{payday_evaluation_rel}: #primary-sources evidence hrefs must match "
            f"exactly once; missing {[payday_source_url]!r}; unexpected "
            f"{[payday_source_main_url]!r}",
        )
        payday_commit = "139f4e5603f5a383b5d2f23874a4d4c345a1fb71"
        payday_test_url = (
            "https://github.com/ryanduguid/payday-super-checker/blob/"
            f"{payday_commit}/tests/test_evaluation_pack.py"
        )
        payday_main_url = payday_test_url.replace(f"/{payday_commit}/", "/main/")
        expect_failure(
            check_payday_evaluation_fixture(
                valid_payday_evaluation_html.replace(
                    payday_test_url, payday_main_url, 1
                )
            ),
            f"{payday_evaluation_rel}: product evidence URL must not use "
            f"/blob/main/: {payday_main_url}",
        )
        payday_tree_url = (
            "https://github.com/ryanduguid/payday-super-checker/tree/"
            f"{payday_commit}/evaluation/payday_super_evidence"
        )
        other_payday_commit = "0123456789abcdef0123456789abcdef01234567"
        tampered_tree_url = payday_tree_url.replace(
            payday_commit, other_payday_commit
        )
        expect_failure(
            check_payday_evaluation_fixture(
                valid_payday_evaluation_html.replace(
                    payday_tree_url, tampered_tree_url, 1
                )
            ),
            f"{payday_evaluation_rel}: product evidence URL commit must be "
            f"{payday_commit}: {tampered_tree_url}",
        )
        short_payday_test_url = payday_test_url.replace(
            payday_commit, payday_commit[:7]
        )
        expect_failure(
            check_payday_evaluation_fixture(
                valid_payday_evaluation_html.replace(
                    payday_test_url, short_payday_test_url, 1
                )
            ),
            f"{payday_evaluation_rel}: product evidence URL must contain a "
            f"40-character commit: {short_payday_test_url}",
        )
        wrong_payday_test_url = payday_test_url.replace(
            payday_commit, other_payday_commit
        )
        expect_failure(
            check_payday_evaluation_fixture(
                valid_payday_evaluation_html.replace(
                    payday_test_url, wrong_payday_test_url, 1
                )
            ),
            f"{payday_evaluation_rel}: product evidence URL commit must be "
            f"{payday_commit}: {wrong_payday_test_url}",
        )
        payday_human_decision = (
            "Remittance evidence can show operational timing but cannot prove on-time; "
            "a human must establish eligible fund receipt, allocation and the other "
            "assessment facts before relying on a statutory conclusion."
        )
        expect_failure(
            check_payday_evaluation_fixture(
                valid_payday_evaluation_html.replace(payday_human_decision, "", 1)
            ),
            f"{payday_evaluation_rel}: missing visible contract text "
            f"{payday_human_decision!r}",
        )

    assert not missing_negative_failures, (
        "negative self-check fixtures did not emit their required messages:\n  "
        + "\n  ".join(missing_negative_failures)
    )
    mcp_page = (core.ROOT / "tools/australian-tax-ai-agents/index.html").read_text(
        encoding="utf-8"
    )
    rendered_mcp_page = core.visible_html(mcp_page)
    commented_pypi_page = mcp_page.replace(
        '<a href="https://pypi.org/project/aus-accounting-mcp/">PyPI</a>',
        '<!-- <a href="https://pypi.org/project/aus-accounting-mcp/">PyPI</a> -->',
        1,
    )
    commented_rendered_mcp_page = core.visible_html(commented_pypi_page)
    assert not re.search(
        r'<a\b[^>]*href="https://pypi\.org/project/aus-accounting-mcp/"[^>]*>',
        commented_rendered_mcp_page,
        re.I,
    ), "a commented-out PyPI route must not satisfy the visible-route check"
    assert re.search(
        r'<a\b[^>]*href="https://pypi\.org/project/aus-accounting-mcp/"[^>]*>',
        rendered_mcp_page,
        re.I,
    ), "Australian tax AI agents page has no visible PyPI route"
    assert not re.search(
        r"\buntil\s+its\s+own\s+first\s+pypi\s+release\b",
        core.visible_text(rendered_mcp_page),
        re.I,
    ), "Australian tax AI agents page still says the PyPI release is pending"
    nested_and_array_nodes = [
        {"@type": "Article", "author": {"@type": "Person"}},
        {"@type": "SoftwareSourceCode"},
    ]
    assert [node.get("@type") for node in core.nodes(nested_and_array_nodes)] == [
        "Article",
        "Person",
        "SoftwareSourceCode",
    ]
    valid_llms_route = f"""## Choose a route
- **Engage** ({contracts.AUTHORITY_URLS['engage']}): Do not send taxpayer information or client files. This is not a tax advice or lodgment channel. A message does not create a professional engagement; scope, responsibilities and data handling must be agreed separately.
- **Adopt** ({contracts.AUTHORITY_URLS['adopt']}): supported installation.
- **Verify** ({contracts.AUTHORITY_URLS['verify']}): inspect evidence.
"""
    assert contracts.check_llms_authority_surface(valid_llms_route) == []
    invalid_llms_route = (
        "This site offers no accounting services and takes no engagements.\n"
        "## Choose a route\n- **Engage**: email Ryan.\n"
    )
    invalid_llms_failures = contracts.check_llms_authority_surface(invalid_llms_route)
    assert (
        "llms.txt: absolute no-engagement claim contradicts scoped enquiries"
        in invalid_llms_failures
    )
    assert "llms.txt: scoped authority route is incomplete" in invalid_llms_failures

    swapped_faq_html = (
        '<div class="faq">'
        "<h3>Question one?</h3><p>Answer one.</p>"
        "<h3>Question two?</h3><p>Answer two.</p>"
        "</div>"
    )
    swapped_faq = {
        "@type": "FAQPage",
        "mainEntity": [
            {
                "name": "Question one?",
                "acceptedAnswer": {"text": "Answer two."},
            },
            {
                "name": "Question two?",
                "acceptedAnswer": {"text": "Answer one."},
            },
        ],
    }
    swapped_faq_failures: list[str] = []
    core.check_faq_visible(swapped_faq, swapped_faq_html, "self-check", swapped_faq_failures)
    assert "self-check: FAQPage item 1 answer does not match the visible FAQ" in (
        swapped_faq_failures
    )
    assert "self-check: FAQPage item 2 answer does not match the visible FAQ" in (
        swapped_faq_failures
    )

    stale_date_page = (
        "<p>Published 25 August 2026. Last reviewed 25 August 2026.</p>"
        '<script type="application/ld+json">'
        '{"@context":"https://schema.org","@graph":['
        '{"@type":"TechArticle","datePublished":"2026-08-25","dateModified":"2026-08-25"},'
        '{"@type":"WebPage","datePublished":"2026-08-25","dateModified":"2026-08-25"},'
        '{"@type":"SoftwareApplication","dateModified":"2026-08-25"}'
        "]}</script>"
    )
    stale_date_failures = contracts.check_mcp_review_dates(stale_date_page)
    assert (
        f"{contracts.MCP_REL}: visible review date must be {contracts.MCP_VISIBLE_REVIEW_DATE}"
        in stale_date_failures
    )
    assert f"{contracts.MCP_REL}: TechArticle dateModified must be {contracts.MCP_REVIEW_DATE}" in (
        stale_date_failures
    )
    inaccurate_receipt_boundary = (
        '<p>Without a fund receipt date, a line can only be "at risk".</p>'
    )
    assert any(
        "must not say" in failure
        for failure in contracts.check_payday_receipt_boundary(inaccurate_receipt_boundary)
    )
    accurate_receipt_boundary = (
        "<p>Missing fund receipt evidence does not prove on-time. Remittance timing can "
        "prove late. A timely remittance without fund receipt evidence remains at-risk.</p>"
    )
    assert contracts.check_payday_receipt_boundary(accurate_receipt_boundary) == []
    accurate_item_list = {
        "@type": "ItemList",
        "numberOfItems": 2,
        "itemListElement": [
            {"@type": "ListItem", "position": 1},
            {"@type": "ListItem", "position": 2},
        ],
    }
    item_list_failures: list[str] = []
    core.check_item_lists(accurate_item_list, "self-check", item_list_failures)
    assert item_list_failures == []
    inaccurate_item_list = {
        "@type": "ItemList",
        "numberOfItems": 1,
        "itemListElement": [
            {"@type": "ListItem", "position": 1},
            {"@type": "ListItem", "position": 1},
        ],
    }
    core.check_item_lists(inaccurate_item_list, "self-check", item_list_failures)
    assert any("declares 1 items, but contains 2" in failure for failure in item_list_failures)
    assert any("positions are [1, 1]" in failure for failure in item_list_failures)
    boolean_item_list = {
        "@type": "ItemList",
        "numberOfItems": True,
        "itemListElement": [{"@type": "ListItem", "position": True}],
    }
    boolean_item_list_failures: list[str] = []
    core.check_item_lists(boolean_item_list, "self-check", boolean_item_list_failures)
    assert any(
        "numberOfItems must be an integer" in failure
        for failure in boolean_item_list_failures
    )
    assert any(
        "positions must be integers" in failure
        for failure in boolean_item_list_failures
    )
    float_item_list = {
        "@type": "ItemList",
        "numberOfItems": 1.0,
        "itemListElement": [{"@type": "ListItem", "position": 1.0}],
    }
    float_item_list_failures: list[str] = []
    core.check_item_lists(float_item_list, "self-check", float_item_list_failures)
    assert any(
        "numberOfItems must be an integer" in failure
        for failure in float_item_list_failures
    )
    assert any(
        "positions must be integers" in failure
        for failure in float_item_list_failures
    )

    with tempfile.TemporaryDirectory() as temp_dir:
        root = Path(temp_dir)
        about = root / "about"
        about.mkdir()
        (about / "index.html").write_text(
            "<p>I do not take client work through this site.</p>",
            encoding="utf-8",
        )
        failures = contracts.check_authority_surface(root)
        assert (
            "about/index.html: short answer contradicts scoped enquiries" in failures
        )

    with tempfile.TemporaryDirectory() as temp_dir:
        root = Path(temp_dir)
        evidence = root / "evidence"
        evidence.mkdir()
        (evidence / "index.html").write_text(
            '<p class="short-answer">Evidence summary.</p>'
            + "".join(
                f'<h2 id="{identifier}">{heading}</h2>'
                for identifier, heading in contracts.ASSURANCE_ANCHORS.items()
            ),
            encoding="utf-8",
        )
        failures = contracts.check_authority_surface(root)
        assert (
            "evidence/index.html: contents navigator does not match assurance headings"
            in failures
        )
        assert (
            "evidence/index.html: missing CA ANZ non-endorsement boundary" in failures
        )

    with tempfile.TemporaryDirectory() as temp_dir:
        root = Path(temp_dir)
        (root / "index.html").write_text(
            "<!-- <a href=\"/evidence/\">Evidence</a> -->"
            "<script><a href=\"/evidence/\">Evidence</a></script>"
            "<template><a href=\"/evidence/\">Evidence</a></template>",
            encoding="utf-8",
        )
        about = root / "about"
        about.mkdir()
        (about / "index.html").write_text(
            '<a href="/evidence/">Evidence</a>', encoding="utf-8"
        )
        evidence = root / "evidence"
        evidence.mkdir()
        (evidence / "index.html").write_text("", encoding="utf-8")
        (root / "sitemap.xml").write_text(
            f"<loc>{contracts.EVIDENCE_URL}</loc>", encoding="utf-8"
        )
        (root / "llms.txt").write_text(contracts.EVIDENCE_URL, encoding="utf-8")

        failures = contracts.check_evidence_page(root)
        assert "index.html: no visible link to /evidence/" in failures

    with tempfile.TemporaryDirectory() as temp_dir:
        root = Path(temp_dir)
        (root / "index.html").write_text(
            '<a href="#adopt">Adopt</a><a href="#verify">Verify</a>',
            encoding="utf-8",
        )
        failures = contracts.check_authority_surface(root)
        assert "index.html: missing visible authority route #engage" in failures
        assert "index.html: authority route #engage card label must be Engage" in (
            failures
        )
        assert "index.html: authority section #engage heading must be Engage" in (
            failures
        )

    with tempfile.TemporaryDirectory() as temp_dir:
        root = Path(temp_dir)
        (root / "index.html").write_text(
            '<a class="path-card" href="#engage"><strong>Adopt</strong></a>'
            '<a class="path-card" href="#adopt"><strong>Adopt</strong></a>'
            '<a class="path-card" href="#verify"><strong>Verify</strong></a>'
            '<section id="engage"><h2>Verify</h2></section>'
            '<section id="adopt"><h2>Adopt</h2></section>'
            '<section id="verify"><h2>Verify</h2></section>',
            encoding="utf-8",
        )
        failures = contracts.check_authority_surface(root)
        assert "index.html: authority route #engage card label must be Engage" in (
            failures
        )
        assert "index.html: authority section #engage heading must be Engage" in (
            failures
        )

    with tempfile.TemporaryDirectory() as temp_dir:
        root = Path(temp_dir)
        (root / "index.html").write_text(
            '<section id="adopt"><pre>'
            "claude mcp add aus-accounting -- uvx aus-accounting-mcp\n"
            "npx skills add ryanduguid/australian-accounting-skills"
            "</pre></section>"
            "<pre>codex mcp add aus-accounting -- uvx aus-accounting-mcp</pre>",
            encoding="utf-8",
        )
        failures = contracts.check_authority_surface(root)
        assert "index.html: install commands must appear only inside #adopt" in failures

    with tempfile.TemporaryDirectory() as temp_dir:
        root = Path(temp_dir)
        (root / "index.html").write_text(
            "<section id=\"adopt\">"
            "<pre>npx skills add ryanduguid/australian-accounting-skills</pre>"
            "</section>"
            "<pre>claude mcp add aus-accounting -- uvx aus-accounting-mcp</pre>"
            "<pre>claude mcp add aus-accounting -- uvx --from \\ "
            "git+https://github.com/ryanduguid/aus-accounting-mcp "
            "aus-accounting-mcp</pre>",
            encoding="utf-8",
        )
        failures = contracts.check_authority_surface(root)
        assert "index.html: install commands must appear only inside #adopt" in failures
        assert "index.html: retired GitHub-source install command" in failures

    with tempfile.TemporaryDirectory() as temp_dir:
        root = Path(temp_dir)
        (root / "index.html").write_text("", encoding="utf-8")
        (root / "llms.txt").write_text(
            "claude mcp add aus-accounting -- uvx --from "
            "git+https://github.com/ryanduguid/aus-accounting-mcp aus-accounting-mcp\n"
            "claude mcp add aus-accounting -- uvx aus-accounting-mcp",
            encoding="utf-8",
        )
        mcp_page = root / "tools" / "australian-tax-ai-agents"
        mcp_page.mkdir(parents=True)
        (mcp_page / "index.html").write_text(
            "<p>npx skills add ryanduguid/australian-accounting-skills</p>"
            "<p>claude mcp add aus-accounting -- uvx aus-accounting-mcp</p>"
            "<p>claude mcp add aus-accounting -- uvx --from "
            "git+https://github.com/ryanduguid/aus-accounting-mcp "
            "aus-accounting-mcp</p>",
            encoding="utf-8",
        )
        failures = contracts.check_authority_surface(root)
        assert (
            "llms.txt: supported install commands must link to /#adopt instead"
            in failures
        )
        assert "llms.txt: retired GitHub-source install command" in failures
        assert (
            f"{contracts.MCP_REL}: supported install commands must link to /#adopt instead"
            in failures
        )
        assert f"{contracts.MCP_REL}: retired GitHub-source install command" in failures

    with tempfile.TemporaryDirectory() as temp_dir:
        root = Path(temp_dir)
        mcp_page = root / "tools" / "australian-tax-ai-agents"
        mcp_page.mkdir(parents=True)
        (mcp_page / "index.html").write_text(
            "<p>Waiting for its first PyPI release.</p>", encoding="utf-8"
        )
        failures = contracts.check_authority_surface(root)
        assert (
            "tools/australian-tax-ai-agents/index.html: stale first-PyPI-release claim"
            in failures
        )
        (mcp_page / "index.html").write_text(
            '<script type="application/ld+json">'
            '{"@context":"https://schema.org","description":"first PyPI release"}'
            "</script>",
            encoding="utf-8",
        )
        failures = contracts.check_authority_surface(root)
        assert (
            "tools/australian-tax-ai-agents/index.html: stale first-PyPI-release claim"
            in failures
        )

    with tempfile.TemporaryDirectory() as temp_dir:
        root = Path(temp_dir)
        (root / "index.html").write_text(
            '<a hidden href="#engage">Engage</a>'
            '<a style="display: none" href="#adopt">Adopt</a>'
            '<a aria-hidden="true" href="#verify">Verify</a>'
            '<section id="engage" hidden>'
            '<a href="mailto:ryan@duguid.com.au?subject=Firm%20workflow%20or%20controlled%20pilot">Firm</a>'
            '<a href="mailto:ryan@duguid.com.au?subject=Tool%20adoption%20or%20integration">Adopt</a>'
            '<a href="mailto:ryan@duguid.com.au?subject=Research%2C%20speaking%20or%20peer%20review">Review</a>'
            "</section>"
            '<section id="adopt" style="display: none"><pre>'
            "claude mcp add aus-accounting -- uvx aus-accounting-mcp\n"
            "npx skills add ryanduguid/australian-accounting-skills"
            "</pre></section>"
            '<section id="verify" aria-hidden="true"></section>'
            '<h2 style="display: none">Tools for work that still needs checking</h2>'
            '<div class="tools-list"></div>',
            encoding="utf-8",
        )
        about = root / "about"
        about.mkdir()
        (about / "index.html").write_text(
            "<p style=\"visibility: hidden\">ryan@duguid.com.au. Do not email client files or tax advice. "
            "A message does not create a professional engagement.</p>",
            encoding="utf-8",
        )
        evidence = root / "evidence"
        evidence.mkdir()
        (evidence / "index.html").write_text(
            "".join(
                f"<h2 hidden>{heading}</h2>"
                for heading in contracts.ASSURANCE_HEADINGS
            ),
            encoding="utf-8",
        )
        mcp_page = root / "tools" / "australian-tax-ai-agents"
        mcp_page.mkdir(parents=True)
        (mcp_page / "index.html").write_text(
            f'<a aria-hidden="true" href="/evidence/">Evidence</a>'
            f'<a style="display: none" href="{contracts.AUS_ACCOUNTING_PYPI}">PyPI</a>',
            encoding="utf-8",
        )

        failures = contracts.check_authority_surface(root)
        assert "index.html: missing visible authority route #engage" in failures
        assert "index.html: missing visible authority route #adopt" in failures
        assert "index.html: missing visible authority route #verify" in failures
        assert "index.html: install commands must appear only inside #adopt" in failures
        assert (
            "index.html: missing visible catalogue label Tools for work that still needs checking"
            in failures
        )
        assert "about/index.html: enquiry boundary is incomplete" in failures
        assert "evidence/index.html: missing assurance heading" in failures
        assert "tools/australian-tax-ai-agents/index.html: no visible link to /evidence/" in failures
        assert "tools/australian-tax-ai-agents/index.html: no visible PyPI route" in failures

    with tempfile.TemporaryDirectory() as temp_dir:
        root = Path(temp_dir)
        (root / "index.html").write_text(
            "<section hidden><section></section>"
            '<section id="engage"><a href="#engage">Engage</a></section>'
            "</section>",
            encoding="utf-8",
        )
        failures = contracts.check_authority_surface(root)
        assert "index.html: missing visible authority route #engage" in failures

    with tempfile.TemporaryDirectory() as temp_dir:
        root = Path(temp_dir)
        (root / "index.html").write_text(
            "<h2>Tools for work that still needs checking</h2>"
            '<section class="tools-catalogue"></section>',
            encoding="utf-8",
        )
        failures = contracts.check_authority_surface(root)
        assert "index.html: missing visible lower tools catalogue" in failures

    required_retrieval_crawlers = {
        "Googlebot",
        "Bingbot",
        "OAI-SearchBot",
        "ChatGPT-User",
        "Claude-User",
        "Claude-Search",
        "Claude-SearchBot",
        "PerplexityBot",
        "Applebot",
    }
    required_training_crawlers = {
        "GPTBot",
        "ClaudeBot",
        "Google-Extended",
        "Applebot-Extended",
        "CCBot",
        "Bytespider",
    }
    assert required_retrieval_crawlers <= contracts.RETRIEVAL_CRAWLERS
    assert required_training_crawlers <= contracts.TRAINING_CRAWLERS
    assert f"{contracts.SITE}/llms.txt" in core.sitemap_urls()

    about_html = (core.ROOT / "about" / "index.html").read_text(encoding="utf-8")
    json_failures: list[str] = []
    about_blocks = core.json_ld_blocks(
        about_html,
        "about/index.html",
        json_failures,
    )
    assert json_failures == []
    about_nodes = [node for block in about_blocks for node in core.nodes(block)]
    people = [node for node in about_nodes if core.has_type(node, "Person")]
    assert len(people) == 1
    person = people[0]
    assert person["name"] == "Ryan Duguid"
    assert person["jobTitle"] == "Accountant"
    assert person["email"] == "ryan@duguid.com.au"
    assert person["url"] == f"{contracts.SITE}/about/"
    assert person["address"] == {
        "@type": "PostalAddress",
        "addressLocality": "Newcastle",
        "addressRegion": "NSW",
        "addressCountry": "AU",
    }
    assert person["sameAs"] == contracts.PERSON_SAME_AS

    missing_email = json.loads(json.dumps(person))
    missing_email.pop("email")
    expect_failure(
        contracts.check_canonical_person(missing_email),
        "person graph: Person email is None, expected 'ryan@duguid.com.au'",
    )
    wrong_region = json.loads(json.dumps(person))
    wrong_region["address"]["addressRegion"] = "WA"
    expect_failure(
        contracts.check_canonical_person(wrong_region),
        "person graph: Person address must identify Newcastle, NSW, AU",
    )
    wrong_linkedin = json.loads(json.dumps(person))
    wrong_linkedin["sameAs"][1] = "https://www.linkedin.com/in/ryanduguid"
    expect_failure(
        contracts.check_canonical_person(wrong_linkedin),
        "person graph: Person sameAs must contain only the GitHub user and "
        "LinkedIn URLs in the required order",
    )

    graph_failures: list[str] = []
    graph_nodes = core.indexed_nodes(
        core.html_files(),
        graph_failures,
        contracts.NOT_INDEXED,
    )
    assert graph_failures == []
    software_names = {
        node["name"]
        for _, node in graph_nodes
        if core.has_type(node, "SoftwareSourceCode")
    }
    assert software_names == {
        "payday-super-checker",
        "xero-trial-balance-export",
        "Ozzit",
        "accounting-excel-toolkit",
        "aus-accounting-mcp",
        "australian-accounting-skills",
        "workpaper-review-gate",
        "australian-accounting-power-bi",
        "monthly-close-controls",
        "au-tax-legislation-corpus",
    }
    assert not missing_negative_failures, (
        "late negative self-check fixtures did not emit their required messages:\n  "
        + "\n  ".join(missing_negative_failures)
    )
    print("self-check OK")


if __name__ == "__main__":
    self_check()
