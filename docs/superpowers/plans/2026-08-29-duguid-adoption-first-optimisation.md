# Adoption-first Site Optimisation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make duguid.com.au a shorter, tool-led adoption catalogue with direct collection routes, clearer Coal LSL calculator behaviour, complete contextual share metadata and no regression in evidence, accessibility or performance.

**Architecture:** Keep the existing dependency-free static site: hand-authored HTML, shared CSS, inline page JavaScript, Python source contracts and the current Playwright/Lighthouse development toolchain. Add three static collection pages and one development-only social-card renderer backed by one SVG template and one JSON data file. Reuse the existing contract modules and test commands; do not introduce a component system, generator, framework, client-side catalogue logic or public runtime dependency.

**Tech Stack:** HTML5, CSS, browser-native JavaScript and ES modules, Python 3 source contracts, Node.js 22, Playwright 1.62.1, axe-core and Lighthouse CI.

**Spec:** [Approved adoption-first optimisation design](../specs/2026-08-29-duguid-adoption-first-optimisation-design.md)

## Global constraints

- Use Australian English in original prose and preserve exact official names, code identifiers, URLs and statutory wording.
- Keep the site about the tools. Add no portrait, stock image, generated illustration, testimonial, analytics, contact form or client-data input.
- Keep every current child URL and the compatibility redirect at `/tools/review-ready-gate/`.
- Keep `assets/levy.mjs` byte-identical and preserve rate facts, source claims, identity facts, disclaimers and human-review boundaries.
- Do not change DNS, hosting, Search Console, Bing, repository settings or pull requests 40 and 44. Do not push, publish, merge or deploy.
- Add no runtime dependency and no build step for public pages. The social-card renderer is development-only and uses the existing Playwright dependency.
- Extend `scripts/site_contracts.py`, `scripts/seo_core.py`, `scripts/check_design.py` and their current tests instead of creating a parallel validation framework.
- Update `scripts/design_baseline.json` only for approved HTML, JSON-LD, `llms.txt` and sitemap changes. Preserve rate facts and content/source links; narrow the baseline helper to exclude the deliberately changed breadcrumb before recalculating those three digests. Do not refresh fonts, calculator arithmetic or disclaimer entries.
- Keep `GATES.md` as the local Unlazy acceptance ledger; do not commit its machine-specific evidence.
- Do not use subagents unless Ryan explicitly selects that execution mode. Inline execution with `superpowers:executing-plans` is the default under the repository working agreement.

## Ponytail decisions

- Hand-author the three hubs and mechanically update the repeated shell. Twenty-two pages do not justify a generator migration.
- Use ruled register rows already supported by the design system. Do not add cards, filters, search, tabs or client-side catalogue state.
- Use one SVG template, one small JSON file and one renderer script for the five required social contexts. Do not add an image library or general asset pipeline.
- Keep calculator changes in the existing page script and shared stylesheet. Use `window.print()`, `@media print`, the current Blob export and the current in-memory table.
- Tighten only the three out-of-range descriptions; retain suitable descriptions rather than rewriting for uniformity.
- Treat repository-wide checks as integration gates. Add focused assertions only where they directly protect a requested outcome.

## Depth tree and acceptance ledger

```text
Adoption-first site optimisation
├── Discovery
│   ├── Tools, Evaluations and Rates hubs
│   ├── exact primary navigation and current states
│   └── real breadcrumbs, sitemap and llms.txt coverage
├── Presentation
│   ├── shorter adoption-led homepage
│   ├── concise About and Evidence openings
│   └── early review dates and responsive register rows
├── Calculator
│   ├── explicit blank-as-zero policy
│   ├── persistent accessible help and zero explanation
│   └── print, privacy-safe employee references and CSV wording
├── Sharing
│   ├── five reproducible contextual PNGs
│   ├── complete metadata on 22 indexable pages
│   └── provenance, dimensions, byte caps and checksums
└── Integration
    ├── source and mutation contracts
    ├── capture, browser and visual checks
    ├── Lighthouse budgets
    └── manual desktop, mobile and print review
```

The local `GATES.md` ledger has seven gates:

- G0 lints the ledger itself.
- G1 runs `python scripts/check_site.py`.
- G2 runs `npm run test:capture` for the protected Coal proof and generated social cards.
- G3 runs `npm run test:browser` for accessibility, responsiveness and interaction.
- G4 runs `npm run test:lighthouse` for the existing category and metric budgets.
- G5 runs `git diff --check`.
- G6 records the manual desktop, mobile and print review, including the no-portrait check.

