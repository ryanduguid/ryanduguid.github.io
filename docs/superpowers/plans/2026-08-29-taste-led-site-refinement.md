# Taste-led Site Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine duguid.com.au's existing OLED accounting-register interface so its routes, calculator results, proof artefact and mobile catalogue are easier to inspect without changing protected facts or behaviour.

**Architecture:** Keep the dependency-free static HTML and semantic-token CSS architecture. Implement four independently reviewable slices: calculator orientation/result ledger, homepage hierarchy/navigation, deterministic proof capture, then documentation and whole-site verification. Browser fixtures and source contracts define the visual seams before production markup changes.

**Tech Stack:** Static HTML, native CSS, browser JavaScript modules, Python standard-library contract checks, Node.js 22, Playwright 1.62.1, Axe 4.13.0 and Lighthouse CI 0.15.1.

**Spec:** `docs/superpowers/specs/2026-08-29-taste-led-site-refinement-design.md`

## Global Constraints

- Work in the existing linked worktree on branch `codex/duguid-site-agent-tooling`; do not create another worktree.
- Keep public pages dependency-free and add no runtime, icon, animation or CSS-framework package.
- Preserve `llms.txt`, `robots.txt`, `sitemap.xml`, `google03d2012cc1791991.html`, JSON-LD semantics, published facts, disclaimer counts and all route/canonical/navigation labels.
- Do not change `assets/levy.mjs` or any calculator arithmetic.
- Use only the fixed fabricated Formula B fixture: base pay 6000, overtime 3000, allowances 500, salary sacrifice 0 and no bonuses.
- Keep the OLED dark-only canvas, IBM Plex families, stamp green accent, square register surfaces, 2px control radius and motion intensity 2.
- Visible revised copy uses Australian English, contains no emoji, em dash or en dash, and introduces no invented credential, rate, outcome or endorsement.
- Keep route anchors `#engage`, `#adopt`, `#verify` and all ten tool entries in ordinary document flow.
- Keep browser traces, reports and temporary captures under ignored `work/` paths. Never save a browser profile, storage state, cookies or credentials.
- Add a failing focused test before every production change.
- Stage named files only. Never stage or commit the untracked `GATES.md`.
- Do not push, publish, deploy, open a pull request, merge or change an external account.

## File map

- Create `scripts/coal-lsl-proof-fixture.mjs`: one pure shared object containing the deterministic proof inputs, expectations and capture dimensions.
- Create `scripts/capture-coal-lsl-proof.mjs`: loopback-only browser capture and WebP encoder.
- Create `scripts/capture-coal-lsl-proof.test.mjs`: integration test that captures to an OS temporary directory.
- Modify `tools/coal-lsl-levy/index.html`: compact method register and result-row metadata; calculator engine calls remain unchanged.
- Modify `index.html`: one hero route register, separate trust band, catalogue index, reduced ordinal labels and refreshed proof dimensions.
- Modify `assets/tokens.css`: refine only the existing display scale.
- Modify `assets/site.css`: calculator ledger, hero/trust/register, route no-wrap, catalogue index, principles composition and mobile navigation.
- Modify `scripts/check_design.py`: permanent homepage and proof-delivery contracts.
- Modify `scripts/test_check_design.py`: mutation coverage for the new contracts.
- Modify `tests/browser/calculator.spec.mjs`: shared proof fixture, first-viewport and ledger assertions.
- Modify `tests/browser/site-quality.spec.mjs`: route uniqueness, line-count, keyboard navigation and lazy-proof assertions.
- Modify `package.json`: add only the `capture:coal-lsl-proof` script; `package-lock.json` does not change because no dependency changes.
- Replace `assets/coal-lsl-calculator.webp`: deterministic 868 by 580 result-only proof.
- Update the three tracked Playwright snapshots after focused assertions pass.
- Modify `DESIGN.md` and `docs/browser-quality-evidence.md`: durable accepted design and measured evidence.

---

### Task 1: Calculator orientation and inspectable result ledger

**Files:**
- Create: `scripts/coal-lsl-proof-fixture.mjs`
- Modify: `tests/browser/calculator.spec.mjs`
- Modify: `tools/coal-lsl-levy/index.html`
- Modify: `assets/site.css`

**Interfaces:**
- Consumes: protected exports from `assets/levy.mjs`, `compute()` from `assets/levy-form.mjs`, `money()` and `explainLevyResult()` from `assets/levy-explanation.mjs`.
- Produces: `COAL_LSL_PROOF`, `.calculator-method`, `.result-row[data-result-kind]` and the existing `role="status"` result surface used by Task 3.

- [ ] **Step 1: Create the shared fixture and failing browser assertions**

Create `scripts/coal-lsl-proof-fixture.mjs`:

~~~javascript
export const COAL_LSL_PROOF = Object.freeze({
  viewport: Object.freeze({ width: 868, height: 1106 }),
  capture: Object.freeze({
    width: 868,
    height: 580,
    quality: 0.84,
    maxBytes: 80_000,
  }),
  branchName: 'A base rate of pay (section 3B(1))',
  inputs: Object.freeze({
    baseRate: '6000',
    overtimeAndPenalties: '3000',
    allowances: '500',
    salarySacrifice: '0',
  }),
  expected: Object.freeze({
    formulaA: '$6,000.00',
    formulaB: '$7,125.00',
    eligibleWages: '$7,125.00',
    levy: '$192.38',
    branch: 'section 3B(1)',
    explanation:
      'Formula B wins this month. Overtime, penalty rates and allowances reached the levy base only because 75 per cent of the aggregate ($7,125.00) exceeded base pay plus at-least-monthly bonuses ($6,000.00).',
  }),
});
~~~

In `tests/browser/calculator.spec.mjs`, import the object, replace literal input values inside `calculateFormulaB(page)`, and add these tests:

~~~javascript
import { COAL_LSL_PROOF } from '../../scripts/coal-lsl-proof-fixture.mjs';

test('calculator orientation and result render as an inspectable ledger', async ({ page }) => {
  const health = observePageHealth(page);
  await calculateFormulaB(page);

  const method = page.locator('.calculator-method');
  await expect(method).toContainText('2.7 per cent');
  await expect(method).toContainText('28 August 2026');
  await expect(method).toContainText('Section 3B branch test');
  await expect(method).toContainText('Estimate only');

  const result = page.getByRole('status');
  const rows = result.locator('.result-row');
  await expect(rows).toHaveCount(6);
  await expect(result.locator('[data-result-kind="eligible-wages"]'))
    .toContainText(COAL_LSL_PROOF.expected.eligibleWages);
  await expect(result.locator('[data-result-kind="levy"]'))
    .toContainText(COAL_LSL_PROOF.expected.levy);
  await expect(result.locator('[data-result-kind="branch"]'))
    .toContainText(COAL_LSL_PROOF.expected.branch);
  await expect(result.locator('[data-result-kind="formula-a"]'))
    .toContainText(COAL_LSL_PROOF.expected.formulaA);
  await expect(result.locator('[data-result-kind="formula-b"]'))
    .toContainText(COAL_LSL_PROOF.expected.formulaB);
  expect(await rows.first().evaluate((element) =>
    getComputedStyle(element).display
  )).toBe('grid');
  expect(await result.locator('[data-result-kind="levy"] strong')
    .evaluate((element) => ({
      numeric: getComputedStyle(element).fontVariantNumeric,
      whiteSpace: getComputedStyle(element).whiteSpace,
    }))).toEqual({ numeric: 'tabular-nums', whiteSpace: 'nowrap' });
  expect(await result.locator('.result-why').evaluate((element) =>
    getComputedStyle(element).borderTopStyle
  )).toBe('solid');
  await expect(result.locator('.result-why'))
    .toContainText(COAL_LSL_PROOF.expected.explanation);
  health.assertHealthy();
});

test('calculator task begins in the initial mobile viewport', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile contract only');
  const health = observePageHealth(page);
  await page.goto('/tools/coal-lsl-levy/');
  await waitForVisualFonts(page);
  const fieldset = await page.locator('#calc-form fieldset').first().boundingBox();
  expect(fieldset).not.toBeNull();
  expect(fieldset.y).toBeLessThan(844);
  health.assertHealthy();
});

