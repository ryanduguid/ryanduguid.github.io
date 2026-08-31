# duguid.com.au Refined Register Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the complete duguid.com.au UI/UX through a small shared-system refinement that tightens the hero, mobile chrome, page rhythm, register density, callout semantics, and GEO verification without changing protected content or site architecture.

**Architecture:** Keep the dependency-free static HTML/CSS architecture. Implement the remaining improvements in the shared stylesheet so every route benefits, add focused contract and browser tests before each CSS change, and use the repository's existing GEO, SEO, accessibility, capture, and Lighthouse checks as the source of truth.

**Tech Stack:** Static HTML, CSS custom properties, Python 3.12 contract checks, Node.js 22, Playwright 1.62.1, Axe, Lighthouse CI.

**Spec:** `docs/superpowers/specs/2026-08-31-duguid-site-system-redesign-design.md`

## Global Constraints

- Preserve the public-register identity, exact routes, canonical URLs, primary navigation labels, sources, rates, disclaimers, professional boundaries, install commands, and JSON-LD facts.
- Preserve the true-black OLED theme, IBM Plex family, stamp-green accent, square geometry, and dark-only colour scheme.
- No framework, template engine, production dependency, animation library, search, filter, generated imagery, theme switcher, or new production JavaScript.
- Use existing CSS selectors and repository helpers before adding a selector or function.
- Keep coral for genuine warning, refusal, destructive, or review-required meaning only.
- Keep body text at least 16px, standalone controls at least 44px, visible keyboard focus, forced-colour support, and reduced-motion support.
- No em dash or en dash in visible site content.
- Do not alter `llms.txt`, `robots.txt`, `sitemap.xml`, rate main text, or structured-data meaning unless a separately reviewed factual correction is required.
- Do not commit, push, publish, or update the deployed site. Leave the completed diff for user review.
- Use `apply_patch` for every source-file edit.

## File Map

- `GATES.md`: local Unlazy completion ledger for this implementation.
- `assets/site.css`: shared layout, density, responsive, callout, and target-state implementation.
- `tests/browser/site-quality.spec.mjs`: viewport, hero-fit, mobile-header, representative-height, overflow, accessibility, and visual checks.
- `scripts/check_design.py`: static design contracts for semantic callout colour roles.
- `scripts/test_contracts.py`: mutation tests proving the new static contracts fail on regression.
- `tests/browser/site-quality.spec.mjs-snapshots/*`: approved homepage visual baselines, updated only after manual inspection.
- `docs/superpowers/specs/2026-08-31-duguid-site-system-redesign-design.md`: approved design authority, read-only during implementation unless a contradiction is discovered.

## Execution Rule

Each task uses one failing check, the smallest implementation that passes it, and a focused rerun. The Unlazy ledger is reverified after any called script changes. Since the repository forbids unrequested commits, every commit step is intentionally omitted.

---

### Task 1: Create the acceptance ledger and record the clean baseline

**Files:**
- Create: `GATES.md`
- Read: `C:/Users/-/.codex/skills/unlazy/SECURITY.md`
- Read: `scripts/check_site.py`
- Read: `package.json`

**Interfaces:**
- Consumes: repository-defined commands from `scripts/check_site.py` and `package.json`.
- Produces: gate ids `G0` through `G6`, used by the final re-verification task.

- [ ] **Step 1: Create the reviewed gate ledger**

Create `GATES.md` with exactly this content:

