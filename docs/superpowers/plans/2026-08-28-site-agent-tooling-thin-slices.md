# Site Agent Tooling Thin-Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `duguid.com.au` agent-legible and observable, then add the
approved browser, WebMCP and read-only Search Console loops as independently
testable slices.

**Architecture:** Keep the public site static and isolate local operator tools
from public runtime code. Establish one calculator browser journey first,
expand the quality matrix second, then add calculator WebMCP, Search Console
and the repository skill only after their dependencies are proven.

**Tech Stack:** Static HTML/CSS, native ES modules, Python 3.12+ standard
library, Node.js 22, Playwright 1.62.1, axe 4.13.0, Lighthouse CI 0.15.1,
Chrome DevTools MCP 1.8.0, MCP Python SDK 2.1.1, Google Auth 2.57.0,
Google Auth OAuthlib 1.4.1 and keyring 25.7.0.

**Spec:** `docs/superpowers/specs/2026-08-28-site-agent-tooling-design.md`

## Global Constraints

- Work only on `codex/duguid-site-agent-tooling`, based on
  `a2b4ab715044c3656edc1619379c37ea66a969a4`.
- Keep the homepage script-free and all npm packages development-only.
- Preserve `llms.txt`, `robots.txt`, `sitemap.xml`, the Google verification
  file, rate facts, JSON-LD facts, disclaimers and `assets/levy.mjs` formula
  behaviour.
- Use fabricated inputs only. Never inspect, display, commit or upload browser
  credentials, OAuth material or client records. Search Console read results
  may appear only in the current MCP conversation or operator terminal; never
  redirect, copy, persist, commit or upload them.
- Use user-facing Playwright locators, web-first assertions and isolated tests.
- Do not push, open a pull request, merge or deploy.
- Use Australian English in original prose and preserve exact product names,
  commands and identifiers.

---

### Task 1: Commit the revised thin-slice design and plan

**Files:**

- Modify: `docs/superpowers/specs/2026-08-28-site-agent-tooling-design.md`
- Create: `docs/superpowers/plans/2026-08-28-site-agent-tooling-thin-slices.md`

**Interfaces:**

- Consumes: Ryan's approval to revise and proceed.
- Produces: the durable slice contract used by every later task.

- [ ] **Step 1: Check the revised documents for placeholders and whitespace errors**

Run:

```powershell
$markers = @('T' + 'BD', 'TO' + 'DO', 'FIX' + 'ME', 'implement ' + 'later', 'fill in ' + 'details')
Select-String -Path docs/superpowers/specs/2026-08-28-site-agent-tooling-design.md,docs/superpowers/plans/2026-08-28-site-agent-tooling-thin-slices.md -Pattern $markers
git diff --check
```

Expected: `rg` finds no matches and `git diff --check` exits zero.

- [ ] **Step 2: Commit the approved revision**

```text
git add docs/superpowers/specs/2026-08-28-site-agent-tooling-design.md docs/superpowers/plans/2026-08-28-site-agent-tooling-thin-slices.md
git commit -m "docs: split site tooling into thin slices"
```

Expected: one documentation commit and a clean worktree.

### Task 2: Add the Codex adoption command

**Files:**

- Modify: `scripts/test_check_seo.py`
- Modify: `scripts/site_contracts.py`
- Modify: `index.html`
- Modify: `DESIGN.md`

**Interfaces:**

- Consumes: `check_authority_surface(root)` and the homepage `#adopt` block.
- Produces: `CODEX_MCP_INSTALL_PATTERN` and a required visible Codex command.

- [ ] **Step 1: Write a failing authority-surface test**

Add a temporary-root fixture that places this command outside `#adopt`:

```python
<pre>codex mcp add aus-accounting -- uvx aus-accounting-mcp</pre>
```

Call `contracts.check_authority_surface(root)` and assert it contains:

```python
"index.html: install commands must appear only inside #adopt"
```

Name the break: moving the Codex command outside its canonical surface must be
rejected.

- [ ] **Step 2: Run the focused test and observe RED**

Run:

```text
python scripts/test_check_seo.py
```

Expected: assertion failure because the current contract does not recognise the
Codex command.

- [ ] **Step 3: Add the minimal command contract**

In `scripts/site_contracts.py`, define and include:

```python
CODEX_MCP_INSTALL_PATTERN = (
    r"\bcodex\s+mcp\s+add\s+aus-accounting\s+--\s+uvx\s+aus-accounting-mcp\b"
)

PRIMARY_INSTALL_PATTERNS = (
    r"\bclaude\s+mcp\s+add\s+aus-accounting\s+--\s+uvx\s+aus-accounting-mcp\b",
    CODEX_MCP_INSTALL_PATTERN,
    r"\bnpx\s+skills\s+add\s+ryanduguid/australian-accounting-skills\b",
)
```

