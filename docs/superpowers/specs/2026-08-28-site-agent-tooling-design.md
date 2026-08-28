# Site agent tooling and browser quality

**Status:** Approved by Ryan Duguid on 28 August 2026; revised after the
web-development meta review

**Source baseline:** `a2b4ab715044c3656edc1619379c37ea66a969a4`

## Outcome

Make `duguid.com.au` agent-legible and observable, then add only the local and
public tools that close a named feedback loop. Delivery is a sequence of thin,
independently testable slices, not one six-part batch.

The completed system will provide:

- a concise shared repository contract for Codex and Claude Code
- the Codex installation command for `aus-accounting-mcp`
- one reliable edit to browser to evidence loop, then broader browser quality
  gates
- calculator-scoped, read-only WebMCP tools
- a narrow, read-only Search Console reader for one defined search decision
- a repository skill derived from the commands that have been proven to work

The site remains static GitHub Pages HTML and CSS with JavaScript only on the
existing calculator. No analytics, tracking, application framework, remote
font, service worker or production package runtime is added.

## Baseline

The worktree starts from current `origin/main`. Before design work,
`python scripts/check_site.py` passed the design, SEO, link and 21 levy engine
tests. The live site's Google Search Console verification and sitemap setup are
already complete and must not be repeated.

Chrome 152 on this PC is reserved for AI use. Codex, Node.js, npm, Python and
`uv` are installed. Google Cloud CLI is not installed and will not be added
solely for this work.

## Project-wide constraints

- Keep the homepage script-free.
- Preserve `llms.txt`, `robots.txt`, `sitemap.xml`, the Google verification
  file, rate facts, JSON-LD facts, disclaimers and levy formula behaviour.
- Use fabricated data for automated and browser tests.
- Never read, display, persist in the repository or upload browser credentials,
  OAuth tokens or client records. Search Console read results may appear only
  in the current MCP conversation or operator terminal; never redirect, copy,
  persist, commit or upload them.
- Keep npm packages development-only and exactly pinned in the lockfile.
- Use user-facing Playwright locators, isolated tests and web-first assertions.
- Retain Playwright traces on failure and inspect both transport failures and
  unexpected non-success HTTP responses.
- Require explicit permission for push, pull request, merge or deployment.

## Slice 0: Fast public adoption fix

Add this official Codex command to the homepage Adopt block:

```text
codex mcp add aus-accounting -- uvx aus-accounting-mcp
```

Keep the existing Claude Code and skills commands. Change the heading from two
to three supported commands and label each client. `/#adopt` remains the only
canonical command surface.

Update the authority contract and negative self-tests so the command is
required exactly once inside `#adopt` and rejected elsewhere. Do not change
`llms.txt` or the Australian tax AI agents article.

**Done when:** the focused red-green contract passes and the aggregate source
check stays green.

## Slice 1: Agent-legible observable loop

### Shared repository contract

Add a concise root `AGENTS.md` containing only operational facts. Extend it as
later commands are proven:

- product and static-site boundary
- protected files and data rules
- exact preview, source-check and current browser-check commands; add the
  Lighthouse command in Slice 2
- responsive, keyboard, console, network and accessibility expectations
- definition of done and external-action boundary

Add a tiny `CLAUDE.md` that imports `@AGENTS.md` and contains no duplicated
repository guidance. Keep intermittent release procedure in linked docs and a
later skill rather than the always-loaded contract.

### First browser journey

Add a pinned Playwright development dependency, a Python HTTP-server
configuration and one complete calculator journey at 390 by 844 and 1440 by
1000 CSS pixels. The journey uses labels and roles to:

1. choose the base-rate branch
2. enter fabricated figures that make Formula B win
3. submit the calculator
4. verify branch, eligible wages, levy and explanation
5. verify no horizontal overflow, uncaught exception or unexpected console
   error
6. fail on any unexpected response with status 400 or greater

The expected missing-route response is tested separately and explicitly
allowlisted. Configure Playwright to retain a trace on first retry and upload
the HTML report, trace and screenshots on CI failure.

### Chrome DevTools MCP