test('calculator result ledger does not overflow at 320 CSS pixels', async ({ page }) => {
  const health = observePageHealth(page);
  await page.setViewportSize({ width: 320, height: 844 });
  await calculateFormulaB(page);
  await expect.poll(() => page.evaluate(() => (
    document.documentElement.scrollWidth - document.documentElement.clientWidth
  ))).toBeLessThanOrEqual(0);
  const levy = page.locator('[data-result-kind="levy"] strong');
  await expect(levy).toContainText(COAL_LSL_PROOF.expected.levy);
  expect(await levy.evaluate((element) => element.scrollWidth))
    .toBeLessThanOrEqual(await levy.evaluate((element) => element.clientWidth));
  health.assertHealthy();
});
~~~

Update `calculateFormulaB(page)` to fill all four fixture fields explicitly, including salary sacrifice `0`, and keep its existing radio/check/click assertions.

In the existing `calculates a Formula B levy without browser errors` test, replace every hard-coded result literal with the shared fixture:

~~~javascript
const result = page.getByRole('status');
await expect(result.locator('[data-result-kind="formula-b"]'))
  .toContainText(COAL_LSL_PROOF.expected.formulaB);
await expect(result.locator('[data-result-kind="eligible-wages"]'))
  .toContainText(COAL_LSL_PROOF.expected.eligibleWages);
await expect(result.locator('[data-result-kind="levy"]'))
  .toContainText(COAL_LSL_PROOF.expected.levy);
await expect(result.locator('[data-result-kind="branch"]'))
  .toContainText(COAL_LSL_PROOF.expected.branch);
await expect(result.locator('.result-why'))
  .toContainText(COAL_LSL_PROOF.expected.explanation);
~~~

- [ ] **Step 2: Run the focused tests and verify the current interface fails**

Run:

~~~text
npx playwright test tests/browser/calculator.spec.mjs --project=mobile-chromium -g "calculator orientation and result|calculator task begins|result ledger does not overflow"
~~~

Expected: FAIL because `.calculator-method` does not exist, `.result-row` computes to `block`, `.result-why` has no top rule, the first fieldset starts below 844 CSS pixels and the unstyled result is not proven at the 320-pixel acceptance width.

- [ ] **Step 3: Replace the repeated calculator introduction with the compact method register**

In `tools/coal-lsl-levy/index.html`, keep the crumb and `h1`, replace the two opening paragraphs with:

~~~html
<p class="short-answer">Apply the section 3B branch test to monthly pay and keep the formula, eligible wages and levy visible.</p>
<dl class="calculator-method" aria-label="Calculation method and boundary">
  <div>
    <dt>Rate</dt>
    <dd>2.7 per cent of eligible wages, paid monthly, checked 28 August 2026</dd>
  </div>
  <div>
    <dt>Method</dt>
    <dd>Section 3B branch test</dd>
  </div>
  <div>
    <dt>Boundary</dt>
    <dd>Estimate only. Check the current prescribed percentage before relying on a figure.</dd>
  </div>
</dl>
~~~

Do not alter the legal-content sections, source links, disclaimer, checked date, rate facts or JSON-LD.

- [ ] **Step 4: Add stable result kinds without touching arithmetic**

Inside `render(result, into)`, change only the presentation array and DOM construction:

~~~javascript
const branchLabel = result.branch.startsWith('s ')
  ? 'section ' + result.branch.slice(2)
  : result.branch;
const rows = [
  { kind: 'eligible-wages', label: 'Eligible wages', value: money(cents) },
  {
    kind: 'levy',
    label: 'Levy at 2.7 per cent, as at ' + LEVY_RATE_AS_AT,
    value: money(rounded),
  },
  ...(exact !== rounded
    ? [{
        kind: 'before-rounding',
        label: 'Before rounding',
        value: (exact / 100).toFixed(4) + ' dollars',
      }]
    : []),
  { kind: 'branch', label: 'Branch applied', value: branchLabel },
  ...(result.branch === 's 3B(1)'
    ? [
        { kind: 'formula-a', label: 'Formula A', value: money(result.formulaA) },
        { kind: 'formula-b', label: 'Formula B', value: money(result.formulaB) },
      ]
    : []),
];

for (const { kind, label, value } of rows) {
  const row = document.createElement('div');
  row.className = 'result-row';
  row.dataset.resultKind = kind;
  const labelElement = document.createElement('span');
  const valueElement = document.createElement('strong');
  labelElement.textContent = label;
  valueElement.textContent = value;
  row.append(labelElement, valueElement);
  into.append(row);
}
~~~

Keep the exact calculation of `exact`, `rounded`, the explanation call and the existing live-region attributes.

- [ ] **Step 5: Add the calculator method and ledger CSS**

In `assets/site.css`, add:

~~~css
.calculator-method {
  display: grid;
  margin: 0;
  border-top: var(--rule-strong) solid var(--colour-ink);
  border-bottom: var(--rule-thin) solid var(--colour-rule-strong);
}

.calculator-method > div {
  display: grid;
  grid-template-columns: minmax(7rem, 0.45fr) minmax(0, 1.55fr);
  gap: var(--space-4);
  padding-block: var(--space-3);
  border-top: var(--rule-thin) solid var(--colour-rule);
}

.calculator-method > div:first-child {
  border-top: 0;
}

.calculator-method dt {
  color: var(--colour-ink-soft);
  font-family: var(--font-mono);
  font-size: var(--text-caption);
  letter-spacing: var(--tracking-label);
  text-transform: uppercase;
}

.calculator-method dd {
  margin: 0;
}

.result-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-4);
  align-items: baseline;
  padding-block: var(--space-3);
  border-bottom: var(--rule-thin) solid var(--colour-rule);
}

.result-row strong {
  color: var(--colour-ink);
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}

.result-row[data-result-kind="eligible-wages"],
.result-row[data-result-kind="levy"] {
  font-size: var(--text-lead);
}

.result-row[data-result-kind="levy"] {
  padding-top: var(--space-4);
  border-top: var(--rule-strong) solid var(--colour-stamp);
}

.result-row[data-result-kind="levy"] strong {
  color: var(--colour-stamp-strong);
}

.result-why {
  margin-top: var(--space-5);
  padding-top: var(--space-4);
  border-top: var(--rule-strong) solid var(--colour-ink);
  color: var(--colour-ink-soft);
}

@media (max-width: 22rem) {
  .result-row {
    grid-template-columns: 1fr;
    gap: var(--space-1);
  }

  .result-row strong {
    text-align: left;
  }
}
~~~

Reduce only the calculator header's bottom padding if needed to make the first fieldset assertion pass. Do not reduce body text below 16 CSS pixels.

- [ ] **Step 6: Run calculator unit and browser tests**

Run:

~~~text
node --test scripts/levy.test.mjs
node --test scripts/levy-webmcp.test.mjs
npx playwright test tests/browser/calculator.spec.mjs --project=mobile-chromium --grep-invert "visual baseline"
npx playwright test tests/browser/calculator.spec.mjs --project=desktop-chromium --grep-invert "visual baseline"
~~~

Expected: 21 levy tests pass, 8 WebMCP tests pass and every non-snapshot calculator browser test passes. The tracked mobile screenshot is deliberately not run until Task 4 updates and inspects it.

- [ ] **Step 7: Commit the calculator slice**

Run:

~~~text
git add scripts/coal-lsl-proof-fixture.mjs tests/browser/calculator.spec.mjs tools/coal-lsl-levy/index.html assets/site.css
git diff --cached --check
git commit -m "feat: refine coal LSL calculator presentation"
~~~

### Task 2: Homepage decision hierarchy and mobile scanability

**Files:**
- Modify: `scripts/test_check_design.py`
- Modify: `scripts/check_design.py`
- Modify: `tests/browser/site-quality.spec.mjs`
- Modify: `index.html`
- Modify: `assets/tokens.css`
- Modify: `assets/site.css`