Run the focused test again. Expected: the negative fixture passes, while the
real site check now reports the missing required command.

- [ ] **Step 4: Add the visible homepage command**

Change the Adopt heading to `Three supported commands`. Keep the current Claude
Code and skills lines, then add:

```html
<span class="comment"># Australian Accounting &amp; Tax MCP server for Codex</span>
<span class="cmd">codex mcp add aus-accounting -- uvx aus-accounting-mcp</span>
```

Update `DESIGN.md` from two to three supported commands without changing other
homepage copy or machine-readable files.

- [ ] **Step 5: Verify GREEN and commit the slice**

Run:

```text
python scripts/test_check_seo.py
python scripts/check_seo.py
python scripts/check_site.py
git diff --check
```

Expected: all commands pass.

Commit:

```text
git add index.html DESIGN.md scripts/site_contracts.py scripts/test_check_seo.py
git commit -m "feat: add Codex MCP adoption command"
```

### Task 3: Establish the shared contract and first browser loop

**Files:**

- Create: `AGENTS.md`
- Create: `CLAUDE.md`
- Create: `package.json`
- Create: `package-lock.json`
- Create: `playwright.config.mjs`
- Create: `tests/browser/health.mjs`
- Create: `tests/browser/calculator.spec.mjs`
- Modify: `.gitignore`
- Modify: `README.md`
- Modify: `.github/workflows/checks.yml`
- Local only: Codex MCP configuration and Chrome remote-debugging setting

**Interfaces:**

- Consumes: `python -m http.server 4173`, the calculator's visible labels and
  result status region.
- Produces: `observePageHealth(page, allowedResponse)` returning
  `{ assertHealthy() }`, `npm run test:browser`, and a pinned
  `chrome-devtools` MCP.

- [ ] **Step 1: Add the development package manifest**

Create `package.json` with exact development dependencies and scripts:

```json
{
  "name": "duguid-site-quality",
  "private": true,
  "type": "module",
  "scripts": {
    "test:browser": "playwright test",
    "test:browser:update": "playwright test --update-snapshots"
  },
  "devDependencies": {
    "@playwright/test": "1.62.1"
  }
}
```

Run `npm install --package-lock-only` and confirm the lockfile pins the same
top-level versions.

- [ ] **Step 2: Write the calculator browser test before its health helper**

Create a Playwright test using `getByRole` and `getByLabel` that enters base pay
`6000`, overtime `3000` and allowances `500`, submits, then expects Formula B,
eligible wages `$7,125.00` and levy `$192.38` in the result region.

Import the not-yet-created helper:

```js
import { observePageHealth } from './health.mjs';
```

Name the break: a browser flow that renders the wrong formula/result or emits a
browser/network error must fail.

- [ ] **Step 3: Add Playwright configuration and observe RED**

Configure mobile and desktop projects, a `127.0.0.1:4173` Python HTTP server,
one CI retry, `trace: 'on-first-retry'`, failure screenshots and HTML output
under `work/playwright-report`.

Run:

```text
npm ci
npx playwright install chromium
npm run test:browser
```

Expected: module resolution fails for `health.mjs`.

- [ ] **Step 4: Implement the minimal browser-health helper**

The helper subscribes to `pageerror`, error-level `console`, `requestfailed`
and `response`. Its `assertHealthy()` throws one combined error when any event
was recorded. A response is unhealthy when `status() >= 400` and the supplied
allowlist predicate returns false.

Do not ignore favicon, console or HTTP errors globally. The only allowlist is
passed by the missing-route test in Task 4.

- [ ] **Step 5: Verify the calculator journey GREEN**

Run `npm run test:browser`.

Expected: both viewport projects pass, the result assertions use visible text,
and no error is collected.

- [ ] **Step 6: Add concise repository contracts**

Create `AGENTS.md` with the exact preview and check commands, protected paths,
browser evidence requirements, fabricated-data boundary, definition of done
and external-action rule. Keep it under 120 lines.

Create `CLAUDE.md` as:

```markdown
@AGENTS.md

## Claude Code

- Follow the shared repository contract above.
```

Update `README.md` with npm install and browser commands. Add
`work/test-results/`, `work/playwright-report/` and `node_modules/` to
`.gitignore`.

- [ ] **Step 7: Add the Windows browser CI job**