Register Google's official `chrome-devtools-mcp` in local Codex configuration.
Resolve the official package version, test it, then pin that version with
`--autoConnect`, usage statistics disabled and CrUX lookups disabled. Enable
Chrome's remote-debugging permission at
`chrome://inspect/#remote-debugging` while retaining its per-session prompt and
controlled-browser banner.

Keep the debugging server on loopback only. Do not inspect cookies, passwords,
history, tokens, storage or unrelated tabs. Acceptance is a local calculator
run with console, network and one performance trace inspected through the MCP.

**Done when:** the calculator journey passes at both viewports, failure traces
are configured, response-status checks are proven with a positive control, and
Chrome DevTools MCP closes the same local browser loop.

## Slice 2: Broader browser quality gates

Expand Playwright coverage to:

- `/`
- `/about/`
- `/evidence/`
- `/rates/super-guarantee/`
- `/tools/australian-tax-ai-agents/`
- `/tools/coal-lsl-levy/`
- the site's missing-route surface

At 390 by 844 and 1440 by 1000, each representative page must have one visible
level-one heading, a main landmark, usable navigation, no horizontal overflow,
no uncaught exception, no unexpected console error, no unexpected response of
400 or greater, and no axe `serious` or `critical` violation. Add a 320 CSS
pixel overflow check.

Commit three stable visual baselines using the pinned Playwright Chromium on
the same Windows CI platform:

- homepage mobile
- homepage desktop
- calculator Formula B result mobile

Wait for local fonts, disable animation and use only a small documented text
rasterisation tolerance.

Run Lighthouse CI three times for the homepage, Evidence and calculator. The
median gates are:

| Measure | Minimum or maximum |
| --- | ---: |
| Performance | at least 0.95 |
| Accessibility | 1.00 |
| Best practices | 1.00 |
| SEO | 1.00 |
| Cumulative layout shift | at most 0.01 |
| Largest contentful paint | at most 2.5 seconds |
| Total blocking time | at most 200 milliseconds |

Measure the clean implementation baseline before freezing these values. If a
threshold is not achievable in pinned CI, bring evidence back to Ryan rather
than weakening it silently.

Complete a manual accessibility pass of the calculator and homepage covering
keyboard-only use, focus visibility, 200 per cent zoom and forced colours.
Automation is evidence, not a claim of accessibility conformance.

**Done when:** the route matrix, visual baselines, Lighthouse medians and manual
accessibility record all pass without changing public facts.

## Slice 3: Calculator WebMCP

Add WebMCP only to `/tools/coal-lsl-levy/`. Registration runs from the top-level
page module and becomes a no-op when
`document.modelContext.registerTool` is unavailable. No polyfill, remote
script, network call or persistent storage is added.

Expose four read-only tools:

| Tool | Outcome |
| --- | --- |
| `calculate_coal_lsl_levy` | Calculates one fabricated monthly scenario |
| `run_coal_lsl_fixture` | Runs an allowlisted synthetic D-series fixture |
| `explain_coal_lsl_method` | Explains a named branch and rounding boundary |
| `get_coal_lsl_evidence` | Returns visible sources, review date and limitations |

Schemas use `additionalProperties: false`, bounded non-negative amounts and
allowlisted bonus frequencies. Tool descriptions refuse names, identifiers,
files and client records. Tools do not read the employee-name field, employee
table, CSV export, cookies, storage or unrelated DOM content.

A pure adapter reuses `assets/levy.mjs`; it does not copy formulas or rounding.
The UI and WebMCP adapter share one explanation function. Returned data includes
the branch, eligible wages, rounded levy, relevant Formula A/B values, rate,
review date, estimate-only boundary and visible sources.

Node tests capture registrations in a stub host and verify tool names, strict
schemas, read-only annotations, deterministic fixtures, invalid-input
refusals, engine parity and unsupported-browser behaviour. Playwright verifies
top-level registration with an init-script stub. Native Chrome discovery is a
manual acceptance check where supported.

**Done when:** one synthetic scenario travels from WebMCP input through the
protected engine to a structured result, with unit and browser evidence.

## Slice 4: Search Console decision loop