**Interfaces:**
- Consumes: existing route IDs, tool-category heading IDs, semantic tokens and browser health/font helpers.
- Produces: exactly one `.hero-routes` navigation, one `.trust-band`, one `.catalogue-index`, unbroken wide route labels and the five-cell `.principles-list` layout used by Task 4 visual baselines.

- [ ] **Step 1: Add failing source-contract mutations**

Extend the fixture homepage in `scripts/test_check_design.py` so its `main` contains one `.hero-routes` navigation with links to `#engage`, `#adopt` and `#verify`, followed by a closing `.home-hero` section and an immediately adjacent `.trust-band` containing the exact legal boundary and three scope records shown in Step 6. Also include one `.catalogue-index` and exactly three non-ordinal `.technical-label` paragraphs representing public-register context, worked proof and tool-register scope. Add these mutation cases:

~~~python
(
    "duplicate homepage route",
    lambda root: (root / "index.html").write_text(
        (root / "index.html").read_text(encoding="utf-8").replace(
            "</main>", '<a href="#engage">Duplicate</a></main>'
        ),
        encoding="utf-8",
    ),
    "index.html: expected exactly one #engage route link",
),
(
    "missing homepage route register",
    lambda root: (root / "index.html").write_text(
        (root / "index.html").read_text(encoding="utf-8").replace(
            "hero-routes", "removed-hero-routes"
        ),
        encoding="utf-8",
    ),
    "index.html: expected one hero-routes",
),
(
    "missing homepage trust band",
    lambda root: (root / "index.html").write_text(
        (root / "index.html").read_text(encoding="utf-8").replace(
            "trust-band", "removed-trust-band"
        ),
        encoding="utf-8",
    ),
    "index.html: expected one trust-band",
),
(
    "trust band separated from home hero",
    lambda root: (root / "index.html").write_text(
        (root / "index.html").read_text(encoding="utf-8").replace(
            '<aside class="trust-band"',
            '<p>Separated content</p><aside class="trust-band"',
        ),
        encoding="utf-8",
    ),
    "index.html: trust-band must immediately follow home hero",
),
(
    "homepage legal boundary changed",
    lambda root: (root / "index.html").write_text(
        (root / "index.html").read_text(encoding="utf-8").replace(
            "Review aids only. No client files. No lodgement. Human sign-off.",
            "Changed boundary",
        ),
        encoding="utf-8",
    ),
    "index.html: trust-band records must match the approved four-item tuple",
),
(
    "homepage scope record changed",
    lambda root: (root / "index.html").write_text(
        (root / "index.html").read_text(encoding="utf-8").replace(
            "Accounting workflow controls", "Changed scope"
        ),
        encoding="utf-8",
    ),
    "index.html: trust-band records must match the approved four-item tuple",
),
(
    "homepage method record changed",
    lambda root: (root / "index.html").write_text(
        (root / "index.html").read_text(encoding="utf-8").replace(
            "Primary sources and exact arithmetic", "Changed method"
        ),
        encoding="utf-8",
    ),
    "index.html: trust-band records must match the approved four-item tuple",
),
(
    "homepage calculation boundary record changed",
    lambda root: (root / "index.html").write_text(
        (root / "index.html").read_text(encoding="utf-8").replace(
            "Calculation is not judgement", "Changed calculation boundary"
        ),
        encoding="utf-8",
    ),
    "index.html: trust-band records must match the approved four-item tuple",
),
(
    "homepage trust record has appended wording",
    lambda root: (root / "index.html").write_text(
        (root / "index.html").read_text(encoding="utf-8").replace(
            "Human sign-off.", "Human sign-off. Appended wording."
        ),
        encoding="utf-8",
    ),
    "index.html: trust-band records must match the approved four-item tuple",
),
(
    "homepage trust band has an extra record",
    lambda root: (root / "index.html").write_text(
        (root / "index.html").read_text(encoding="utf-8").replace(
            "</aside>", "<p>Extra record</p></aside>"
        ),
        encoding="utf-8",
    ),
    "index.html: trust-band records must match the approved four-item tuple",
),
(
    "missing homepage catalogue index",
    lambda root: (root / "index.html").write_text(
        (root / "index.html").read_text(encoding="utf-8").replace(
            "catalogue-index", "removed-catalogue-index"
        ),
        encoding="utf-8",
    ),
    "index.html: expected one catalogue-index",
),
(
    "decorative homepage ordinal",
    lambda root: (root / "index.html").write_text(
        (root / "index.html").read_text(encoding="utf-8").replace(
            "</main>", '<p class="technical-label">01 / decorative</p></main>'
        ),
        encoding="utf-8",
    ),
    "index.html: decorative ordinal technical label",
),
(
    "extra homepage technical label",
    lambda root: (root / "index.html").write_text(
        (root / "index.html").read_text(encoding="utf-8").replace(
            "</main>",
            '<p class="technical-label">Extra context</p></main>',
        ),
        encoding="utf-8",
    ),
    "index.html: expected exactly three evidence-bearing technical labels",
),
~~~

Call a new `check_homepage_refinement(root)` from `check_repository(root)`.

- [ ] **Step 2: Run the source test and verify it fails**

Run:

~~~text
python scripts/test_check_design.py
~~~

Expected: FAIL because `check_design.check_homepage_refinement` is not defined.

- [ ] **Step 3: Implement the homepage source contract**

In `scripts/check_design.py`, add:

~~~python
HOMEPAGE_ROUTE_TARGETS = ("#engage", "#adopt", "#verify")
HOMEPAGE_REQUIRED_CLASSES = ("hero-routes", "trust-band", "catalogue-index")
TRUST_BAND_TEXT = (
    "Review aids only. No client files. No lodgement. Human sign-off.",
    "Scope 01 Accounting workflow controls",
    "Method 02 Primary sources and exact arithmetic",
    "Boundary 03 Calculation is not judgement",
)
HERO_TRUST_ADJACENCY_PATTERN = re.compile(
    r'<section\b(?=[^>]*class\s*=\s*["\'][^"\']*\bhome-hero\b'
    r'[^"\']*["\'])[^>]*>.*?</section>\s*'
    r'<aside\b(?=[^>]*class\s*=\s*["\'][^"\']*\btrust-band\b'
    r'[^"\']*["\'])',
    re.I | re.S,
)
TRUST_BAND_PATTERN = re.compile(
    r'<aside\b(?=[^>]*class\s*=\s*["\'][^"\']*\btrust-band\b'
    r'[^"\']*["\'])[^>]*>(.*?)</aside>',
    re.I | re.S,
)
TRUST_RECORD_PATTERN = re.compile(r"<p\b[^>]*>(.*?)</p>", re.I | re.S)


def class_count(raw_html: str, class_name: str) -> int:
    pattern = re.compile(
        r'class\s*=\s*(["\'])[^"\']*\b'
        + re.escape(class_name)
        + r'\b[^"\']*\1',
        re.I,
    )
    return len(pattern.findall(raw_html))


def check_homepage_refinement(root: Path) -> list[str]:
    path = root / "index.html"
    if not path.is_file():
        return ["index.html: homepage missing"]
    raw = path.read_text(encoding="utf-8")
    main_regions = MAIN_PATTERN.findall(raw)
    if len(main_regions) != 1:
        return ["index.html: expected one main region"]
    main = active_markup(main_regions[0])
    links = [
        html_module.unescape(target)
        for _, target in MAIN_LINK_PATTERN.findall(main)
    ]
    failures = []
    for target in HOMEPAGE_ROUTE_TARGETS:
        if links.count(target) != 1:
            failures.append(
                "index.html: expected exactly one " + target + " route link"
            )
    for class_name in HOMEPAGE_REQUIRED_CLASSES:
        if class_count(main, class_name) != 1:
            failures.append("index.html: expected one " + class_name)
    if not HERO_TRUST_ADJACENCY_PATTERN.search(main):
        failures.append("index.html: trust-band must immediately follow home hero")
    trust_regions = TRUST_BAND_PATTERN.findall(main)
    if len(trust_regions) == 1:
        trust_records = tuple(
            visible_text(record)
            for record in TRUST_RECORD_PATTERN.findall(trust_regions[0])
        )
        if trust_records != TRUST_BAND_TEXT:
            failures.append(
                "index.html: trust-band records must match "
                "the approved four-item tuple"
            )
    if class_count(main, "technical-label") != 3:
        failures.append(
            "index.html: expected exactly three evidence-bearing technical labels"
        )
    label_pattern = re.compile(
        r'<p\b(?=[^>]*class\s*=\s*(["\'])[^"\']*\btechnical-label\b'
        r'[^"\']*\1)[^>]*>(.*?)</p>',
        re.I | re.S,
    )
    for _, body in label_pattern.findall(main):
        label = visible_text(body)
        if re.match(r"^(?:0[1-3]|[A-D])\s*/", label) or re.search(
            r"/\s*0?5$", label
        ):
            failures.append(
                "index.html: decorative ordinal technical label: " + label
            )
    return failures