Extend the workflow with a `browser` job on `windows-latest` that checks out,
sets up Python 3.12 and Node 22, runs `npm ci`, installs Playwright Chromium and
runs `npm run test:browser`. Upload `work/playwright-report` and
`work/test-results` on failure only; never upload a browser profile or storage
state.

- [ ] **Step 8: Register and verify Chrome DevTools MCP locally**

Run:

```text
codex mcp add --env CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS=1 chrome-devtools -- npx -y chrome-devtools-mcp@1.8.0 --autoConnect --no-performance-crux
codex mcp get chrome-devtools
```

Enable Chrome remote debugging at `chrome://inspect/#remote-debugging` and
accept Chrome's per-session prompt. Inspect the locally served calculator's
console, network and one performance trace without opening unrelated tabs or
storage.

- [ ] **Step 9: Verify and commit the slice**

Run:

```text
python scripts/check_site.py
npm ci
npm run test:browser
git diff --check
```

Commit all repository files in this task as:

```text
git commit -m "test: add observable browser quality loop"
```

Do not commit local Codex or Chrome configuration.

### Task 4: Expand browser, accessibility, visual and Lighthouse gates

**Files:**

- Create: `tests/browser/site-quality.spec.mjs`
- Create: `tests/browser/site-quality.spec.mjs-snapshots/*-win32.png`
- Create: `lighthouserc.cjs`
- Create: `docs/browser-quality-evidence.md`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `AGENTS.md`
- Modify: `.gitignore`
- Modify: `.github/workflows/checks.yml`
- Modify: `README.md`

**Interfaces:**

- Consumes: `observePageHealth`, Playwright projects and the local HTTP server.
- Produces: the seven-route matrix, three visual baselines and
  `npm run test:lighthouse`.

- [ ] **Step 1: Add the route and positive-control tests**

Install the slice-specific dependencies and add the Lighthouse script:

```text
npm install --save-dev --save-exact @axe-core/playwright@4.13.0 @lhci/cli@0.15.1
```

Add `"test:lighthouse": "lhci autorun"` to `package.json` and
`work/lighthouse/` to `.gitignore`.

For every approved route, navigate, assert one visible `h1`, `main#main`,
primary navigation and `scrollWidth <= clientWidth`, then run AxeBuilder and
fail for serious or critical violations.

Add two missing-route tests:

```js
test('health collector catches a non-success response', async ({ page }) => {
  const health = observePageHealth(page);
  await page.goto('/definitely-missing-agent-test');
  expect(() => health.assertHealthy()).toThrow(/404/);
});

test('known missing-route response is explicitly allowed', async ({ page }) => {
  const health = observePageHealth(page, response =>
    response.status() === 404 && response.url().endsWith('/definitely-missing-agent-test'));
  await page.goto('/definitely-missing-agent-test');
  health.assertHealthy();
});
```

Run the file and observe failures for the not-yet-added Axe import/route
implementation, then implement only the matrix needed to pass.

- [ ] **Step 2: Add three visual assertions**

Wait for `document.fonts.ready`, disable animations and add `toHaveScreenshot`
for homepage mobile, homepage desktop and the mobile Formula B result. Set
`maxDiffPixelRatio` to `0.01` and do not mask substantive content.

Generate baselines with:

```text
npm run test:browser:update
```

Rerun without update and expect all snapshots to pass.

- [ ] **Step 3: Add Lighthouse configuration and run the baseline**

Configure the three URLs, three runs, filesystem output under
`work/lighthouse`, and the approved category/metric assertions. Run:

```text
npm run test:lighthouse
```

Expected: all assertions pass. If a clean-source category misses a threshold,
stop and report the measured evidence rather than changing the spec.

- [ ] **Step 4: Add CI and manual evidence**

Add an Ubuntu Lighthouse job and failure-artifact upload. Record browser
version, date, keyboard-only navigation, focus, 200 per cent zoom and forced
colours results in `docs/browser-quality-evidence.md`. Do not claim WCAG
conformance.

- [ ] **Step 5: Verify and commit the slice**

Run the complete source, browser, Lighthouse and diff checks. Commit as:

```text
git commit -m "test: gate rendered site quality"
```

### Task 5: Add calculator WebMCP as one vertical slice

**Files:**

- Create: `assets/levy-explanation.mjs`
- Create: `assets/levy-webmcp.mjs`
- Create: `scripts/levy-webmcp.test.mjs`
- Modify: `tools/coal-lsl-levy/index.html`
- Modify: `scripts/check_site.py`
- Modify: `scripts/site_contracts.py`
- Modify: `scripts/test_check_seo.py`
- Modify: `tests/browser/calculator.spec.mjs`

**Interfaces:**