```markdown
# Gates: duguid.com.au refined register

OWNS: GATES.md, assets/site.css, tests/browser/**, scripts/check_design.py, scripts/test_contracts.py, docs/superpowers/**

Scope: refine the complete static site system while preserving content, accessibility, performance, SEO and GEO contracts

- [ ] G0: this ledger states executable outcomes that can fail
  CHECK: node "C:/Users/-/.codex/skills/unlazy/scripts/gate-lint.mjs" GATES.md
  EXPECT: LINT OK
  EVIDENCE: pending

- [ ] G1: repository static, factual, SEO and GEO contracts pass
  CHECK: python scripts/check_site.py
  EXPECT: site checks passed
  EVIDENCE: pending

- [ ] G2: responsive browser journeys and accessibility checks pass
  CHECK: npm run test:browser
  EXPECT: passed
  EVIDENCE: pending

- [ ] G3: calculator proof and social-card captures remain reproducible
  CHECK: npm run test:capture
  EXPECT: passed
  EVIDENCE: pending

- [ ] G4: Lighthouse meets the repository performance and quality thresholds
  CHECK: npm run test:lighthouse
  EXPECT: Done running autorun
  EVIDENCE: pending

- [ ] G5: normal, keyboard, forced-colour, reduced-motion and 200 per cent zoom states are visually reviewed at 320, 390, 768 and 1440 CSS pixels
  EVIDENCE: pending

- [ ] G6: the final diff passes Ponytail, design-taste, UI/UX and GEO scope review with no protected-content drift
  EVIDENCE: pending
```

- [ ] **Step 2: Lint without executing gate commands**

Run:

```powershell
node "C:/Users/-/.codex/skills/unlazy/scripts/gate-lint.mjs" GATES.md
node "C:/Users/-/.codex/skills/unlazy/scripts/gate-check.mjs" --status GATES.md
```

Expected: `LINT OK` and seven unmet gate outcomes, with no malformed or abandoned gate.

- [ ] **Step 3: Inspect every executable oracle**

Confirm that `G1` calls only the commands listed in `scripts/check_site.py`; confirm that `G2`, `G3`, and `G4` resolve to the scripts in `package.json`; confirm that none prints or transmits credentials.

- [ ] **Step 4: Install locked development dependencies**

Run:

```powershell
npm ci
npx playwright install chromium
```

Expected: both commands exit `0`; `package-lock.json` remains unchanged.

- [ ] **Step 5: Record baseline check results before source changes**

Run:

```powershell
python scripts/check_site.py
npx playwright test tests/browser/site-quality.spec.mjs
npm run test:capture
```

Expected: every command exits `0`. If the current baseline fails, stop and diagnose before changing CSS.

- [ ] **Step 6: Confirm the baseline worktree diff**

Run:

```powershell
git status --short
git diff --check
```

Expected: only the approved spec, implementation plan, and `GATES.md` are new; no generated capture, lockfile, or source changes exist.

---

### Task 2: Fit the homepage proposition and reduce the mobile sticky header

**Files:**
- Modify: `tests/browser/site-quality.spec.mjs:108-148`
- Modify: `tests/browser/site-quality.spec.mjs:173-211`
- Modify: `assets/site.css:890-931`
- Modify: `assets/site.css:1700-1728`

**Interfaces:**
- Consumes: `.site-header`, `.home-hero`, `.home-hero h1`, and `.home-hero__actions`.
- Produces: a two-line desktop H1 at 1280 by 720 and 1440 by 900, visible hero actions, and a mobile sticky header no taller than 88px.

- [ ] **Step 1: Add the failing hero-fit browser test**

Add after the existing homepage adoption test:

```js
test('home proposition and actions fit the initial desktop viewport', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop viewport matrix runs once');

  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await waitForVisualFonts(page);

    const geometry = await page.evaluate(() => {
      const heading = document.querySelector('.home-hero h1');
      const actions = document.querySelector('.home-hero__actions');
      const headingStyle = getComputedStyle(heading);
      const headingBounds = heading.getBoundingClientRect();
      const actionBounds = actions.getBoundingClientRect();
      return {
        lineCount: Math.round(headingBounds.height / parseFloat(headingStyle.lineHeight)),
        actionsBottom: actionBounds.bottom,
        viewportHeight: innerHeight,
      };
    });

    expect(geometry.lineCount, `${viewport.width}px heading lines`).toBeLessThanOrEqual(2);
    expect(geometry.actionsBottom, `${viewport.width}px action position`)
      .toBeLessThanOrEqual(geometry.viewportHeight);
  }
});
```

- [ ] **Step 2: Add the failing mobile-header browser test**

Add after the existing smallest-width navigation test:

```js
test('mobile sticky header preserves the reading viewport', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile contract only');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const height = await page.locator('.site-header').evaluate((header) => (
    Math.round(header.getBoundingClientRect().height)
  ));
  expect(height).toBeLessThanOrEqual(88);
});
```

- [ ] **Step 3: Run the new tests and verify they fail for the intended reasons**

Run:

```powershell
npx playwright test tests/browser/site-quality.spec.mjs --project=desktop-chromium -g "initial desktop viewport"
npx playwright test tests/browser/site-quality.spec.mjs --project=mobile-chromium -g "preserves the reading viewport"
```

Expected: desktop fails because the 1280px H1 occupies three lines; mobile fails because the sticky header is about 97px tall.

- [ ] **Step 4: Implement the smallest shared CSS change**

Change the existing rules to:

```css
.home-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  padding-block: var(--space-8);
}

.home-hero h1 {
  max-width: min(38ch, 100%);
  color: var(--colour-masthead);
  font-size: min(var(--text-display), 5rem);
  line-height: var(--leading-tight);
  letter-spacing: var(--tracking-display);
}
```

Inside `@media (max-width: 40rem)`, change only the header token:

```css
:root {
  --header-height: 5.5rem;
}
```

Do not change H1 copy, actions, navigation, or font tokens.

- [ ] **Step 5: Run the focused tests and navigation regression**

Run:

```powershell
npx playwright test tests/browser/site-quality.spec.mjs --project=desktop-chromium -g "initial desktop viewport"
npx playwright test tests/browser/site-quality.spec.mjs --project=mobile-chromium -g "preserves the reading viewport|all five primary navigation links"
```

Expected: all selected tests pass. The five mobile navigation links remain fully visible and keyboard reachable.

- [ ] **Step 6: Inspect the two hero viewports manually**

Open the local homepage at 1280 by 720 and 390 by 844. Confirm that the desktop H1 reads naturally in two lines, both actions remain visible, the mobile identity and navigation do not collide, and no CTA label wraps.

---

### Task 3: Separate information, provenance, and warning treatments

**Files:**
- Modify: `scripts/check_design.py:391-515`
- Modify: `scripts/test_contracts.py:131-279`
- Modify: `assets/site.css:438-458`
- Modify: `assets/site.css:1127-1132`

**Interfaces:**
- Consumes: `.byline`, `.route-note`, `.route-note.boundary`, `.boundary`, `.disclaimer`, `.unresolved`, and `.rounding-note`.
- Produces: neutral provenance and informational notes, with coral retained for explicit boundary, warning, refusal, and review-required content.

- [ ] **Step 1: Add failing static design contracts**

Inside `check_stylesheets`, after the pressed-button contract, add:

```python
    byline_rule = re.search(r"\.byline\s*\{(.*?)\}", site_css, re.S | re.I)
    if not byline_rule or "--colour-rule-strong" not in byline_rule.group(1):
        failures.append("bylines must use the neutral register rule")

    route_note_rule = re.search(r"\.route-note\s*\{(.*?)\}", site_css, re.S | re.I)
    if not route_note_rule or "--colour-rule-strong" not in route_note_rule.group(1):
        failures.append("informational route notes must use the neutral register rule")

    boundary_note_rule = re.search(
        r"\.route-note\.boundary\s*\{(.*?)\}", site_css, re.S | re.I
    )
    if not boundary_note_rule or "--colour-alert" not in boundary_note_rule.group(1):
        failures.append("boundary route notes must retain the alert rule")
```

- [ ] **Step 2: Add mutation coverage for the new contracts**

Append these entries to `text_mutations`:

```python
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
```

- [ ] **Step 3: Run the static suite and verify the current CSS fails**

Run:

```powershell
python scripts/test_contracts.py
```

Expected: failure reports that bylines and informational route notes do not use the neutral register rule and that no explicit boundary-note override exists.

- [ ] **Step 4: Split the shared callout rules without adding HTML classes**

Replace the combined rule with:

```css
blockquote,
.boundary,
.disclaimer,
.unresolved,
.rounding-note {
  padding: var(--space-4) 0 var(--space-4) var(--space-5);
  border-left: var(--rule-strong) solid var(--colour-alert);
  color: var(--colour-ink-soft);
}

.byline {
  padding: var(--space-4) 0 var(--space-4) var(--space-5);
  border-left: var(--rule-strong) solid var(--colour-rule-strong);
  color: var(--colour-ink-soft);
  margin-top: var(--space-5);
  font-size: var(--text-small);
}
```

Change the route-note rules to:

```css
.route-note {
  padding: var(--space-4) 0 var(--space-4) var(--space-5);
  border-left: var(--rule-strong) solid var(--colour-rule-strong);
  color: var(--colour-ink-soft);
  font-size: var(--text-small);
}

.route-note.boundary {
  border-left-color: var(--colour-alert);
}
```

- [ ] **Step 5: Run contract and browser accessibility checks**

Run:

```powershell
python scripts/test_contracts.py
npx playwright test tests/browser/site-quality.spec.mjs -g "healthy, accessible page shell"
```

Expected: both commands exit `0`; no callout loses textual meaning or accessible contrast.

---

### Task 4: Tighten page rhythm and register density across every route

**Files:**
- Modify: `tests/browser/site-quality.spec.mjs:48-51`
- Modify: `tests/browser/site-quality.spec.mjs:108-148`
- Modify: `assets/site.css:343-435`
- Modify: `assets/site.css:648-673`
- Modify: `assets/site.css:890-937`
- Modify: `assets/site.css:1062-1069`
- Modify: `assets/site.css:1195-1198`

**Interfaces:**
- Consumes: shared `.article-header`, `.article-layout`, `.article-body section`, `.collection-group`, `.collection-entry`, `.home-tool-preview`, `.route-section`, `.principles-section`, and `.more-index` patterns.
- Produces: shorter representative pages without hiding content, reducing font size, or changing document order.

- [ ] **Step 1: Add representative page-height baselines**

Near `homeHeightBaseline`, add:

```js
const representativeHeightBaseline = {
  'mobile-chromium': new Map([
    ['/', 9383],
    ['/tools/', 6237],
    ['/evidence/', 6426],
  ]),
  'desktop-chromium': new Map([
    ['/', 6517],
    ['/tools/', 3961],
    ['/evidence/', 4217],
  ]),
};
```

Add this test after the homepage adoption test:

```js
test('shared rhythm reduces representative route length', async ({ page }, testInfo) => {
  for (const [route, baseline] of representativeHeightBaseline[testInfo.project.name]) {
    await page.goto(route);
    await waitForVisualFonts(page);
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(height, `${route} ${testInfo.project.name}`).toBeLessThan(baseline);
  }
});
```

- [ ] **Step 2: Run the new test and verify baseline failure**

Run:

```powershell
npx playwright test tests/browser/site-quality.spec.mjs -g "shared rhythm reduces"
```

Expected: both projects fail because the current rendered heights meet or exceed the recorded baselines.

- [ ] **Step 3: Apply the minimal shared spacing changes**

Change only these existing declarations:

```css
.article-header,
.calculator-header {
  /* keep display, gap and border declarations unchanged */
  padding-block: var(--space-7) var(--space-6);
}

.article-layout {
  /* keep grid declarations unchanged */
  padding-block: var(--space-6) var(--space-8);
}

.article-body section {
  margin-top: var(--space-7);
  /* keep padding and border unchanged */
}

.collection-group + .collection-group {
  margin-top: var(--space-7);
  /* keep border unchanged */
}

.collection-entry {
  /* keep grid declarations unchanged */
  padding-block: var(--space-4);
}

.home-tool-preview {
  /* keep display and gap unchanged */
  padding-block: var(--space-7);
}

.route-section {
  /* keep grid declarations unchanged */
  padding-block: var(--space-6);
}

.principles-section,
.more-index {
  padding-block: var(--space-8);
}
```

Do not reduce paragraph margins, body text, touch-target padding, or source separation.

