# Local agent tooling

The site's agent-facing loops stay narrow and keep production hosting static.
They do not add analytics, tracking, a framework or a production package
runtime.

## Browser quality

Run the repository-defined checks from the repository root:

```powershell
site-tools check_site
npm run test:capture
npm run test:browser
npm run test:lighthouse
```

The focused capture check renders fabricated proof without changing the tracked
image. Playwright covers routes, interaction, accessibility and visual
snapshots. Lighthouse records repeat-run medians for the selected public
journeys. Failure artefacts stay under ignored local output paths; do not
commit them.

## WebMCP pilot

Twenty-one calculator pages each offer one WebMCP tool to a browser's built-in agent
through the draft [WebMCP](https://webmachinelearning.github.io/webmcp/)
`modelContext` API: `calculate_gst`, `calculate_div7a_minimum_repayment`,
`calculate_loan_schedule`, `calculate_hire_purchase_schedule`, `calculate_break_even`, `calculate_company_tax`,
`calculate_foreign_purchaser_surcharges`, `calculate_long_service_leave`, `calculate_fuel_tax_credits` and `calculate_borrowing_expenses` on the business calculator pages,
`estimate_income_tax`, `calculate_take_home_pay`, `calculate_sole_trader_set_aside`, `calculate_division_293_tax`,
`calculate_bonus_withholding`, `calculate_income_tests`, `calculate_salary_packaging`, `calculate_novated_lease` and
`project_super_balance` on the income tax, take-home pay, sole trader set-aside, Division 293, bonus withholding, income
tests, salary packaging, novated lease and super projection calculators, `calculate_decline_in_value` on the depreciation rates page and
`calculate_coal_lsl_levy` on the Coal LSL levy calculator.
`assets/accounting-pages.mjs`, `assets/depreciation-calculator-page.mjs` and
`assets/levy-page.mjs` import `assets/webmcp-tools.mjs` only when the browser
exposes `modelContext`, so other visitors download nothing extra. Each tool is
read-only: it calls the same function as its page's form (the Coal LSL tool
calls `computeEntry()`, which the form's `compute()` also calls), reads no form
state and sends nothing off the page. Before it runs, `execute` holds the input
to the tool's own `inputSchema` and refuses a wrong type, a value outside its
pattern, range or list, or a name the schema does not declare, rather than
converting it. `scripts/webmcp-tools.test.mjs` covers each tool, with a refused
input for each, and the WebMCP tests in `tests/browser/calculator.spec.mjs`
cover registration on the GST, Division 7A, long service leave, fuel tax credit, borrowing expenses, depreciation rates and
Coal LSL pages; `tests/browser/individual-tax.spec.mjs` covers the 12 individual tax pages.

The 6 Ozzit module pages offer a second read-only tool, `ozzit_function`, through
`assets/ozzit-tools.mjs`. It looks up one formula by name in the published
function reference that the page's script tag names, and returns its signature,
parameters, notes, worked examples and module page link. It fetches that file
from the site only when the browser exposes `modelContext` and an agent calls
the tool. `scripts/webmcp-tools.test.mjs` and the Ozzit WebMCP test in
`tests/browser/calculator.spec.mjs` cover it.

Chrome ships the API behind `chrome://flags/#enable-webmcp-testing` and an
origin trial. On 15 November 2026 ChromeStatus (entry 5117755740913664, updated
11 November 2026) listed a developer trial from Chrome 146 and an origin trial
from Chrome 149 to 156, with an extension to Chrome 162 also listed, and no
signal from Firefox or Safari; the specification was a W3C Community Group draft
dated 13 November 2026. No origin-trial token is committed; registering one is an
account action for the site owner. No trial with a real agent is recorded for
any tool here, the GST pilot included. The earlier rule was to add calculators only after that
trial; the 20 tools beyond GST were added without it: 5 on 15 November 2026,
4 on 18 November, and on 19 November the loan payment tool became the loan and
hire purchase schedule tools, and the Division 293, income tests, long service leave, bonus withholding, salary packaging, novated lease, fuel tax credit, borrowing expenses and super projection tools were added. Only the Node tests and browser tests with a
stand-in `modelContext` check them.
Cloudflare's WebMCP toggle is a separate edge-injected bridge and stays off:
its packs cover image provenance and a same-origin `/mcp` endpoint, and this
static site has neither.

## Portable GitHub maintenance workflows

github-agent-skills gives Codex and Claude Code the GitHub maintenance workflows this portfolio uses, and keeps the fictional-data and human review boundaries. Bootstrap <https://github.com/ryanduguid/github-agent-skills> locally with:

```powershell
git clone https://github.com/ryanduguid/github-agent-skills.git
cd github-agent-skills
rustup toolchain install
cargo run --manifest-path tools/github-skills/Cargo.toml --locked -- validate-skills --strict
```

Validation needs rustup, which installs the Rust release pinned in
`rust-toolchain.toml`. A fresh clone includes both runtime copies and
needs no synchronisation. For another project, copy `.claude/skills/` for
Claude Code or `.agents/skills/` for Codex into that project's matching directory.
After editing the canonical `.claude/skills/` source, run
`cargo run --manifest-path tools/github-skills/Cargo.toml --locked -- validate-skills --sync` to regenerate the Codex copy.

## Search Console MCP and CLI

The local Search Console reader is documented in
`.agents/tools/search-console/README.md`. It is locked to
`sc-domain:duguid.com.au`, exposes only 3 read methods through shared MCP
and CLI handlers, and validates request bounds before loading a credential or
contacting Google. A committed uv script lock fixes direct and transitive
dependency versions and hashes. Authentication and logout are explicit CLI
actions, never MCP tools.

Do not inspect, display, commit or upload OAuth material or stored credentials.
Search Console read results may appear only in the current MCP conversation or
the operator's terminal; never redirect, copy, persist, commit or upload them.
A live comparison, URL inspection or sitemap read is a manual gate requiring
the operator's OAuth consent. The tool reports evidence only; it neither decides
nor publishes an SEO change.

## External actions

Local implementation and verification do not authorise a push, pull request,
merge, deployment, OAuth consent or other publication. Ask for explicit
permission at that boundary and report any live or external check that remains
unverified.