Before executing a gate, inspect every command and referenced script, then run the Unlazy checker with explicit approval. Re-run all runnable gates with `--reverify` after their dependencies change.

## Baseline evidence

The approved starting point is commit `63d009065b8c6f1a0e8319524410f2713f6e55c6`. Before implementation, the existing homepage measured:

- 9,512 CSS px high at a 390×844 viewport, with `scrollWidth === clientWidth === 390`.
- 7,611 CSS px high at a 1440×900 viewport, with `scrollWidth === clientWidth === 1440`.

The finished homepage must be strictly shorter at both viewports. These are upper bounds, not pixel-perfect layout targets.

## Task 1: Add the collection information architecture

**Files:**

- Modify: `scripts/site_contracts.py`
- Modify: `scripts/seo_core.py`
- Modify: `scripts/test_contracts.py`
- Modify: `scripts/check_design.py`
- Create: `tools/index.html`
- Create: `evaluate/index.html`
- Create: `rates/index.html`
- Modify: `index.html`, `about/index.html`, `evidence/index.html`, `404.html`
- Modify: every canonical child `index.html` below `tools/`, `evaluate/` and `rates/`
- Modify: `assets/site.css`
- Modify: `sitemap.xml`
- Modify: `llms.txt`
- Modify intentionally: `scripts/design_baseline.json`

### Step 1: Write failing source contracts

Replace `PRIMARY_NAV_LINKS` with the exact approved five-item order and add small declarative constants for the three hubs and their visible entries. Add focused checks for:

```python
PRIMARY_NAV_LINKS = [
    ("/tools/", "Tools"),
    ("/rates/", "Rates"),
    ("/evidence/", "Evidence"),
    ("/about/", "About"),
    ("/#engage", "Contact"),
]

COLLECTION_COUNTS = {
    "tools/index.html": 10,
    "evaluate/index.html": 3,
    "rates/index.html": 3,
}
```

Assert that each hub has one H1, visible entries in the expected order, one `ItemList` with matching positions/counts, and the existing Person graph reference. Assert shell current-state semantics from the page path: `page` on the exact hub or standalone page, `location` on a parent collection, and no current state on Contact.

Add mutation cases that remove a hub entry, reverse the primary nav, change a child parent from `location` to `page`, point a visible breadcrumb back to Home and desynchronise an `ItemList` position. Remove only obsolete mutation cases that protect the old sticky Engage/Adopt/Verify route rail.

In `seo_core.check_sitemap`, separate the expected canonical HTML set from llms discovery:

```python
expected_html = {
    site_url(path.relative_to(ROOT).as_posix(), site)
    for path in paths
    if path.relative_to(ROOT).as_posix() not in not_indexed
}
expected_llms = expected_html | {f"{site}/llms.txt"}
```

Require `sitemap.xml` to equal `expected_html` and require `llms.txt` to link every URL in `expected_llms`. Add negative mutations proving an absent hub and a re-added sitemap `llms.txt` URL both fail.

### Step 2: Confirm RED

Run:

```powershell
python scripts/test_contracts.py
```

Expected: non-zero with failures for missing `/tools/`, `/evaluate/`, `/rates/`, the old nav order, old breadcrumbs and sitemap mismatch. If it passes, the new contract is not observing the requested architecture.

### Step 3: Implement the three static hubs

Build each hub from the existing article shell and ruled register styles:

- `/tools/`: Extract, Calculate, Control and Inspect anchors; exactly ten visible tool rows; task, delivery type, guide, repository, evaluation when present, and human/data boundary. Preserve the current useful grouping: Xero trial balance, Subcontractor ledgers and WIP under Extract; Payday Super, ATO Benchmarks, Coal LSL, Trust Distributions and Company Tax/Franking under Calculate; Workpaper Review Gate under Control; Australian tax AI agents under Inspect.
- `/evaluate/`: exactly three reproducible packs with fabricated input, expected result, fixed release, limitation and reproduction link.
- `/rates/`: exactly three reference rows with current value/scope, verified date, primary source, HTML route and CSV link where one already exists.

Give each hub `WebPage`, `BreadcrumbList` and `ItemList` nodes within the existing Person graph pattern. Keep text and JSON-LD order identical.

### Step 4: Update shell, breadcrumbs and discovery files