- [ ] **Step 4: Run density, overflow, and accessibility tests**

Run:

```powershell
npx playwright test tests/browser/site-quality.spec.mjs -g "shared rhythm reduces|do not overflow|healthy, accessible page shell"
```

Expected: representative heights are below baseline, every tested route remains within the viewport width, and Axe reports no serious or critical violations.

- [ ] **Step 5: Replace generous acceptance ceilings with measured post-change values**

Measure the homepage scroll height in both Playwright projects and replace `homeHeightBaseline` with the next whole 50px above the measured value. Do not copy the prior broad values of 9512 and 7611.

Run:

```powershell
npx playwright test tests/browser/site-quality.spec.mjs -g "home leads with adoption actions"
```

Expected: test passes with the tightened ceilings and fails if the page returns to its former height.

- [ ] **Step 6: Inspect the complete route set at all acceptance widths**

Check homepage, Tools, Evaluations, Rates, Evidence, Workpaper Review Gate, Coal LSL calculator, About, Contact, and 404 at 320, 390, 768, and 1440px. Confirm that the denser rhythm does not merge separate claims, sources, warnings, table rows, or touch targets.

---

### Task 5: Verify GEO without adding a machine-only content layer

**Files:**
- Verify only: `robots.txt`
- Verify only: `llms.txt`
- Verify only: `sitemap.xml`
- Verify only: all indexable `*.html`
- Update evidence only: `GATES.md`

**Interfaces:**
- Consumes: existing crawler groups, canonical URLs, JSON-LD graph, `llms.txt` alternate links, visible machine-index links, short answers, source links, review dates, and canonical Person entity.
- Produces: current evidence that discovery, answerability, entity clarity, citation proximity, and training opt-out remain intact.

- [ ] **Step 1: Re-read current official crawler guidance**

Verify the current user-agent names and purposes against:

```text
https://help.openai.com/en/articles/12627856-publishers-and-developers-faq
https://support.anthropic.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler
https://docs.perplexity.ai/docs/resources/perplexity-crawlers
```

Expected: `OAI-SearchBot`, `Claude-SearchBot`, user-requested retrieval agents, and `PerplexityBot` remain search/retrieval agents; `GPTBot` and `ClaudeBot` remain separable training crawlers. If official names changed, stop for a separately reviewed policy change because `robots.txt` is protected.

- [ ] **Step 2: Run the existing GEO and authority mutation suite**

Run:

```powershell
python scripts/test_contracts.py
python scripts/check_seo.py
python scripts/check_design.py
```

Expected: all three commands exit `0`; crawler classification, canonical Person authorship, sitemap and `llms.txt` coverage, structured-data parity, visible machine-index access, and protected files pass.

- [ ] **Step 3: Inspect answerability and citation proximity on representative pages**

For Homepage, Tools, Rates, Super Guarantee, Evidence, Workpaper Review Gate, and Coal LSL Calculator, record in `GATES.md` manual evidence that:

```text
main question appears in the H1 and first concise answer
important rate or software claim is visible HTML text
primary source or released artefact is adjacent to the claim
review date or version is visible near the source
human decision boundary is visible on the same page
```

Do not add text solely to satisfy this review. If a page fails, make the smallest visible, people-first correction and update protected baselines only with explicit user approval.

- [ ] **Step 4: Confirm no protected GEO file changed**

Run:

```powershell
git diff -- robots.txt llms.txt sitemap.xml
```

Expected: no diff.

---

### Task 6: Update approved visual baselines and complete every gate

As-built note: Task 6 rejected the superseded narrow candidate after rendered inspection and accepted 38ch following focused RED/GREEN verification.

**Files:**
- Modify after inspection: `tests/browser/site-quality.spec.mjs-snapshots/homepage-mobile-mobile-chromium-win32.png`
- Modify after inspection: `tests/browser/site-quality.spec.mjs-snapshots/homepage-desktop-desktop-chromium-win32.png`
- Update evidence: `GATES.md`