The concrete outcome is: given the latest finalised 28-day period and the
preceding 28 days, identify which `duguid.com.au` pages and queries changed
materially in impressions or clicks, then inspect a selected same-domain URL
and confirm current sitemap status. The tool reports data; it does not make or
publish an SEO decision.

Implement a local stdio MCP and CLI locked to
`sc-domain:duguid.com.au` with only:

- `compare_search_performance`
- `inspect_url`
- `list_sitemaps`

Search dimensions are allowlisted to `date`, `page`, `query`, `device` and
`country`. Requests are limited to 90 days and 1,000 rows. URL inspection
accepts HTTPS URLs only under `duguid.com.au` or `www.duguid.com.au`. Responses
state that Search Console can return top rows rather than exhaustive query
data. There are no property, sitemap, indexing or other mutation methods.

Use Google's installed-desktop OAuth flow with only
`https://www.googleapis.com/auth/webmasters.readonly`. Ryan supplies a Desktop
OAuth client file at consent time; Codex does not open or print it. Store the
serialised credential directly in Windows Credential Manager through
`keyring`. Never create a plaintext token file or pass a token through MCP
arguments. Authentication and logout are explicit CLI actions, never MCP
tools.

Keep validation, date-window comparison and response normalisation in a pure
standard-library core. Load OAuth, keyring and MCP dependencies only at the
transport boundary. Unit tests use controlled complete API fixtures and prove
rejection before any HTTP request. Live acceptance requires Ryan's OAuth
consent and one bounded read per method; it never changes Search Console state
or writes response data to the repository.

**Done when:** the CLI and MCP answer the named 28-day comparison and URL/sitemap
questions with read-only, same-property evidence.

## Slice 5: Repository site-quality skill

After all commands are proven, add
`.agents/skills/duguid-site-quality/SKILL.md` and a short linked release
checklist. The skill activates for audits, changes, diagnosis, verification and
release work on this site.

It must tell an agent to read `AGENTS.md`, preserve factual and client-data
boundaries, select checks proportional to the change, close user-visible work
in a browser, retain failure evidence, use Search Console only for an explicit
search task, report unverified items and request permission before external
publication.

Pressure-test the skill with representative prompts and verify it routes a
copy-only edit, calculator change, search investigation and release request to
the correct commands and permission boundary.

**Done when:** the skill describes only commands and workflows demonstrated by
the preceding slices and passes its pressure tests.

## Final verification and independent review

Run:

```text
python scripts/check_site.py
npm ci
npx playwright install chromium
npm run test:browser
npm run test:lighthouse
git diff --check
```

Confirm no report, browser profile, storage state, OAuth material,
`node_modules` path or Search Console response is tracked.

Review the final `origin/main...HEAD` diff from fresh context against this
specification, `AGENTS.md`, the web-development meta and the command/browser
evidence. Findings must be limited to material correctness, regression,
security, accessibility or unmet requirements. Resolve accepted findings and
rerun the affected checks.

No implementation is declared complete while any required check is failing or
unverified. Push, pull request, merge and deployment remain outside this task
without separate explicit permission.

## Planned file boundary

Expected repository work is limited to:

- `AGENTS.md` and `CLAUDE.md`
- `README.md`, `DESIGN.md` and `docs/agent-tooling.md`
- `index.html` and focused authority-contract tests
- calculator WebMCP modules and tests
- `.agents/tools/search-console/` and dependency-free core tests
- `.agents/skills/duguid-site-quality/`
- Playwright, Lighthouse and npm configuration, tests and three snapshots
- `.github/workflows/checks.yml`, `.gitignore` and `scripts/check_site.py`

Local machine changes are limited to Chrome's remote-debugging permission, the
pinned Chrome DevTools MCP registration, the local Search Console MCP
registration and a Windows Credential Manager item created only after Ryan's
OAuth consent.

## Out of scope

- unrelated plugins, DNS, hosting or Google verification changes
- analytics, advertising, tracking, rank promises or indexing requests
- write-capable Search Console tools
- client, employee or taxpayer data in tests or agent tools
- WebMCP on script-free pages
- a framework, bundler, service worker or production dependency
- changed rates, levy formulae, legal interpretation or advice boundaries
- publication without separate permission
