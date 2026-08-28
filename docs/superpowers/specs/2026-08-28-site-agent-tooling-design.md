# Site agent tooling and browser quality

**Status:** Proposed for Ryan Duguid's review

**Date:** 28 August 2026

**Source baseline:** `a2b4ab715044c3656edc1619379c37ea66a969a4`

**Approved direction:** Implement the recommended MCP, browser quality, local
skill, Search Console, WebMCP and Codex adoption improvements

## Objective

Make `duguid.com.au` easier for Ryan and AI coding agents to inspect, test and
improve without changing its factual boundaries, static hosting model or
privacy posture.

The work adds six connected capabilities:

1. an official Chrome DevTools MCP connected to the dedicated AI Chrome profile
2. browser, accessibility, visual-regression and Lighthouse checks in CI
3. a repository-local `duguid-site-quality` Codex skill
4. a narrow, read-only Google Search Console CLI and MCP
5. read-only WebMCP tools on the Coal LSL calculator
6. the official Codex install command for `aus-accounting-mcp`

This is tooling and assurance work, not a visual redesign or a search-ranking
campaign. The homepage remains script-free. The site remains static GitHub
Pages HTML, CSS and the existing calculator JavaScript. No analytics, tracker,
remote font, application framework or production package runtime is added.

## Source state and baseline evidence

The isolated implementation worktree was created from the current
`origin/main` commit shown above. The repository had no uncommitted changes and
passed its complete documented check before this specification was written:

```text
python scripts/check_site.py
```

That check passed the design contract tests, design contracts, SEO self-tests,
SEO checks, link self-tests, all live link checks and 21 levy engine tests.
The live site already has Google Search Console verification and sitemap setup;
this work must not repeat or disturb either setup.

The local machine has Codex, Node.js, npm, Python and `uv`. It has Chrome
152.0.7977.65, which supports Chrome DevTools MCP automatic connection. Google
Cloud CLI is not installed. No `chrome-devtools` MCP is currently registered in
Codex.

## Architecture

The design separates three trust planes.

| Plane | Components | Data boundary |
| --- | --- | --- |
| Local operator | Chrome DevTools MCP, Search Console MCP/CLI, repository skill | Ryan's machine and authorised accounts |
| Repository assurance | source tests, Playwright, axe, visual snapshots, Lighthouse CI | fabricated inputs and public site content only |
| Public runtime | existing static pages plus calculator-scoped WebMCP | browser memory only; no transmission or storage added |

Local credentials and browser state never enter the repository or CI. Browser
test dependencies never enter the public site's runtime. WebMCP tools never
receive employee names, taxpayer identifiers, client records, files or
lodgement instructions.

## 1. Chrome DevTools MCP

Use Google's official `chrome-devtools-mcp` package and Codex's native MCP
configuration. Because Chrome on this PC is reserved for AI use, connect to the
existing Chrome profile with `--autoConnect` rather than maintaining a second
automation profile.

Implementation rules:

- resolve the current official package version during implementation, test it,
  then pin that exact version in the local Codex MCP command
- enable Chrome's remote-debugging permission at
  `chrome://inspect/#remote-debugging`
- retain Chrome's per-session permission prompt and controlled-browser banner
- do not expose a fixed remote-debugging port to the network
- do not read cookies, saved passwords, history, account tokens, local storage
  or unrelated tabs unless Ryan asks for a task that requires it
- use the browser only for the named site, its public dependencies and an
  explicitly requested signed-in service such as Search Console

The local configuration is machine state and is not committed. A repository
guide records the reproducible command, permission boundary, verification
steps and removal command without recording profile data.

Acceptance requires Codex to discover the MCP, connect after Ryan accepts
Chrome's prompt, open a locally served page, inspect its console and network,
and collect a performance trace without accessing unrelated browser state.

## 2. Browser quality and Lighthouse CI

### Dependency boundary

Add a root `package.json` and lockfile containing development-only, exactly
pinned versions of:

- `@playwright/test`
- `@axe-core/playwright`
- `@lhci/cli`

These packages are CI and local-development tools only. No generated bundle,
`node_modules`, third-party script or package runtime is referenced by a public
HTML page. The existing source check remains available without installing npm
packages.

### Playwright matrix

Playwright serves the repository with Python's standard HTTP server and tests
the following representative routes:

- `/`
- `/about/`
- `/evidence/`
- `/rates/super-guarantee/`
- `/tools/australian-tax-ai-agents/`
- `/tools/coal-lsl-levy/`
- a missing route rendered through the site's 404 surface