**Interfaces:**
- Consumes: all tasks, repository commands, approved spec, and Unlazy ledger.
- Produces: final verified working tree with no unmet or abandoned gate.

- [ ] **Step 1: Generate candidate visual baselines**

Run:

```powershell
npx playwright test tests/browser/site-quality.spec.mjs -g "home matches its viewport visual baseline" --update-snapshots
```

Expected: only the two homepage snapshot files change.

- [ ] **Step 2: Inspect both snapshots before accepting them**

Check desktop and mobile for:

```text
two-line desktop H1
visible primary and secondary actions
single-line CTA labels
five visible mobile navigation routes
no clipped type or proof media
consistent stamp-green accent
neutral information and provenance rules
coral only on explicit warning or boundary content
no layout family repeated into visual monotony
```

If either image fails, fix CSS and regenerate. Do not accept a snapshot merely because the command produced it.

- [ ] **Step 3: Run the design and repository static checks**

Run:

```powershell
python scripts/check_site.py
git diff --check
```

Expected: `site checks passed` and no whitespace errors.

- [ ] **Step 4: Run the complete browser and capture suites**

Run:

```powershell
npm run test:browser
npm run test:capture
```

Expected: both commands exit `0` with all tests passed.

- [ ] **Step 5: Run Lighthouse medians**

Run:

```powershell
npm run test:lighthouse
```

Expected: repository thresholds pass: performance at least 0.95; accessibility, best practices, and SEO equal 1; CLS at most 0.01; LCP at most 2500ms; total blocking time at most 200ms.

- [ ] **Step 6: Complete manual accessibility states**

At 320, 390, 768, and 1440 CSS pixels, verify keyboard order, focus visibility, forced colours, reduced motion, 200 per cent zoom, table overflow labels, code scrolling, link purpose, and touch-target size. Record concise evidence in `GATES.md` for `G5`.

- [ ] **Step 7: Run the design-skills preflight and Ponytail review**

Confirm:

```text
no added dependency or production JavaScript
no new framework, search, filter, or speculative abstraction
one accent and one theme
consistent square geometry
no em dash, en dash, gradient, glow, decorative dot, pill, fake screenshot, or generated imagery
hero fits the initial desktop viewport
no duplicate CTA intent
no broken button contrast or wrapping
all collection and article layouts collapse explicitly below 768px
all visible copy reads naturally in Australian English
```

Record concise evidence in `GATES.md` for `G6`.

- [ ] **Step 8: Inspect and approve every gate command before execution**

Run status first:

```powershell
node "C:/Users/-/.codex/skills/unlazy/scripts/gate-check.mjs" --status GATES.md
```

Read each `CHECK`, `EXPECT`, resolved working directory, shell, and called script. Then approve and execute only the reviewed commands:

```powershell
node "C:/Users/-/.codex/skills/unlazy/scripts/gate-check.mjs" --approve GATES.md
```

Expected: runnable gates record fresh evidence. Add the manual `G5` and `G6` evidence only from the completed reviews.

- [ ] **Step 9: Reverify all runnable gates after final edits**

Run:

```powershell
node "C:/Users/-/.codex/skills/unlazy/scripts/gate-check.mjs" --reverify GATES.md
node "C:/Users/-/.codex/skills/unlazy/scripts/gate-check.mjs" --status GATES.md
```

Expected: `ALL MET`, zero unmet gates, zero abandoned gates.

- [ ] **Step 10: Re-read the request and inspect the final diff**

Run:

```powershell
git status --short
git diff --stat
git diff -- assets/site.css tests/browser/site-quality.spec.mjs scripts/check_design.py scripts/test_contracts.py
```

Expected: the diff is limited to the approved shared-system refinements, focused tests, inspected snapshots, spec, plan, and local gate ledger. No lockfile, crawler-policy, structured-data, rate, calculator, or unrelated change appears.

## Handoff

Report the measured gate counts, exact validation commands, Lighthouse outcome, manual viewport/accessibility evidence, protected files confirmed unchanged, and any remaining uncertainty. Do not claim completion while a required gate is unmet or abandoned.