- Consumes: `baseRateWages`, `annualSalaryWages`, `casualWages`, `grossUp`,
  `toCents` and `levyCents` from `assets/levy.mjs`.
- Produces: `explainLevyResult(result)`, `calculateScenario(input)`,
  `coalLslTools()` and `registerCoalLslTools(modelContext)`.

- [ ] **Step 1: Write failing Node tests for the wished-for API**

Assert:

- Formula B input returns literal eligible wages `712500` cents and levy
  `19238` cents.
- unknown keys, negative amounts, invalid bonus frequencies and branch-missing
  required fields throw.
- `coalLslTools()` returns exactly four names and every schema has
  `additionalProperties: false` with `readOnlyHint: true`.
- a stub `registerTool` receives all four definitions.
- an absent model context returns `false` without throwing.

Run `node --test scripts/levy-webmcp.test.mjs` and observe module-not-found RED.

- [ ] **Step 2: Extract the shared explanation with no text change**

Move the current `money` and `explain` behaviour into
`assets/levy-explanation.mjs`, export `money` and `explainLevyResult`, then
import them from the calculator page. Run the existing levy and browser tests
to prove UI parity.

- [ ] **Step 3: Implement the minimal pure WebMCP adapter**

Validate a strict input object, translate dollars to cents once, call the
protected engine branch and return structured cents/dollar display values,
branch/formula data, explanation, the current rate/review date, visible source
URLs and the estimate-only boundary.

Implement named synthetic fixtures from the existing D-series tests. Do not
accept names, identifiers, files or arbitrary URLs.

- [ ] **Step 4: Register from the top-level calculator module**

Import `registerCoalLslTools` and call it at top level. Unsupported browsers are
a no-op. Add a static contract that requires the WebMCP module import only on
the calculator page and retains the direct protected engine import.

- [ ] **Step 5: Add browser discovery coverage**

Use `page.addInitScript` to install a `document.modelContext.registerTool` stub
before navigation. Assert the calculator registers the exact four tool names
and still completes the Formula B UI journey.

- [ ] **Step 6: Verify and commit the slice**

Run Node unit tests red/green evidence, the aggregate source check, Playwright,
Lighthouse and diff check. Commit as:

```text
git commit -m "feat: expose read-only Coal LSL WebMCP tools"
```

### Task 6: Add the read-only Search Console decision loop

**Files:**

- Create: `.agents/tools/search-console/core.py`
- Create: `.agents/tools/search-console/server.py`
- Create: `.agents/tools/search-console/README.md`
- Create: `scripts/test_search_console.py`
- Modify: `scripts/check_site.py`
- Create: `docs/agent-tooling.md`

**Interfaces:**

- Consumes: Google Search Console Search Analytics, URL Inspection and Sitemaps
  read APIs plus a credential retrieved from Windows Credential Manager.
- Produces: `comparison_windows(end_date, days=28)`,
  `build_search_request(...)`, `validate_site_url(url)`,
  `compare_search_rows(current, previous, dimensions)`, and shared CLI/MCP tools
  `compare_search_performance`, `inspect_url`, `list_sitemaps`.

- [ ] **Step 1: Write failing dependency-free core tests**

Use complete literal fixtures to assert:

- a 28 August 2026 end date yields current 1 to 28 August and previous 4 to 31
  July inclusive
- dates over 90 days, row limits over 1,000 and unknown dimensions fail
- HTTP or other-domain inspection URLs fail before any transport call
- row comparison returns current, previous and delta clicks/impressions with a
  stable absolute-impression-delta sort
- empty and missing rows normalise to zero without losing dimension keys

Run `python scripts/test_search_console.py` and observe import-not-found RED.

- [ ] **Step 2: Implement the pure core and add it to the aggregate check**

Use `datetime.date`, `urllib.parse` and plain dictionaries only. Emit the
success token `search console core tests passed` after all assertions. Add the
test command to `scripts/check_site.py` and rerun the aggregate.

- [ ] **Step 3: Implement the pinned local transport**

Give `server.py` PEP 723 dependencies:

```text
mcp==2.1.1
google-auth==2.57.0
google-auth-oauthlib==1.4.1
keyring==25.7.0
```

Build an `MCPServer` with three tools annotated by
`ToolAnnotations(read_only_hint=True, idempotent_hint=True)`. Use stdio by
default and keep stdout protocol-clean.

Use only `https://www.googleapis.com/auth/webmasters.readonly`. Store
`Credentials.to_json()` directly under the service
`duguid-search-console` and account `sc-domain:duguid.com.au` in keyring. The
`auth` and `logout` CLI commands are not MCP tools.

