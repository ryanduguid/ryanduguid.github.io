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

The calculator pages listed below each offer one tool to a browser's built-in agent
through the draft [WebMCP](https://webmachinelearning.github.io/webmcp/)
`modelContext` API: `calculate_gst`, `calculate_div7a_minimum_repayment`,
`calculate_loan_schedule`, `calculate_hire_purchase_schedule`, `calculate_lease_schedule`, `calculate_break_even`, `calculate_company_tax`,
`calculate_foreign_purchaser_surcharges`, `calculate_long_service_leave`, `calculate_fuel_tax_credits`, `calculate_borrowing_expenses`,
`calculate_asic_fee`, `calculate_ato_penalties_interest`, `calculate_business_use_share`, `calculate_fixed_fee`,
`calculate_franking_account`, `calculate_gic_payment_plan`, `calculate_gst_margin_scheme`, `calculate_hourly_rate`,
`calculate_luxury_car_tax`, `calculate_margin_and_markup`, `calculate_objection_deadline`, `calculate_budget_variance`,
`classify_vehicle`, `calculate_wine_equalisation_tax`, `calculate_cash_forecast`, `calculate_depreciation_pool`,
`calculate_div7a_schedule`, `calculate_first_home_owner_grant`, `calculate_payg_instalment`, `calculate_payroll_tax`,
`calculate_salary_vs_dividend`, `calculate_sgc_payday`, `calculate_payday_super_cashflow`, `calculate_staff_cost`, `calculate_capital_gains_tax`,
`check_small_business_cgt_concessions`, `score_pcg_2021_4_risk`, `calculate_pcg_2021_4_allocation`, `check_psi_rules`,
`calculate_rental_property`, `calculate_super_benefit_tax`, `calculate_unused_leave_withholding`,
`calculate_workers_compensation_premium`, `calculate_business_days`, `calculate_division_296_tax`,
`calculate_fbt_car`, `calculate_fbt_car_parking`, `calculate_fbt_expense_payment`, `calculate_fbt_loan`,
`calculate_fbt_meal_entertainment`, `calculate_fbt_property`, `calculate_land_tax`,
`calculate_termination_payment`, `calculate_transfer_duty`,
`calculate_rd_tax_offset`, `calculate_gst_adjustments`, `calculate_deferred_tax`, `calculate_sole_trader_vs_company`, `calculate_trust_streaming`,
`calculate_casual_overtime_pay`, `calculate_contractor_employee`, `check_tax_invoice`,
`calculate_foreign_resident_withholding`, `calculate_partnership_net_income` and `check_trust_loss_tests`
on the 63 business calculator pages,
`estimate_income_tax`, `calculate_take_home_pay`, `calculate_study_loan_repayment`, `calculate_sole_trader_set_aside`,
`calculate_lump_sum_arrears`, `calculate_division_293_tax`, `calculate_income_tests`, `calculate_concessional_catch_up`,
`calculate_bonus_withholding`, `calculate_salary_packaging`, `calculate_novated_lease`, `project_super_balance`,
`calculate_fhss_release`, `calculate_work_expenses`, `calculate_government_super_amounts`,
`calculate_pension_minimum`, `calculate_transfer_balance` and `calculate_residency_days` on the 18
individual tax calculator pages, `calculate_decline_in_value` on the depreciation rates page and
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
Coal LSL pages; `tests/browser/individual-tax.spec.mjs` covers the 18 individual tax pages.

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
trial; the 79 tools beyond GST were added without it: 5 on 15 November 2026,
4 on 18 November, 12 on 19 November (when the loan payment tool became the loan and
hire purchase schedule tools, and the Division 293, income tests, long service leave, bonus withholding, salary packaging, novated lease, fuel tax credit, borrowing expenses, AASB 16 lease and super projection tools were added), 6 on 24 November (study loan repayment, concessional catch-up, lump sum in arrears, FHSS, work expenses and government super amounts), 14 more on 24 November (ASIC fees, ATO penalties and interest, business use share, fixed fee, franking account, GIC payment plan, GST margin scheme, hourly pricing, luxury car tax, margin and markup, objection deadline, budget variance, vehicle classifier and wine equalisation tax), 9 more on 24 November (13-week cash forecast, depreciation pools and capital works, Division 7A loan schedule, first home owner grant, PAYG instalments, payroll tax, salary against dividends, SGC and Payday Super, and staff cost), 9 more on 24 November (capital gains tax, small business CGT concessions, PCG 2021/4 risk scorer, PCG 2021/4 allocation, PSI rules checker, rental property, super lump sum tax, unused leave on termination and workers compensation premium) and 11 more on 24 November (business days, Division 296 tax, FBT car, FBT car parking, FBT expense payment, FBT loan, FBT meal entertainment, FBT property, land tax, redundancy and ETP withholding, and transfer duty), 5 more on 25 November (R&D tax offset, GST adjustments, deferred tax, pension minimum payment and transfer balance) and 4 on 26 November (sole trader against company, 183-day residency day count, casual and overtime pay, and contractor against employee). Only the Node tests and browser tests with a
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