Mechanically apply the exact five-link nav to all styled pages. Move GitHub, Awesome List, Evaluations and the machine index to the secondary footer group. Use:

- `aria-current="page"` for the exact current page;
- `aria-current="location"` for Tools on tool/evaluation children and Rates on rate children;
- no current attribute on Contact.

Change visible and JSON-LD breadcrumbs to:

- `Home / Tools / child` for canonical tool pages;
- `Home / Tools / Evaluations / child` for evaluation pages;
- `Home / Rates / child` for rate pages.

Do not change the noindex compatibility redirect. Add the three hubs to `llms.txt`; make the sitemap contain exactly the 22 canonical HTML URLs and no `llms.txt` entry. Preserve robots policy. Use 29 August 2026 for the three new hubs and the substantially revised homepage/About/Evidence entries; retain existing child last-modified dates where only shell or metadata changes.

### Step 5: Update only intentional design baselines

Before recalculating rate baselines, make `main_visible_digest` and `main_link_targets` omit only the accessible breadcrumb nav. Add a mutation proving that a changed rate value and a changed ATO/legislation source still fail. Then use the existing `normalised_text_digest` and `json_ld_digests` helpers to calculate new values for the approved `llms.txt`, sitemap and changed page graphs. Recalculate the three rate text/link digests under the narrowed breadcrumb-free rule, compare the remaining visible copy and content-link lists to the old pages, and patch only those intentional entries. Reject any font, calculator or protected-disclaimer change.

### Step 6: Confirm GREEN and commit

Run:

```powershell
python scripts/test_contracts.py
python scripts/check_design.py
git diff --check
```

Expected: all commands exit 0; output includes `contract tests passed` and `design contracts passed`.

Commit:

```powershell
git add scripts tools/index.html evaluate/index.html rates/index.html index.html about evidence 404.html assets/site.css sitemap.xml llms.txt
git commit -m "feat: add adoption-first collection routes"
```

## Task 2: Refocus and shorten the homepage and page openings

**Files:**

- Modify: `scripts/site_contracts.py`
- Modify: `scripts/check_design.py`
- Modify: `scripts/test_contracts.py`
- Modify: `tests/browser/site-quality.spec.mjs`
- Modify: `index.html`
- Modify: `about/index.html`
- Modify: `evidence/index.html`
- Modify: canonical child pages below `tools/` and `evaluate/`
- Modify: `assets/site.css`
- Modify intentionally: `scripts/design_baseline.json`
- Update after review: `tests/browser/site-quality.spec.mjs-snapshots/homepage-*.png`

### Step 1: Replace old homepage contracts with adoption contracts

Set the exact H1/support text and ordered actions as constants. Require one visible category preview with Extract, Calculate, Control and Inspect in that order, each linking to its matching `/tools/#...` anchor. Require the Coal proof after the preview, then `#adopt`, `#verify` and `#engage` to remain unique valid anchors.

Keep contract mutations for the trust tuple, proof source links, lazy loading, explicit dimensions and descriptive alternative. Replace the old equal-weight route-register, sticky rail and full catalogue assertions with mutations for the new ordered actions, four-category preview and retained anchors.

Add browser assertions:

```javascript
const homeHeightBaseline = {
  'mobile-chromium': 9512,
  'desktop-chromium': 7611,
};

expect(await page.evaluate(() => document.documentElement.scrollHeight))
  .toBeLessThan(homeHeightBaseline[testInfo.project.name]);
```

Test the exact H1, `Browse the tools` before `Discuss a workflow`, proof position after the preview, zero document overflow at 320, 390, 768 and 1440, and the absence of viewport-based route minimum heights. Keep existing proof decode/size checks.

### Step 2: Confirm RED

Run:

```powershell
python scripts/test_contracts.py
npm run test:browser -- --grep "home"
```

Expected: failures name the old heading/actions and the current heights exceed the new layout expectation.

### Step 3: Implement the approved content sequence

Replace the lead with:

```text
Review-ready controls for Australian accounting work.

Open-source checks for payroll, Xero, workpapers and AI workflows, with every source and calculation kept visible.
```

Place `Browse the tools` first and `Discuss a workflow` second. Keep the exact trust boundary immediately after the lead. Replace the ten-item homepage catalogue with four short category previews: Xero trial balance represents Extract, Coal LSL represents Calculate, Workpaper Review Gate represents Control, and Australian tax AI agents represents Inspect. Each category links to its corresponding `/tools/#...-tools` anchor; the complete list remains on `/tools/`. Keep the real Coal LSL proof and its current source/evidence links. Make Adopt, Verify and Engage content-sized records while preserving their IDs.