Run the matrix at 390 by 844 and 1440 by 1000 CSS pixels. Add a focused 320 CSS
pixel overflow check because 320 pixels is an existing design contract.

Each representative page must:

- load with no uncaught page error or unexpected console error
- have no horizontal page overflow
- expose a main landmark, one visible level-one heading and usable navigation
- have no axe `serious` or `critical` violation
- keep keyboard focus visible on the tested primary navigation path

The calculator test must select each payment branch, submit representative
fabricated figures, verify the branch, eligible wages and levy output, exercise
invalid casual-month validation, and confirm that employee aggregation rounds
once on total eligible wages.

### Visual regression

Commit three deliberately small visual baselines:

- homepage at 390 by 844
- homepage at 1440 by 1000
- calculator with a Formula B result at 390 by 844

Use the pinned Playwright Chromium, wait for `document.fonts.ready`, disable
animation, mask no substantive content and allow only a small documented pixel
tolerance for operating-system text rasterisation. Run this job on
`windows-latest` so its platform matches the development machine. A visual
change updates a baseline only when the related site change is intentional and
reviewed.

### Lighthouse CI

Run Lighthouse CI for the homepage, Evidence and the calculator over three
runs per URL. Use the median result and fail when any of these minimums is not
met:

| Category or metric | Required result |
| --- | ---: |
| Performance | 0.95 |
| Accessibility | 1.00 |
| Best practices | 1.00 |
| SEO | 1.00 |
| Cumulative layout shift | at most 0.01 |
| Largest contentful paint | at most 2.5 seconds |
| Total blocking time | at most 200 milliseconds |

Measure the implementation baseline before freezing thresholds. If the clean
source baseline cannot meet one of these values under pinned CI conditions,
record the evidence and revise this specification with Ryan rather than
silently weakening the gate.

### Workflow and artefacts

Keep the existing source-contract job. Add separate browser and Lighthouse
jobs that install from the lockfile. Upload the Playwright report, failed
screenshots and Lighthouse reports when a job fails. Do not upload browser
profiles, storage state, environment variables or Search Console data.

The documented local commands will be:

```text
python scripts/check_site.py
npm ci
npx playwright install chromium
npm run test:browser
npm run test:lighthouse
```

The repository-local skill may orchestrate these commands, but the source
check remains independently usable.

## 3. Repository-local site quality skill

Add `.agents/skills/duguid-site-quality/SKILL.md` with a compact release and
review workflow specific to this repository. It activates for work that asks
Codex to audit, change, verify, release or diagnose `duguid.com.au`.

The skill must require the agent to:

1. read `README.md`, `DESIGN.md`, `SECURITY.md` and applicable repository
   instructions before editing
2. preserve the static-site, factual, human-review and client-data boundaries
3. run focused tests red then green for behaviour changes
4. run the source contract, Playwright and Lighthouse checks appropriate to
   the change
5. inspect the relevant routes with Chrome DevTools MCP when it is available
6. use Search Console only for an explicitly requested search-performance or
   indexing task
7. distinguish fabricated test data from client data
8. report unverified checks and require explicit permission before push,
   pull-request, merge, deployment or other external publication

A short reference file records the representative route matrix and release
evidence checklist. It does not duplicate the whole `DESIGN.md` contract.

## 4. Read-only Google Search Console MCP and CLI

### Scope

Implement a small local tool owned by this repository, defaulted and locked to
the verified property `sc-domain:duguid.com.au`. It exposes only:

- `search_performance`: clicks, impressions, click-through rate and average
  position for a bounded date range, grouped by an allowlisted set of
  dimensions
- `inspect_url`: Google's indexed status for an HTTPS URL under
  `duguid.com.au`
- `list_sitemaps`: the existing sitemap records for the property

There is no add-site, submit-sitemap, delete-sitemap, indexing request,
analytics, advertising or Search Console mutation tool.

Search performance requests are limited to 90 days, at most 1,000 returned
rows and the dimensions `date`, `page`, `query`, `device` and `country`.
Inspection rejects non-HTTPS URLs and any host other than `duguid.com.au` or
`www.duguid.com.au`. Responses label Search Console's known limitation that
query results can be top rows rather than an exhaustive dataset.

### Authentication and secret handling

Use Google's installed-desktop OAuth flow with the single scope:

```text
https://www.googleapis.com/auth/webmasters.readonly
```

Do not install Google Cloud CLI solely for this integration. Use pinned Python
libraries under a `uv` script and open the system browser for Google consent.
Ryan supplies a Desktop OAuth client file at authorisation time. Codex does not
open, print or copy that file.