~~~

Add `failures.extend(check_homepage_refinement(root))` before the copy check in `check_repository(root)`.

Run:

~~~text
python scripts/test_check_design.py
python scripts/check_design.py
~~~

Expected: mutation tests pass; the repository check fails on the current duplicate route links and missing new classes.

- [ ] **Step 4: Add failing browser assertions for the approved composition**

In `tests/browser/site-quality.spec.mjs`, add a reusable line counter and tests:

~~~javascript
async function textLineCount(locator) {
  return locator.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const tops = [...range.getClientRects()].map(({ top }) => Math.round(top));
    return new Set(tops).size;
  });
}

test('home exposes one route register with deliberate heading lines', async ({ page }, testInfo) => {
  const health = observePageHealth(page);
  await page.goto('/');
  await waitForVisualFonts(page);
  const routes = page.getByRole('navigation', { name: 'Choose a path' });
  await expect(routes).toBeVisible();
  for (const target of ['#engage', '#adopt', '#verify']) {
    await expect(page.locator('main a[href="' + target + '"]')).toHaveCount(1);
  }
  if (testInfo.project.name === 'desktop-chromium') {
    expect(await textLineCount(page.getByRole('heading', { level: 1 }))).toBe(2);
    for (const name of ['Engage', 'Adopt', 'Verify']) {
      expect(await textLineCount(page.getByRole('heading', { name, exact: true })))
        .toBe(1);
    }
  } else {
    expect(await textLineCount(page.getByRole('heading', { level: 1 })))
      .toBeLessThanOrEqual(3);
  }
  health.assertHealthy();
});

test('route words remain intact at the narrowest wide layout', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'wide-layout seam only');
  const health = observePageHealth(page);
  await page.setViewportSize({ width: 900, height: 900 });
  await page.goto('/');
  await waitForVisualFonts(page);
  for (const name of ['Engage', 'Adopt', 'Verify']) {
    const heading = page.getByRole('heading', { name, exact: true });
    expect(await textLineCount(heading)).toBe(1);
    expect(await heading.evaluate((element) => element.scrollWidth))
      .toBeLessThanOrEqual(await heading.evaluate((element) => element.clientWidth));
  }
  health.assertHealthy();
});

test('mobile primary navigation and catalogue index remain keyboard reachable', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile contract only');
  const health = observePageHealth(page);
  await page.goto('/');
  const primary = page.getByRole('navigation', { name: 'Primary' });
  expect(await primary.evaluate((element) =>
    getComputedStyle(element).flexWrap
  )).toBe('nowrap');
  const firstPrimaryLink = primary.getByRole('link', { name: 'About' });
  const lastPrimaryLink = primary.getByRole('link', { name: 'Awesome List' });
  await firstPrimaryLink.focus();
  for (let index = 0; index < 4; index += 1) {
    await page.keyboard.press('Tab');
  }
  await expect(lastPrimaryLink).toBeFocused();
  expect(await primary.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);

  const catalogue = page.getByRole('navigation', { name: 'Tool categories' });
  const extract = catalogue.getByRole('link', { name: 'Extract' });
  const inspect = catalogue.getByRole('link', { name: 'Inspect' });
  await extract.focus();
  for (let index = 0; index < 3; index += 1) {
    await page.keyboard.press('Tab');
  }
  await expect(inspect).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#inspect-tools$/);
  health.assertHealthy();
});

test('home does not overflow at refinement acceptance widths', async ({ page }) => {
  const health = observePageHealth(page);
  for (const width of [320, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    const viewport = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(viewport.scrollWidth, `homepage overflow at ${width}px`)
      .toBeLessThanOrEqual(viewport.clientWidth);
  }
  health.assertHealthy();
});
~~~

Replace the existing `home does not overflow at 320 CSS pixels` test with the acceptance-width test above so 320 is not tested twice. The ordinary route matrix continues to cover the configured 390 and 1440 widths.

- [ ] **Step 5: Run the focused browser tests and verify they fail**

Run:

~~~text
npx playwright test tests/browser/site-quality.spec.mjs -g "one route register|route words remain intact|mobile primary navigation|refinement acceptance widths"
~~~

Expected: FAIL because route links are duplicated, the desktop `Engage` heading wraps, the mobile nav wraps and the catalogue index is absent.

- [ ] **Step 6: Replace the duplicated hero actions with one route register and trust band**

In `index.html`:

1. Change the `h1` content to two phrase spans without changing its visible text:

~~~html
<h1 id="home-title"><span>Accounting tools</span>
  <span>that show their working.</span></h1>
~~~

2. Replace `.home-actions` with:

~~~html
<nav class="hero-routes" aria-label="Choose a path">
  <a href="#engage">
    <strong>Engage</strong>
    <span>Bring a workflow problem.</span>
  </a>
  <a href="#adopt">
    <strong>Adopt</strong>
    <span>Test with fabricated data.</span>
  </a>
  <a href="#verify">
    <strong>Verify</strong>
    <span>Inspect source, release and boundary.</span>
  </a>
</nav>
~~~

3. Remove the separate `.path-grid`. Move the exact `.hero-boundary` and existing three `.home-proof-rail` records after the hero inside:

~~~html
<aside class="trust-band" aria-label="Register boundary and scope">
  <div class="site-shell trust-band__inner">
    <p class="hero-boundary">Review aids only. No client files. No lodgement. Human sign-off.</p>
    <div class="home-proof-rail" aria-label="Register scope">
      <p><strong>Scope 01</strong> Accounting workflow controls</p>
      <p><strong>Method 02</strong> Primary sources and exact arithmetic</p>
      <p><strong>Boundary 03</strong> Calculation is not judgement</p>
    </div>
  </div>
</aside>
~~~

4. Remove the three route ordinal paragraphs, the four catalogue letter paragraphs and the principles count paragraph.

5. Insert this immediately after `.tools-intro`:

~~~html
<nav class="catalogue-index" aria-label="Tool categories">
  <a href="#extract-tools">Extract</a>
  <a href="#calculate-tools">Calculate</a>
  <a href="#control-tools">Control</a>
  <a href="#inspect-tools">Inspect</a>
</nav>
~~~

- [ ] **Step 7: Implement the homepage, route, principles and mobile-nav CSS**

In `assets/tokens.css`, change only:

~~~css
--text-display: clamp(2.25rem, 1.45rem + 5.2vw, 5.5rem);
~~~

Update the matching replacement string in the oversized-display mutation test.

In `assets/site.css`, replace the obsolete `.home-actions` and `.path-*` rules with:

~~~css
.home-hero h1 {
  max-width: none;
}

.home-hero h1 span {
  display: block;
}

.hero-routes {
  display: grid;
  width: min(100%, 64rem);
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-top: var(--space-2);
  border-block: var(--rule-strong) solid var(--colour-ink);
  text-align: left;
}

.hero-routes a {
  display: grid;
  min-height: 4.75rem;
  gap: var(--space-1);
  align-content: center;
  padding: var(--space-4);
  color: var(--colour-ink);
  text-decoration: none;
}

.hero-routes a + a {
  border-left: var(--rule-thin) solid var(--colour-rule-strong);
}

.hero-routes strong {
  font-family: var(--font-display);
  font-size: var(--text-heading-small);
}

.hero-routes span {
  color: var(--colour-ink-soft);
  font-size: var(--text-small);
}

.hero-routes a:hover {
  color: var(--colour-stamp-strong);
  background: var(--colour-stamp-wash);
}

.trust-band {
  border-block: var(--rule-strong) solid var(--colour-ink);
  background: var(--colour-paper);
}

.trust-band__inner {
  display: grid;
  grid-template-columns: minmax(18rem, 0.7fr) minmax(0, 1.3fr);
}

.trust-band .hero-boundary {
  width: auto;
  align-content: center;
  margin: 0;
  padding: var(--space-4) var(--space-5);
  border-top: 0;
  border-left: var(--rule-strong) solid var(--colour-alert);
}

.trust-band .home-proof-rail {
  width: auto;
  margin: 0;
  padding: 0;
  border: 0;
}
~~~

Change the wide route grid and route heading rules to:

~~~css
.route-section {
  grid-template-columns: minmax(20rem, 0.85fr) minmax(0, 1.15fr);
}

.route-section > h2 {
  overflow-wrap: normal;
  white-space: nowrap;
  word-break: normal;
}
~~~

Add:

~~~css
.catalogue-index {
  display: flex;
  margin-top: var(--space-5);
  overflow-x: auto;
  border-block: var(--rule-thin) solid var(--colour-rule-strong);
}

.catalogue-index a {
  display: inline-flex;
  min-height: 2.75rem;
  flex: 0 0 auto;
  align-items: center;
  padding-inline: var(--space-4);
  border-right: var(--rule-thin) solid var(--colour-rule);
  font-family: var(--font-mono);
  font-size: var(--text-small);
  text-decoration: none;
}

.principles-list {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) repeat(2, minmax(0, 1fr));
  border-bottom: var(--rule-thin) solid var(--colour-rule-strong);
}