Remove the CSS that creates full-viewport route sections and sticky route labels. Reuse existing rules, type scale and spacing tokens for the shorter layout; add only selectors needed by the four-row preview and action order.

### Step 4: Shorten About and Evidence without deleting substance

Use the exact approved About opening:

```text
I build open-source controls for Australian tax, payroll, ledgers and workpapers. They show sources and working, use fabricated examples, and leave judgement and lodgement with a person.
```

Use the Evidence H1 `Evidence behind the tools` and opening:

```text
This register links public claims to identity records, releases, primary source reviews, repository controls and reproducible tests. It supports limited claims about the software. It does not turn an output into advice, approval, a compliance decision or a lodgment.
```

Keep every downstream identity, credential, evidence, limitation, source and authorship record.

Move each existing Published/Last reviewed line on tool and evaluation pages into the article header without changing its text. Rate verified lines stay as they are.

### Step 5: Review and accept intentional visual changes

Run the focused browser suite without snapshot updates first. Inspect both current failure images. Then update only the two homepage baselines:

```powershell
npm run test:browser:update -- --grep "home matches"
```

Open both resulting PNGs and confirm the hierarchy, proof legibility, no portrait and no clipped content before accepting them.

### Step 6: Confirm GREEN and commit

Run:

```powershell
python scripts/check_site.py
npm run test:browser -- --grep "home|healthy, accessible page shell"
git diff --check
```

Expected: source checks pass; browser checks pass on desktop and mobile; both measured homepage heights are below their recorded baselines.

Commit:

```powershell
git add index.html about/index.html evidence/index.html tools evaluate assets/site.css scripts tests/browser/site-quality.spec.mjs*
git commit -m "feat: refocus the site on tool adoption"
```

## Task 3: Clarify the Coal LSL calculator workflow

**Files:**

- Modify: `scripts/site_contracts.py`
- Modify: `scripts/test_contracts.py`
- Modify: `tests/browser/calculator.spec.mjs`
- Modify: `tools/coal-lsl-levy/index.html`
- Modify: `assets/site.css`
- Update after review: `tests/browser/calculator.spec.mjs-snapshots/calculator-formula-b-result-mobile.png`
- Must not modify: `assets/levy.mjs`, `assets/levy-form.mjs`, `scripts/levy.test.mjs`

### Step 1: Add failing source and browser tests

Extend the calculator contract to require:

- one form-level blank-as-zero note;
- every monetary control's `aria-describedby` to retain both common and field-specific help;
- unique help IDs in bonus and branch templates;
- required reporting month for the casual branch;
- result actions ordered `Print working`, then `Add to monthly table`;
- visible `Employee reference`, `EMP-001`, the direct-identifier warning and `Download CSV`.

Add Playwright tests that:

1. submit the default branch with every amount blank and assert `$0.00` plus the explicit blank-as-zero explanation;
2. switch branches/add a bonus row and verify every visible monetary input resolves each `aria-describedby` token to an element;
3. select Casual without a month and assert focus, `aria-invalid` and associated alert on Reporting month;
4. stub `window.print`, calculate, click Print working and confirm the stub was called;
5. emulate print media and assert branch, inputs, formula, eligible wages, levy, review date and boundary are visible while nav, buttons and employee reference/table are hidden;
6. add `EMP-001`, assert the row is added and download the CSV with the existing hardened content.

### Step 2: Confirm RED

Run:

```powershell
python scripts/test_contracts.py
npm run test:browser -- tests/browser/calculator.spec.mjs
```

Expected: failures for missing blank policy, print action, privacy wording, zero explanation and renamed CSV action. Existing Formula B calculation assertions must still pass.

### Step 3: Implement the smallest page-only change

Add one common help paragraph and reference its ID from all static and dynamic monetary fields alongside their existing field help. Update the current described-by token helpers rather than adding a second help-management layer.

When the existing computed eligible wages are zero and all monetary strings were blank, append an explanatory sentence to the current result ledger. Do not change how blank strings become zero or how any formula is calculated.

After a successful calculation, reveal the two ordered actions. `Print working` calls `window.print()`. Use `@media print` to show the existing form/result content and hide navigation, buttons, employee input/table and other non-working content. Do not create a PDF library or print-specific JavaScript model.