After consent, serialise the Google credential object directly into Windows
Credential Manager through `keyring`. Do not create a plaintext token file,
put a token in an environment variable, print bearer headers, pass a token in
MCP arguments or commit credential material. The client file is not retained
or copied by the tool after the initial exchange.

Authentication and logout remain explicit CLI actions, not MCP tools. The MCP
may report `authentication required`, but it must never launch consent or
delete a credential in response to an agent tool call.

### Implementation shape

Keep a pure standard-library core for input validation, endpoint construction
and response normalisation. Load Google OAuth, keyring and MCP libraries only
at the local transport boundary. This allows deterministic repository tests to
run without credentials, network access or an authenticated Google account.

The MCP runs over local stdio and marks every exposed tool read-only. The CLI
uses the same service functions and supports JSON output for reproducible
inspection. It writes no query results to the repository.

Register the server in local Codex configuration only after its unauthenticated
tests pass. The registration points to the checked-out script's absolute path;
the setup guide states that moving the repository requires re-running the
registration command.

Live acceptance requires Ryan's explicit browser consent. After that consent,
verify the property identity, run one bounded recent performance query, inspect
the homepage URL and list the existing sitemap. Do not change Search Console
state.

## 5. Calculator-scoped WebMCP

### Runtime boundary

Add WebMCP only to `/tools/coal-lsl-levy/`, the one page that already requires
JavaScript. The homepage and all ordinary article, rate and evaluation pages
remain script-free. Registration uses the main document's top-level module and
does nothing when `document.modelContext.registerTool` is unavailable.

Do not add a polyfill, remote script, network call, analytics event, service
worker or persistent storage. Tool execution stays in the browser and calls
the existing deterministic `assets/levy.mjs` engine.

### Public tools

Register these four read-only tools:

| Tool | Behaviour |
| --- | --- |
| `calculate_coal_lsl_levy` | Calculate one fabricated monthly employee scenario from structured branch inputs |
| `run_coal_lsl_fixture` | Run one allowlisted synthetic D-series fixture already represented by engine tests |
| `explain_coal_lsl_method` | Explain a named section 3B branch, formula choice and rounding boundary |
| `get_coal_lsl_evidence` | Return the page's primary sources, rate review date, disclaimer and unresolved-question boundary |

Every tool uses `additionalProperties: false`, bounded non-negative dollar
amounts, an allowlisted bonus frequency and a `readOnlyHint`. Descriptions tell
agents not to supply names, identifiers or client records. No tool reads the
employee-name field, employee table, CSV export, cookies, storage or unrelated
DOM content.

The calculation tool returns structured numeric fields and plain-language
explanation from one shared adapter. It must expose:

- the statutory branch applied
- eligible wages
- rounded levy and, where relevant, the unrounded amount
- Formula A, Formula B and the winner for section 3B(1)
- the fixed 2.7 per cent rate and review date already stated on the page
- the estimate-only and human-review boundary
- source URLs already visible on the page

The adapter reuses `levy.mjs` and its final-step rounding. It does not copy the
formula into the WebMCP layer. The current UI explanation should use the same
pure explanation function so browser output and agent output cannot drift.
`assets/levy.mjs` formula behaviour remains protected.

### Tests

Add Node tests that stub `document.modelContext`, capture registrations and
assert tool names, strict schemas, read-only annotations, deterministic fixture
results, invalid-input refusals and parity with the levy engine.

Add a Playwright test that installs the stub before page load and confirms the
top-level page registers the tools. Where the installed Chrome exposes native
WebMCP discovery, verify the same tool names through Chrome DevTools MCP. Lack
of native WebMCP in a CI Chromium build is not a reason to add a polyfill.

## 6. Codex installation command

Extend the homepage Adopt block from two supported commands to three. Keep the
existing Claude Code and skills commands and add:

```text
codex mcp add aus-accounting -- uvx aus-accounting-mcp
```

Label the two MCP commands by client so a reader does not paste the wrong
syntax. Keep `/#adopt` as the one canonical installation surface; do not copy
the commands into `llms.txt` or the Australian tax AI agents article.

Update the authority-surface contract and its negative self-tests so the
Codex command is required inside `#adopt`, prohibited elsewhere and covered by
the existing retired-source-install guard.

This change intentionally supersedes `DESIGN.md` references to two supported
commands. It does not change the MCP package, its claims, registry identity or
public source link.

## Test-first implementation contract

Before each production or local-tool behaviour change, add a focused failing
test and observe the expected failure. Required new contracts include:

- the Codex install command is present exactly once and only inside `#adopt`
- the four WebMCP tools have exact names, strict schemas and read-only
  annotations