.principles-list > div:first-child {
  grid-row: span 2;
}

.principles-list > div:first-child strong {
  font-size: var(--text-heading-small);
}
~~~

At `max-width: 70rem`, replace the existing principle-grid overrides with:

~~~css
.principles-list {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.principles-list > div:first-child {
  grid-column: 1 / -1;
  grid-row: auto;
}

.principles-list > div:nth-child(2),
.principles-list > div:nth-child(4) {
  border-left: 0;
}
~~~

At `max-width: 56rem`, add:

~~~css
.trust-band__inner {
  grid-template-columns: 1fr;
}

.home-hero h1 span {
  display: inline;
}

.route-section > h2 {
  white-space: normal;
}
~~~

The newline between the two masthead spans supplies the normal inline word space at this breakpoint. At `max-width: 40rem`, use:

~~~css
:root {
  --header-height: 6rem;
}

.site-nav {
  flex-wrap: nowrap;
  overflow-x: auto;
  overscroll-behavior-inline: contain;
  padding-bottom: 0;
}

.site-nav a {
  display: inline-flex;
  min-height: 2.75rem;
  flex: 0 0 auto;
  align-items: center;
}

.hero-routes,
.home-proof-rail,
.principles-list {
  grid-template-columns: 1fr;
}

.hero-routes a + a,
.home-proof-rail p + p,
.principles-list > div + div {
  border-left: 0;
  border-top: var(--rule-thin) solid var(--colour-rule-strong);
}
~~~

Remove obsolete `.path-grid` selectors from the mobile grid and border-reset groups.

- [ ] **Step 8: Run focused source and browser checks**

Run:

~~~text
python scripts/test_check_design.py
python scripts/check_design.py
npx playwright test tests/browser/site-quality.spec.mjs -g "one route register|route words remain intact|mobile primary navigation|refinement acceptance widths"
~~~

Expected: source contracts pass; route uniqueness, line-count, keyboard and 320-pixel overflow tests pass. The homepage visual snapshot may remain an intentional mismatch until Task 4.

- [ ] **Step 9: Commit the homepage slice**

Run:

~~~text
git add scripts/test_check_design.py scripts/check_design.py tests/browser/site-quality.spec.mjs index.html assets/tokens.css assets/site.css
git diff --cached --check
git commit -m "feat: refine homepage register hierarchy"
~~~

### Task 3: Deterministic current proof artefact

**Files:**
- Create: `scripts/capture-coal-lsl-proof.mjs`
- Create: `scripts/capture-coal-lsl-proof.test.mjs`
- Modify: `package.json`
- Modify: `scripts/check_design.py`
- Modify: `scripts/test_check_design.py`
- Modify: `tests/browser/site-quality.spec.mjs`
- Modify: `index.html`
- Replace: `assets/coal-lsl-calculator.webp`

**Interfaces:**
- Consumes: `COAL_LSL_PROOF` from Task 1, the rendered `.calculator-result` ledger and the repository's pinned Playwright Chromium.
- Produces: read-only `renderCoalLslProof() -> Promise<{ image, width, height, bytes }>`, fixed-destination `captureCoalLslProof(options) -> Promise<{ width, height, bytes }>`, `npm run capture:coal-lsl-proof`, an 868 by 580 WebP no larger than 80,000 bytes and a browser contract that proves the lazy image has decoded. `captureCoalLslProof` rejects any supplied argument before launching a browser and can write only `assets/coal-lsl-calculator.webp` under the module's repository root.

- [ ] **Step 1: Add the failing capture integration test**

Create `scripts/capture-coal-lsl-proof.test.mjs`:

~~~javascript
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { COAL_LSL_PROOF } from './coal-lsl-proof-fixture.mjs';
import {
  captureCoalLslProof,
  renderCoalLslProof,
} from './capture-coal-lsl-proof.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const PROOF_PATH = path.join(ROOT, 'assets', 'coal-lsl-calculator.webp');

test('renders the deterministic Coal LSL result without writing', async () => {
  const before = await readFile(PROOF_PATH);
  const result = await renderCoalLslProof();
  assert.equal(result.width, COAL_LSL_PROOF.capture.width);
  assert.equal(result.height, COAL_LSL_PROOF.capture.height);
  assert.equal(result.bytes, result.image.byteLength);
  assert.ok(result.bytes > 0);
  assert.ok(result.bytes <= COAL_LSL_PROOF.capture.maxBytes);
  assert.equal(result.image.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(result.image.subarray(8, 12).toString('ascii'), 'WEBP');
  assert.deepEqual(await readFile(PROOF_PATH), before);
});

test('fixed-destination capture rejects every caller-supplied option', async () => {
  await assert.rejects(
    captureCoalLslProof({ outputPath: path.join(ROOT, 'work', 'proof.webp') }),
    /does not accept options/,
  );
});
~~~

- [ ] **Step 2: Run the capture test and verify it fails for the missing module**

Run:

~~~text
node --test scripts/capture-coal-lsl-proof.test.mjs
~~~

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/capture-coal-lsl-proof.mjs`.

- [ ] **Step 3: Implement the isolated capture pipeline**

Create `scripts/capture-coal-lsl-proof.mjs` with this complete implementation:

~~~javascript
import { once } from 'node:events';
import { lstat, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { chromium } from '@playwright/test';

import { COAL_LSL_PROOF } from './coal-lsl-proof-fixture.mjs';
import { waitForVisualFonts } from '../tests/browser/visual.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const PROOF_OUTPUT = path.join(ROOT, 'assets', 'coal-lsl-calculator.webp');
const MIME_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.woff2', 'font/woff2'],
  ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'],
]);

class HttpStatusError extends Error {
  constructor(status) {
    super(`HTTP ${status}`);
    this.status = status;
  }
}

function isWithin(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (
    relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative)
  );
}

async function resolveRequestPath(rootReal, rawUrl) {
  const rawPath = (rawUrl || '/').split(/[?#]/u, 1)[0];
  let decoded;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    throw new HttpStatusError(400);
  }
  if (decoded.includes('\0')) throw new HttpStatusError(400);
  const slashPath = decoded.replaceAll('\\', '/');
  if (slashPath.split('/').some((part) => part === '.' || part === '..')) {
    throw new HttpStatusError(403);
  }
  const relative = slashPath.replace(/^\/+/, '') || 'index.html';
  let candidate = path.resolve(ROOT, ...relative.split('/'));
  if (!isWithin(ROOT, candidate)) throw new HttpStatusError(403);

  let metadata;
  try {
    metadata = await stat(candidate);
    if (metadata.isDirectory()) {
      candidate = path.join(candidate, 'index.html');
      metadata = await stat(candidate);
    }
  } catch (error) {
    if (error.code === 'ENOENT') throw new HttpStatusError(404);
    throw error;
  }
  if (!metadata.isFile()) throw new HttpStatusError(404);
  const targetReal = await realpath(candidate);
  if (!isWithin(rootReal, targetReal)) throw new HttpStatusError(403);
  return targetReal;
}

function createProofServer(rootReal) {
  return createServer((request, response) => {
    void (async () => {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        throw new HttpStatusError(405);
      }
      const target = await resolveRequestPath(rootReal, request.url);
      const type = MIME_TYPES.get(path.extname(target).toLowerCase());
      if (!type) throw new HttpStatusError(415);
      const body = await readFile(target);
      response.writeHead(200, {
        'cache-control': 'no-store',
        'content-length': body.byteLength,
        'content-type': type,
        'x-content-type-options': 'nosniff',
      });
      response.end(request.method === 'HEAD' ? undefined : body);
    })().catch((error) => {
      if (response.headersSent) {
        response.destroy();
        return;
      }
      const status = error instanceof HttpStatusError ? error.status : 500;
      response.writeHead(status, {
        'cache-control': 'no-store',
        'content-type': 'text/plain; charset=utf-8',
      });
      response.end(`${status}\n`);
    });
  });
}

function observeBrowserHealth(page, label, failures) {
  page.on('pageerror', (error) => failures.push(`${label} pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      failures.push(`${label} console: ${message.text()}`);
    }
  });
  page.on('requestfailed', (request) => {
    failures.push(
      `${label} requestfailed: ${request.url()} ${request.failure()?.errorText || ''}`,
    );
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      failures.push(`${label} HTTP ${response.status()}: ${response.url()}`);
    }
  });
}