Keep IDs `employeeLabel`, `add-employee` and `export-csv`; change visible copy only. Keep Blob generation, formula-injection hardening and aggregate-from-total-wages behaviour unchanged.

### Step 4: Prove protected arithmetic stayed unchanged

Run:

```powershell
git diff --exit-code 63d009065b8c6f1a0e8319524410f2713f6e55c6 -- assets/levy.mjs assets/levy-form.mjs scripts/levy.test.mjs
python scripts/check_site.py
npm run test:browser -- tests/browser/calculator.spec.mjs
```

Expected: the protected-file diff is empty; 21 levy tests still pass; all calculator browser tests pass.

Inspect the mobile result snapshot failure, update that one snapshot only if the intentional action/wording change reaches it, and review the PNG before staging.

### Step 5: Commit

```powershell
git add tools/coal-lsl-levy/index.html assets/site.css scripts/site_contracts.py scripts/test_contracts.py tests/browser/calculator.spec.mjs*
git commit -m "feat: clarify Coal LSL calculator handling"
```

## Task 4: Add five reproducible social-card contexts

**Files:**

- Create: `assets/social-card-template.svg`
- Create: `assets/social-cards.json`
- Create: `assets/social-card-site.png`
- Create: `assets/social-card-tools.png`
- Create: `assets/social-card-evaluations.png`
- Create: `assets/social-card-rates.png`
- Create: `assets/social-card-evidence.png`
- Create: `scripts/render-social-cards.mjs`
- Create: `scripts/capture-social-cards.spec.mjs`
- Modify: `playwright.capture.config.mjs`
- Modify: `scripts/site_contracts.py`
- Modify: `scripts/test_contracts.py`
- Modify: `README.md`
- Retain temporarily: `assets/og-card.png` until Task 5 replaces every reference

### Step 1: Write failing asset contracts

Port only the useful OLED geometry, source/provenance checks and register-card concept from PR 44 commit `89e1b9d`; do not merge or modify that branch.

In the existing Python contracts, require the five exact card IDs and mappings. Parse PNG headers without adding Pillow to runtime checks. Require 1200×630, PNG signature, less than 50,000 bytes, an editable template, valid data, OLED colours, visible context copy and matching SHA-256 values in README. Add mutations for wrong dimensions, over-budget bytes, stale context copy and stale checksum.

Add a capture spec that renders all five cards twice into separate temporary directories, asserts both outputs are byte-identical, and asserts each output equals the committed PNG. Use cleanup in `finally`; never write test output over the committed assets.

### Step 2: Confirm RED

Run:

```powershell
python scripts/test_contracts.py
npm run test:capture
```

Expected: source contracts fail because the five assets/sources are absent; capture fails because the renderer/spec is not implemented.

### Step 3: Implement one narrow renderer

Create one 1200×630 SVG template using PR 44's true-black field, light rules, green accent and self-hosted IBM Plex fonts. Put only context-specific label, heading lines, host, output filename and alt text in `assets/social-cards.json`.

Use these five truthful contexts, with line breaks adjusted only to fit the fixed template:

| ID | Label | Heading |
|---|---|---|
| `site` | Public register / Australian accounting controls | Review-ready controls for Australian accounting work. |
| `tools` | Open-source tools | Accounting checks that show their working. |
| `evaluations` | Reproducible evaluations | Fabricated inputs. Expected results. Visible limits. |
| `rates` | Maintained reference tables | Australian rates, sources and review dates. |
| `evidence` | Evidence register | Claims linked to sources, releases and tests. |

Each alt value must identify the OLED register card and repeat its visible heading without mentioning a person or portrait.

The renderer should:

1. read and validate the five fixed records;
2. XML-escape inserted copy;
3. embed the existing local font bytes for deterministic loading;
4. render with the existing Playwright Chromium at device scale 1;
5. wait for `document.fonts.ready`;
6. write all candidate PNGs to a temporary directory;
7. validate signature, dimensions and byte cap before copying any candidate to the requested destination; and
8. exit non-zero without touching committed PNGs if rendering or validation fails.

Expose a small imported function for the capture spec and a direct CLI for intentional regeneration. Do not add a general templating layer, image dependency or public script.

### Step 4: Generate, inspect and document