- [ ] **Step 4: Add network-free transport self-tests**

Add `self-test` to build the MCP server in memory, list tools and assert the
three names and read-only annotations without loading a credential or calling
Google. Run:

```text
uv run --locked --script .agents/tools/search-console/server.py self-test
```

Expected: `search console transport self-test passed`.

- [ ] **Step 5: Register the local MCP without authenticating**

Resolve the absolute script path and run:

```text
codex mcp add duguid-search-console -- uv run --locked --script C:\Users\-\Documents\Codex\2026-08-28\wha-5\work\duguid-site-agent-tooling\.agents\tools\search-console\server.py
codex mcp get duguid-search-console
```

Document that moving the checkout requires re-registration. Do not run `auth`
until Ryan supplies a Desktop OAuth client path and accepts Google's exact
read-only scope.

- [ ] **Step 6: Verify and commit the unauthenticated slice**

Run core, transport, aggregate, browser, Lighthouse and diff checks. Commit as:

```text
git commit -m "feat: add read-only Search Console MCP"
```

Live Search Console calls remain a named manual gate until OAuth consent.

### Task 7: Add the repository site-quality skill from proven commands

**Files:**

- Create: `.agents/skills/duguid-site-quality/SKILL.md`
- Create: `.agents/skills/duguid-site-quality/references/release-checklist.md`
- Create: `.agents/skills/duguid-site-quality/evals/evals.json`
- Create: `scripts/test_duguid_site_quality_skill.py`
- Modify: `docs/agent-tooling.md`

**Interfaces:**

- Consumes: `AGENTS.md` and every command proven by Tasks 2 through 6.
- Produces: a discoverable skill that routes site work to proportional checks
  and permission boundaries.

- [ ] **Step 1: Load the skill-authoring workflows**

Read the complete `skill-creator` and `superpowers:writing-skills` instructions
before creating any skill file.

- [ ] **Step 2: Write failing skill evaluations**

Create four prompts for copy-only, calculator, Search Console and release work.
Their expectations require respectively focused source checks, browser plus
levy checks, explicit read-only search scope, and a publication permission
stop.

Run the skill evaluation mechanism specified by the authoring workflow and
observe the missing-skill failures.

- [ ] **Step 3: Write the minimal skill and checklist**

Keep `SKILL.md` concise. Link to `AGENTS.md` and the checklist rather than
duplicating commands. Include triggers, proportional routing, browser evidence,
fabricated-data and credential boundaries, Search Console limits and external
action approval.

- [ ] **Step 4: Pressure-test and commit the skill**

Run all four evaluations, fix material routing gaps and validate the skill
package. Commit as:

```text
git commit -m "feat: add duguid site quality skill"
```

### Task 8: Final verification and review

**Files:**

- Create: `scripts/verify_protected_files.py`
- Modify other files only when a verified defect requires a focused fix.

**Interfaces:**

- Consumes: the complete branch, specification, shared contract and retained
  evidence.
- Produces: a verified local branch and explicit handoff for any consent or
  publication step.

- [ ] **Step 1: Run every repository-defined check from a clean dependency state**

```text
python scripts/check_site.py
npm ci
npx playwright install chromium
npm run test:browser
npm run test:lighthouse
uv run --locked --script .agents/tools/search-console/server.py self-test
git diff --check
git status --short
```

Expected: all checks pass and only intended tracked files differ from
`origin/main`.

- [ ] **Step 2: Verify protected files and secret absence**

Compare `llms.txt`, `robots.txt`, `sitemap.xml`, the Google verification file
and `assets/levy.mjs` against the source baseline. Inspect the file list, not
secret contents, to confirm no token, OAuth client, browser profile, storage
state, report directory or `node_modules` path is tracked.

Implement `scripts/verify_protected_files.py` as a small `git diff --quiet`
wrapper over those exact paths. It prints `protected files unchanged` only
after Git reports no differences.

- [ ] **Step 3: Run a material fresh-context diff review**

Review `git diff origin/main...HEAD` against the spec, `AGENTS.md` and the
supplied web-development meta. Report only correctness, regression, security,
accessibility and unmet-requirement findings. Fix accepted findings with a
failing test first and rerun affected checks.

- [ ] **Step 4: Reverify completion gates and report**

Re-run every runnable gate, count met/unmet/manual items, and report:

- commits and files changed
- exact command outcomes
- browser routes and interactions checked
- Lighthouse medians
- Chrome DevTools MCP status
- Search Console MCP status and whether OAuth/live reads remain pending
- manual accessibility evidence
- unverified external publication steps

Do not push, publish or claim live deployment.