function assertHealthy(failures) {
  if (failures.length) {
    throw new Error(`Proof capture browser health failed:\n${failures.join('\n')}`);
  }
}

function normalisedText(value) {
  return String(value || '').replace(/\s+/gu, ' ').trim();
}

async function assertContains(locator, expected, label) {
  await locator.waitFor({ state: 'visible' });
  const actual = normalisedText(await locator.textContent());
  const wanted = normalisedText(expected);
  if (!actual.includes(wanted)) {
    throw new Error(`${label} mismatch: expected ${wanted}; received ${actual}`);
  }
}

async function closeServer(server) {
  if (!server.listening) return;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

export async function renderCoalLslProof() {
  const rootReal = await realpath(ROOT);
  const server = createProofServer(rootReal);
  let browser;
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Proof server did not expose a TCP port');
    }
    const origin = `http://127.0.0.1:${address.port}`;

    browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: COAL_LSL_PROOF.viewport,
      deviceScaleFactor: 1,
    });
    await context.route('**/*', async (route) => {
      const url = route.request().url();
      if (
        url === 'about:blank'
        || url.startsWith('data:')
        || url.startsWith(`${origin}/`)
      ) {
        await route.continue();
        return;
      }
      await route.abort('blockedbyclient');
    });

    const failures = [];
    const page = await context.newPage();
    observeBrowserHealth(page, 'calculator', failures);
    await page.goto(`${origin}/tools/coal-lsl-levy/`, { waitUntil: 'networkidle' });
    await waitForVisualFonts(page);
    await page.getByRole('radio', {
      name: COAL_LSL_PROOF.branchName,
      exact: true,
    }).check();
    await page.getByRole('spinbutton', {
      name: 'Base rate of pay',
      exact: true,
    }).fill(COAL_LSL_PROOF.inputs.baseRate);
    await page.getByLabel('Overtime and penalty rates')
      .fill(COAL_LSL_PROOF.inputs.overtimeAndPenalties);
    await page.getByLabel('Allowances, excluding expense reimbursements')
      .fill(COAL_LSL_PROOF.inputs.allowances);
    await page.getByLabel('Salary sacrificed amount')
      .fill(COAL_LSL_PROOF.inputs.salarySacrifice);
    await page.getByRole('button', { name: 'Calculate', exact: true }).click();

    const result = page.getByRole('status');
    for (const [kind, expected] of [
      ['formula-a', COAL_LSL_PROOF.expected.formulaA],
      ['formula-b', COAL_LSL_PROOF.expected.formulaB],
      ['eligible-wages', COAL_LSL_PROOF.expected.eligibleWages],
      ['levy', COAL_LSL_PROOF.expected.levy],
      ['branch', COAL_LSL_PROOF.expected.branch],
    ]) {
      await assertContains(
        result.locator(`[data-result-kind="${kind}"]`),
        expected,
        kind,
      );
    }
    await assertContains(
      result.locator('.result-why'),
      COAL_LSL_PROOF.expected.explanation,
      'explanation',
    );

    const panel = page.locator('.calculator-result');
    await panel.evaluate((element, capture) => {
      const background = getComputedStyle(document.body).backgroundColor;
      document.body.replaceChildren(element);
      Object.assign(document.documentElement.style, {
        width: `${capture.width}px`,
        height: `${capture.height}px`,
        margin: '0',
        overflow: 'hidden',
      });
      Object.assign(document.body.style, {
        width: `${capture.width}px`,
        height: `${capture.height}px`,
        minHeight: '0',
        margin: '0',
        overflow: 'hidden',
        background,
      });
      Object.assign(element.style, {
        boxSizing: 'border-box',
        width: `${capture.width}px`,
        height: `${capture.height}px`,
        maxWidth: 'none',
        minWidth: '0',
        margin: '0',
        position: 'static',
        overflow: 'hidden',
        background,
      });
    }, COAL_LSL_PROOF.capture);
    const bounds = await panel.boundingBox();
    if (
      !bounds
      || Math.round(bounds.width) !== COAL_LSL_PROOF.capture.width
      || Math.round(bounds.height) !== COAL_LSL_PROOF.capture.height
    ) {
      throw new Error(`Unexpected proof bounds: ${JSON.stringify(bounds)}`);
    }
    const scrollHeight = await panel.evaluate((element) => element.scrollHeight);
    if (scrollHeight > COAL_LSL_PROOF.capture.height) {
      throw new Error(`Proof content exceeds capture height: ${scrollHeight}`);
    }
    const png = await panel.screenshot({
      type: 'png',
      animations: 'disabled',
      caret: 'hide',
    });

    const encoder = await context.newPage();
    observeBrowserHealth(encoder, 'encoder', failures);
    const webpUrl = await encoder.evaluate(async ({ pngBase64, capture }) => {
      const source = new Image();
      source.src = `data:image/png;base64,${pngBase64}`;
      await source.decode();
      const canvas = document.createElement('canvas');
      canvas.width = capture.width;
      canvas.height = capture.height;
      const drawing = canvas.getContext('2d');
      if (!drawing) throw new Error('Canvas 2D context unavailable');
      drawing.drawImage(source, 0, 0, capture.width, capture.height);
      return canvas.toDataURL('image/webp', capture.quality);
    }, {
      pngBase64: png.toString('base64'),
      capture: COAL_LSL_PROOF.capture,
    });
    const prefix = 'data:image/webp;base64,';
    if (!webpUrl.startsWith(prefix)) {
      throw new Error('Browser did not encode WebP');
    }
    const image = Buffer.from(webpUrl.slice(prefix.length), 'base64');
    if (
      image.byteLength < 12
      || image.subarray(0, 4).toString('ascii') !== 'RIFF'
      || image.subarray(8, 12).toString('ascii') !== 'WEBP'
    ) {
      throw new Error('Encoded proof is not a WebP container');
    }
    if (image.byteLength > COAL_LSL_PROOF.capture.maxBytes) {
      throw new Error(`Encoded proof exceeds ${COAL_LSL_PROOF.capture.maxBytes} bytes`);
    }
    assertHealthy(failures);
    return {
      image,
      width: COAL_LSL_PROOF.capture.width,
      height: COAL_LSL_PROOF.capture.height,
      bytes: image.byteLength,
    };
  } finally {
    try {
      await browser?.close();
    } finally {
      await closeServer(server);
    }
  }
}