Render the five committed PNGs. Open each and confirm readable copy, no portrait, correct context and no clipped glyphs. Record each checksum, source, MIT licence, pinned Playwright/Chromium method and refresh trigger in the README provenance table. Credit the design concept port from PR 44 without claiming that PR was merged.

### Step 5: Confirm GREEN and commit

Run:

```powershell
python scripts/test_contracts.py
npm run test:capture
git diff --check
```

Expected: source asset contracts pass and capture reports all card outputs reproducible alongside the unchanged Coal proof.

Commit:

```powershell
git add assets/social-card-* assets/social-cards.json scripts/render-social-cards.mjs scripts/capture-social-cards.spec.mjs playwright.capture.config.mjs scripts/site_contracts.py scripts/test_contracts.py README.md
git commit -m "feat: add contextual social register cards"
```

## Task 5: Complete metadata on every indexable page

**Files:**

- Modify: `scripts/seo_core.py`
- Modify: `scripts/site_contracts.py`
- Modify: `scripts/test_contracts.py`
- Modify: all 22 canonical HTML pages
- Modify: `404.html` and the noindex compatibility redirect for the referrer policy where applicable
- Modify intentionally: `scripts/design_baseline.json`
- Remove after all references change: `assets/og-card.png`

### Step 1: Strengthen generic metadata checks

For every indexable page, require exactly one non-empty value for:

```python
OPEN_GRAPH_FIELDS = (
    "og:title", "og:description", "og:type", "og:url", "og:image",
    "og:image:type", "og:image:alt", "og:image:width", "og:image:height",
)
TWITTER_FIELDS = (
    "twitter:card", "twitter:title", "twitter:description",
    "twitter:image", "twitter:image:alt",
)
```

Require Twitter title/description to mirror the page's Open Graph title/description, and require the Open Graph description to mirror the canonical meta description. Retain an existing shorter Open Graph title when it is page-specific and truthful. Require `summary_large_image`, `image/png`, width 1200, height 630, the approved card mapping and a truthful context alt. Require one `strict-origin-when-cross-origin` referrer meta on every styled HTML page.

Add negative mutations for each metadata family, a mismatched canonical/OG URL, wrong card context and absent referrer policy. Keep the existing description floor/ceiling and add explicit 120–155 character assertions only for Payday Super, Australian tax AI agents and Coal LSL.

### Step 2: Confirm RED

Run:

```powershell
python scripts/test_contracts.py
python scripts/check_seo.py
```

Expected: failures enumerate the existing missing Open Graph/Twitter fields, old image mapping and missing referrer policies.

### Step 3: Apply the fixed five-card mapping

- Homepage and About: site card.
- `/tools/` and canonical tool children: tools card.
- `/evaluate/` and evaluation children: evaluations card.
- `/rates/` and rate children: rates card.
- Evidence: evidence card.

Keep every page title and description page-specific. Add the full metadata set in a consistent head order. Tighten only the three named long descriptions into the 120–155 range and reuse each in Open Graph/Twitter metadata.

### Step 4: Confirm GREEN and commit

Run:

```powershell
python scripts/check_site.py
git diff --check
```

Expected: 22 canonical HTML URLs are checked; no metadata warning remains for the three tightened descriptions; links and schema still pass.

Commit:

```powershell
git add index.html about evidence tools evaluate rates 404.html scripts/seo_core.py scripts/site_contracts.py scripts/test_contracts.py scripts/design_baseline.json
git add -u assets/og-card.png
git commit -m "feat: complete contextual share metadata"
```

## Task 6: Extend browser and Lighthouse integration coverage

**Files:**

- Modify: `tests/browser/site-quality.spec.mjs`
- Modify: `lighthouserc.cjs`
- Modify: `scripts/lighthouse-config.test.cjs`
- Modify: `README.md`
- Modify: `DESIGN.md`

### Step 1: Add the hubs to browser coverage

Add `/tools/`, `/evaluate/` and `/rates/` to the healthy accessible route matrix. Replace obsolete route-register tests with assertions for:

- exact navigation order;
- exact `page`/`location` current states on a hub, child tool, evaluation and rate;
- focused mobile nav links scrolling fully into view;
- all four homepage preview links landing on valid Tools anchors;
- no document overflow at 320, 390, 768 and 1440;
- homepage height below both recorded baselines.

Keep serious/critical axe checks, one H1, one `main#main`, page health and existing proof checks.

### Step 2: Add Tools to Lighthouse and test the configuration