- WebMCP calculations and explanations remain in parity with the protected
  levy engine
- unsupported WebMCP browsers retain the current calculator behaviour
- Search Console rejects other properties, hosts, schemes, dimensions, date
  spans and excessive row limits before any HTTP request
- Search Console uses only the read-only scope and exposes no mutation method
- credential values are never emitted by logging or structured output
- browser routes have no serious or critical axe violation, console error or
  horizontal overflow
- critical visual snapshots remain within the reviewed tolerance
- Lighthouse gates the three selected routes at the agreed thresholds

Add the new dependency-free Node and Python unit tests to
`scripts/check_site.py`. Keep Playwright and Lighthouse as separate npm checks
because they require installed development packages and a browser.

## Verification

### Repository verification

Run:

```text
python scripts/check_site.py
npm ci
npx playwright install chromium
npm run test:browser
npm run test:lighthouse
git diff --check
```

Confirm no generated report, browser profile, storage state, OAuth material or
`node_modules` path is tracked.

### Local MCP verification

For Chrome DevTools MCP:

1. confirm the configured package name and pinned version
2. accept Chrome's connection prompt
3. inspect the local homepage and calculator console and network
4. capture one local performance trace
5. disconnect and confirm Chrome no longer shows an active control banner

For Search Console MCP:

1. run unauthenticated input and transport tests
2. obtain Ryan's explicit OAuth consent through Chrome
3. confirm the server reports `sc-domain:duguid.com.au`
4. run one bounded read for each exposed method
5. confirm no Search Console state changed and no token or response file was
   created in the repository

### Browser and public-runtime verification

Inspect the complete Playwright route matrix at both primary viewports and the
320 pixel overflow case. Confirm calculator behaviour both with and without a
stubbed WebMCP host. Use Chrome DevTools MCP to verify native tool discovery
when Chrome supports it.

Compare the implementation against the source baseline and confirm:

- homepage JavaScript remains absent
- no public page loads npm or Python dependencies
- current facts, rates, JSON-LD, disclaimers and source links remain unchanged
  except the approved Adopt command copy
- `llms.txt`, `robots.txt`, `sitemap.xml` and Google verification remain
  unchanged
- no tracking, telemetry or credential material was added

## Planned file boundary

Expected repository additions or edits are:

- `docs/superpowers/specs/2026-08-28-site-agent-tooling-design.md`
- `docs/agent-tooling.md`
- `README.md`
- `DESIGN.md`
- `index.html`
- `assets/levy-webmcp.mjs` and, if needed, one small shared levy explanation
  module
- `tools/coal-lsl-levy/index.html`
- `.agents/skills/duguid-site-quality/SKILL.md`
- `.agents/skills/duguid-site-quality/references/release-checklist.md`
- `.agents/tools/search-console/` for the local read-only CLI/MCP
- focused tests under `scripts/`
- `scripts/check_site.py`
- `scripts/site_contracts.py`
- `.github/workflows/checks.yml`
- `package.json`, its lockfile, Playwright configuration and Lighthouse
  configuration
- Playwright specifications and three visual baselines under `tests/`
- `.gitignore` for generated browser and Lighthouse artefacts

Expected local machine changes are:

- Chrome remote debugging enabled with its normal permission prompts retained
- the pinned official Chrome DevTools MCP registered in Codex
- the repository-owned Search Console MCP registered in Codex
- one credential stored in Windows Credential Manager only after Ryan grants
  OAuth consent

Protected from change:

- `llms.txt`
- `robots.txt`
- `sitemap.xml`
- the Google verification file
- rate values and rate-page explanatory copy
- current JSON-LD facts
- advice, registration, privacy and human-review disclaimers
- calculator formula behaviour in `assets/levy.mjs`
- hosting and custom-domain configuration

If implementation evidence shows that a protected file must change, revise
this design with Ryan before editing it.

## Out of scope

- installing Cloudflare, Figma or another unrelated recommended plugin
- changing DNS, hosting, Google verification or sitemap submission
- Google Analytics, advertising, tracking or visitor profiling
- write-capable Search Console tools
- automatic indexing requests or rank promises
- sending client, employee or taxpayer data to an MCP or browser tool
- adding WebMCP to script-free pages
- a framework, bundler, service worker or production package runtime
- changing levy law, rates, formulae, rounding or advice boundaries
- push, pull request, merge or deployment without a separate explicit request

## Review checkpoint

Implementation starts after Ryan reviews this written specification. The two
expected action-time prompts are Chrome's remote-debugging permission and
Google's read-only OAuth consent. Neither prompt may be bypassed or converted
to a broader permission.