export async function captureCoalLslProof(options) {
  if (options !== undefined) {
    throw new TypeError('captureCoalLslProof does not accept options');
  }
  const rootReal = await realpath(ROOT);
  const outputParent = await realpath(path.dirname(PROOF_OUTPUT));
  if (path.relative(path.join(rootReal, 'assets'), outputParent) !== '') {
    throw new Error('Refusing unexpected proof output directory');
  }
  const existing = await lstat(PROOF_OUTPUT).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (existing?.isSymbolicLink()) {
    throw new Error('Refusing symbolic-link proof output');
  }
  const { image, width, height, bytes } = await renderCoalLslProof();
  await writeFile(PROOF_OUTPUT, image);
  return { width, height, bytes };
}

if (process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const result = await captureCoalLslProof();
  console.log(`${result.width}x${result.height} WebP, ${result.bytes} bytes`);
}
~~~

- [ ] **Step 4: Run the capture integration test**

Run:

~~~text
node --test scripts/capture-coal-lsl-proof.test.mjs
~~~

Expected: two tests pass; read-only rendering produces the correct bounded WebP bytes without changing the tracked asset, and the write function rejects an output override before browser launch.

- [ ] **Step 5: Add and run the repository capture command**

Add this one script to `package.json` without changing dependencies:

~~~json
"capture:coal-lsl-proof": "node scripts/capture-coal-lsl-proof.mjs"
~~~

Keep the existing script order and valid trailing commas. Do not modify `package-lock.json`.

Run:

~~~text
npm run capture:coal-lsl-proof
~~~

Expected: exit 0, output reports `868x580 WebP` and no more than 80,000 bytes, and only `assets/coal-lsl-calculator.webp` changes.

- [ ] **Step 6: Add failing source contracts for the proof dimensions and byte limit**

In `scripts/test_check_design.py`:

- Change the fixture image height from `1106` to `580`.
- Create `assets/coal-lsl-calculator.webp` in `write_fixture()` with `b"RIFF" + b"\0" * 4 + b"WEBP"`.
- Add a mutation that replaces `height="580"` with `height="1106"` and expects `index.html: Coal LSL proof image must keep its height`.
- Add a mutation that writes `b"not-a-webp"` to the proof asset and expects `assets/coal-lsl-calculator.webp: proof image is not a WebP container`.
- Add a mutation that writes `b"RIFF" + b"\0" * 4 + b"WEBP" + b"\0" * (80_001 - 12)` to the proof asset and expects `assets/coal-lsl-calculator.webp: proof image exceeds 80000 bytes`.
- Keep the existing lazy-loading, asynchronous-decoding, low-priority and descriptive-alt mutations.

Run:

~~~text
python scripts/test_check_design.py
~~~

Expected: FAIL because the repository checker still expects height 1106 and has no byte-limit contract.

- [ ] **Step 7: Implement the proof-delivery source contract and homepage metadata**

In `scripts/check_design.py`, add:

~~~python
PROOF_WIDTH = "868"
PROOF_HEIGHT = "580"
MAX_PROOF_BYTES = 80_000
PROOF_ASSET = "assets/coal-lsl-calculator.webp"
~~~

Use `PROOF_WIDTH` and `PROOF_HEIGHT` in the image's required-marker mapping. After checking the image markup, resolve `root / PROOF_ASSET`; report `assets/coal-lsl-calculator.webp: proof image is missing` when absent. When present, read its bytes once, report `assets/coal-lsl-calculator.webp: proof image is not a WebP container` unless bytes 0 through 3 are `RIFF` and bytes 8 through 11 are `WEBP`, and report `assets/coal-lsl-calculator.webp: proof image exceeds 80000 bytes` when its length is greater than `MAX_PROOF_BYTES`.

In `index.html`, change the proof image to:

~~~html
<img src="/assets/coal-lsl-calculator.webp" width="868" height="580" loading="lazy" decoding="async" fetchpriority="low" alt="Coal LSL calculator result showing Formula B, eligible wages, levy and the applied section 3B branch for a synthetic example" />
~~~

Keep the existing synthetic-example caption and proof links.

Run:

~~~text
python scripts/test_check_design.py
python scripts/check_design.py
~~~

Expected: both commands pass and the refreshed asset satisfies the permanent 80,000-byte limit.

- [ ] **Step 8: Add the explicit lazy-load and decode browser contract**

Add this helper to `tests/browser/site-quality.spec.mjs`:

~~~javascript
async function decodedHomeProof(page) {
  const proof = page.getByRole('img', {
    name: /Coal LSL calculator result showing Formula B/,
  });
  await proof.scrollIntoViewIfNeeded();
  await expect.poll(() => proof.evaluate((image) => (
    image.complete && image.naturalWidth > 0
  ))).toBe(true);
  await proof.evaluate((image) => image.decode());
  return proof;
}
~~~

Add this test:

~~~javascript
test('home proof image loads only when requested and decodes before capture', async ({ page }) => {
  const health = observePageHealth(page);
  await page.goto('/');
  const proof = page.getByRole('img', {
    name: /Coal LSL calculator result showing Formula B/,
  });
  await expect(proof).toHaveAttribute('loading', 'lazy');
  await expect(proof).toHaveAttribute('fetchpriority', 'low');
  await decodedHomeProof(page);
  expect(await proof.evaluate((image) => ({
    width: image.naturalWidth,
    height: image.naturalHeight,
  }))).toEqual({ width: 868, height: 580 });
  health.assertHealthy();
});
~~~

In the existing `home matches its viewport visual baseline` test, call `await decodedHomeProof(page)` after the font wait and before `toHaveScreenshot()`, then call `await page.evaluate(() => scrollTo(0, 0))`. This makes the tracked full-page baseline itself use the required scroll, complete, positive-natural-width and decode sequence while preserving lazy and low-priority delivery.

Run:

~~~text
npx playwright test tests/browser/site-quality.spec.mjs -g "home proof image loads"
~~~

Expected: both viewport projects pass. Do not update visual snapshots in this task.

- [ ] **Step 9: Verify and commit the proof slice**

Run:

~~~text
node --test scripts/capture-coal-lsl-proof.test.mjs
python scripts/test_check_design.py
python scripts/check_design.py
npx playwright test tests/browser/site-quality.spec.mjs -g "home proof image loads"
git diff --check
~~~

Expected: all focused checks pass. The refreshed WebP is 868 by 580 and no larger than 80,000 bytes.

Commit only this slice:

~~~text
git add scripts/capture-coal-lsl-proof.mjs scripts/capture-coal-lsl-proof.test.mjs package.json scripts/check_design.py scripts/test_check_design.py tests/browser/site-quality.spec.mjs index.html assets/coal-lsl-calculator.webp
git diff --cached --check
git commit -m "feat: refresh calculator proof artefact"
~~~

### Task 4: Documentation, visual baselines and whole-site verification

**Files:**
- Modify: `DESIGN.md`
- Modify: `docs/browser-quality-evidence.md`
- Update: `tests/browser/site-quality.spec.mjs-snapshots/homepage-desktop-desktop-chromium-win32.png`
- Update: `tests/browser/site-quality.spec.mjs-snapshots/homepage-mobile-mobile-chromium-win32.png`
- Update: `tests/browser/calculator.spec.mjs-snapshots/calculator-formula-b-result-mobile-mobile-chromium-win32.png`
- Modify locally but do not commit: `GATES.md`