Add `http://127.0.0.1:4173/tools/` to the current homepage, Evidence and Coal LSL URL list. Extend `scripts/lighthouse-config.test.cjs` to assert the exact four URLs and three runs while preserving the current sandbox tests and thresholds.

Confirm RED before editing `lighthouserc.cjs`:

```powershell
npm run test:lighthouse
```

Expected: the new configuration test fails because `/tools/` is absent. Then add the URL and rerun.

### Step 3: Update durable documentation only

Update README/DESIGN to describe the three collection routes, five social contexts, development-only renderer, no public runtime dependency, no portrait and the revised test surface. Do not add future roadmap abstractions.

### Step 4: Run integration checks and commit

Run:

```powershell
npm run test:browser
npm run test:lighthouse
git diff --check
```

Expected: all desktop/mobile browser projects pass; Lighthouse retains performance ≥0.95, accessibility/best-practices/SEO =1, CLS ≤0.01, LCP ≤2,500 ms and TBT ≤200 ms for all four URLs.

Commit:

```powershell
git add tests/browser/site-quality.spec.mjs lighthouserc.cjs scripts/lighthouse-config.test.cjs README.md DESIGN.md
git commit -m "test: cover the adoption path end to end"
```

## Task 7: Re-verify the whole delivery through Unlazy

**Files:**

- Modify locally as evidence is recorded: `GATES.md`
- Inspect only: all changed files and committed snapshots/assets
- Update if a test exposes a defect: only the owning task's files

### Step 1: Self-review before executing gates

Inspect:

```powershell
git status --short
git diff 63d009065b8c6f1a0e8319524410f2713f6e55c6 --stat
git diff 63d009065b8c6f1a0e8319524410f2713f6e55c6 -- assets/levy.mjs assets/levy-form.mjs scripts/levy.test.mjs rates robots.txt
rg -n "TODO|FIXME|placeholder|lorem|portrait|headshot" --glob "!GATES.md" --glob "!docs/superpowers/**"
```

Expected: scope matches this plan; protected calculator files, rate facts and robots are unchanged; no placeholder or portrait content exists.

Review all 22 canonical pages for spec coverage and check type/signature consistency between the social-card JSON, renderer export and capture import.

### Step 2: Parse, inspect and approve the ledger

Run status first without executing:

```powershell
node "C:\Users\-\.agents\skills\unlazy\scripts\gate-check.mjs" --status GATES.md
node "C:\Users\-\.agents\skills\unlazy\scripts\gate-lint.mjs" GATES.md
```

Read every resolved `CHECK`, `EXPECT`, `CWD` and referenced script. Then explicitly approve and execute the runnable gates:

```powershell
node "C:\Users\-\.agents\skills\unlazy\scripts\gate-check.mjs" --approve GATES.md
```

If any gate fails, fix the owning slice, inspect the changed oracle dependencies and rerun with `--reverify` rather than marking evidence manually.

### Step 3: Complete the manual G6 review

Serve the site locally and inspect:

- homepage, Tools, Evaluations, Rates, Evidence, About and Coal calculator at 390×844 and 1440×900;
- the mobile nav at 320 px and 200 per cent browser zoom;
- forced-colours mode;
- the calculator print preview with a populated result;
- all five social PNGs and the changed homepage/calculator snapshots.

Record concise non-sensitive evidence in G6 only after confirming the tool-led hierarchy, readable rules/type, no clipping, no portrait and no direct identifier in the default print view. Do not claim a manual screen-reader session unless one was actually performed.

### Step 4: Reverify and inspect the final state

```powershell
node "C:\Users\-\.agents\skills\unlazy\scripts\gate-check.mjs" --reverify GATES.md
git status --short --branch
git log --oneline 63d009065b8c6f1a0e8319524410f2713f6e55c6..HEAD
```

Expected: `ALL MET`; only local `GATES.md` evidence may remain untracked/modified; implementation commits are present; no remote action has occurred.

## Final handoff requirements

Report:

- the delivered adoption, navigation, calculator and metadata outcomes;
- the exact homepage before/after heights;
- all five card byte sizes and checksums;
- the results of every Unlazy gate and repository check;
- every intentional baseline/snapshot update;
- confirmation that protected calculator arithmetic, rate facts, robots and remote systems were unchanged;
- manual checks actually performed; and
- manual screen-reader testing as unverified unless it occurred.

Do not call the work deployed or live. The release boundary remains local until Ryan separately authorises a push, pull request, merge or deployment.