**Interfaces:**
- Consumes: the accepted design, all three implementation commits, the tracked Playwright baselines and nine local Lighthouse reports.
- Produces: current design documentation, inspected visual baselines, measured quality evidence and a clean independently reviewed branch ready for the user's chosen integration path.

- [ ] **Step 1: Record the accepted design system**

Update `DESIGN.md` so it records all of these exact decisions:

- The current refinement date is 29 August 2026 and the design read remains `DESIGN_VARIANCE: 6`, `MOTION_INTENSITY: 2`, `VISUAL_DENSITY: 5`.
- The homepage hero has one route register and a separate trust band; route words do not wrap on wide screens.
- The current proof is a deterministic, fabricated Formula B result-only screenshot at 868 by 580, captured by `npm run capture:coal-lsl-proof` and capped at 80 KB.
- Calculator orientation uses one concise task sentence plus a rate, method and boundary register; its output is a label/value result ledger.
- The catalogue uses a category index, the principles use an asymmetric five-cell composition and mobile primary navigation is one horizontal scroll row.
- The deliberate exceptions remain: true-black dark-only canvas, IBM Plex Serif display face, stamp green as the only accent, square register surfaces, 2px control radius and no generated or stock imagery.

Do not change factual content or claim WCAG conformance.

Run:

~~~text
python scripts/check_design.py
~~~

Expected: PASS.

- [ ] **Step 2: Regenerate and inspect only the three approved visual baselines**

Run:

~~~text
npm run test:browser:update
git status --short tests/browser
~~~

Expected: browser assertions pass and only these tracked images update:

~~~text
tests/browser/site-quality.spec.mjs-snapshots/homepage-desktop-desktop-chromium-win32.png
tests/browser/site-quality.spec.mjs-snapshots/homepage-mobile-mobile-chromium-win32.png
tests/browser/calculator.spec.mjs-snapshots/calculator-formula-b-result-mobile-mobile-chromium-win32.png
~~~

Inspect each image with `view_image` at original detail before accepting it:

- Desktop homepage: the `h1` has exactly two lines; the route register appears once; the trust band follows it; `Engage`, `Adopt` and `Verify` do not wrap; the current proof is visible; the principles have one lead cell and four supporting cells.
- Mobile homepage: the `h1` has no more than three lines; the primary navigation remains one scroll row; the page has no horizontal overflow; the decoded proof is visible rather than an empty frame.
- Mobile calculator result: every label and value is visibly separated, numbers remain aligned and unbroken, the levy is dominant and the explanation is readable.

If any visual condition fails, leave the snapshot unstaged, fix the owning HTML or CSS with a focused failing assertion, rerun its focused test, then rerun `npm run test:browser:update` and inspect all three images again.

- [ ] **Step 3: Run the complete browser matrix**

Run:

~~~text
npm run test:browser
~~~

Expected: every test passes, with only the existing desktop duplicate of the mobile-only calculator screenshot intentionally skipped. Record the actual pass and skip counts rather than copying the earlier 27-pass count.

- [ ] **Step 4: Run and record the performance matrix**

Run:

~~~text
npm run test:lighthouse
~~~

Expected: nine Lighthouse reports, three each for the homepage, Evidence and Coal LSL calculator. Every configured median assertion passes: Performance at least 0.95; Accessibility, Best Practices and SEO exactly 1.00; LCP at most 2,500 ms; CLS at most 0.01; total blocking time at most 200 ms.

Read `work/lighthouse/manifest.json` and its nine report JSON files. Record the actual per-route median Performance, Accessibility, Best Practices, SEO, LCP, CLS and total-blocking-time values in `docs/browser-quality-evidence.md`; do not copy the prior scores when the current run differs.

- [ ] **Step 5: Refresh the evidence record and local gate ledger**

Update `docs/browser-quality-evidence.md` with:

- the 29 August 2026 environment and exact commands;
- the actual browser pass and skip counts;
- the new route uniqueness, deliberate heading lines, keyboard-reachable mobile navigation and catalogue, 320-pixel overflow, first-mobile-viewport calculator and decoded-proof checks;
- the inspected desktop homepage, mobile homepage and calculator-result baselines;
- the current Lighthouse medians from Step 4;
- the continuing limits: Axe and the recorded manual checks are not a complete WCAG audit, and native WebMCP availability remains browser-dependent.

Update only the relevant evidence lines in local `GATES.md`. Keep it untracked and never stage it.

- [ ] **Step 6: Run the final repository verification**

Run every repository-defined check plus the new capture check:

~~~text
python scripts/check_site.py
node --test scripts/capture-coal-lsl-proof.test.mjs
npm run test:browser
npm run test:lighthouse
python scripts/verify_protected_files.py a2b4ab715044c3656edc1619379c37ea66a969a4
git diff --check
git diff --check origin/main...HEAD
npm audit --omit=dev
~~~

Expected: all commands exit 0; the production dependency audit reports zero vulnerabilities; the protected verifier reports that protected files, generated-artifact paths, credential-like filenames and ignored tracked files remain clean.

Run these read-only hygiene audits and inspect their output:

~~~text
git ls-files -ci --exclude-standard
git ls-files | rg -i '(^|/)(\.env($|\.)|id_rsa|id_ed25519|.*\.(pem|key|p12|pfx)|credentials?\.(json|ya?ml)|secrets?\.(json|ya?ml))$'
git ls-files | rg '(^|/)(work|test-results|playwright-report|lighthouse)(/|$)'
Get-NetTCPConnection -LocalPort 4173 -State Listen -ErrorAction SilentlyContinue
git status --short
~~~

Expected: the first four commands print nothing. `git status --short` shows only the intended tracked implementation/documentation changes and untracked `GATES.md`.

- [ ] **Step 7: Apply the design-taste preflight to the finished pages**

Review the implementation against the named design-taste skill and record the result in the final evidence note:

- The 6/2/5 design read and deliberate exceptions remain explicit.
- One dark theme, one green accent and one control radius are used.
- Revised visible copy has no emoji, em dash or en dash.
- The desktop `h1` has two lines and the mobile `h1` has no more than three.
- Exactly one route register exists and homepage technical labels carry evidence rather than decorative ordinal numbers.
- No duplicate call-to-action intent remains.
- Desktop navigation is one line; mobile navigation is one keyboard-scrollable row.
- Exactly five principles remain.
- The proof is a real local calculator result, not generated or fake product imagery.
- No document overflow exists at 320, 390, 768 or 1440 CSS pixels.
- Focus, reduced-motion and forced-colours treatments remain visible.
- Lighthouse confirms LCP below 2.5 seconds, CLS at most 0.01 and total blocking time at most 200 ms.

- [ ] **Step 8: Request an independent implementation review**

Invoke `superpowers:requesting-code-review` with a fresh-context reviewer. Give it the approved spec, this plan, base commit `dfd52dc`, current `HEAD`, repository instructions and the exact verification results. Ask it to review standards and spec compliance, factual/protected-content safety, accessibility, screenshot determinism and capture-script path/network safety.

Fix every confirmed finding with a focused failing test, rerun the affected focused checks and then rerun Step 6. If the reviewer reports no findings, record that result without manufacturing changes.

- [ ] **Step 9: Commit the evidence slice and stop before external integration**

Stage only the durable design documentation and three reviewed snapshots:

~~~text
git add DESIGN.md docs/browser-quality-evidence.md tests/browser/site-quality.spec.mjs-snapshots/homepage-desktop-desktop-chromium-win32.png tests/browser/site-quality.spec.mjs-snapshots/homepage-mobile-mobile-chromium-win32.png tests/browser/calculator.spec.mjs-snapshots/calculator-formula-b-result-mobile-mobile-chromium-win32.png
git diff --cached --check
git commit -m "docs: record taste-led browser evidence"
git diff --check origin/main...HEAD
git status --short
~~~

Expected: the commit succeeds; the only remaining worktree entry is untracked `GATES.md`. Do not push, publish, deploy, open a pull request or merge. Present the completed branch and evidence to the user for a separate integration decision.
