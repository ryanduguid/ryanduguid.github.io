# Accounting questions implementation

Ryan authorised implementation of all 100 researched questions on 11 September
2026. The website is the shared entry point for the six inspected repositories.
Question numbers preserve the research register; they are not search-volume ranks.

## Design

Use one static Jekyll page at `/tools/accounting-questions/`, with ten topic
sections, 100 expandable answers and stable question anchors. Each answer gives
a practical procedure, records to gather, a limit and a source or existing tool.
Native details elements keep all answers usable without JavaScript. Add optional
text and topic filters. Provide a printable checklist from the selected answers.

Add `/tools/business-calculators/` for shared planning arithmetic: GST, business
use, margin and markup, break-even, hourly pricing, budget variance, loan payments,
staff costs and a weekly cash forecast. Inputs stay in the browser. Export the
cash forecast as CSV. Show assumptions and working; require supplied rates and
amounts wherever classification or current law determines them. Existing tax,
payroll, WIP, benchmark and close tools remain linked with their documented limits.

Reuse site tokens, shared navigation, metadata and test infrastructure. Use Jekyll
data for question content and plain JavaScript for calculations. Add no dependency,
account integration, model call or analytics. Ryan subsequently authorised
publication and merge through the repository checks on 11 September 2026.

## Files

- `_data/accounting_questions.json`: the 100 answers and topic grouping.
- `tools/accounting-questions/index.html`: static answers and optional controls.
- `tools/business-calculators/index.html`: labelled forms and visible formulas.
- `assets/business-calculators.mjs`: pure arithmetic and validation.
- `assets/accounting-pages.mjs`: filters, forms, cash table and downloads.
- `assets/accounting-pages.css`: scoped layout, mobile and print styles.
- `scripts/business-calculators.test.mjs`: independently derived arithmetic cases.
- `tests/browser/accounting-questions.spec.mjs`: end-to-end question and form tests.
- Existing Tools, sitemap, machine index and check runner: add discovery and tests.

## Acceptance gates

1. All IDs 1 through 100 appear once, with their original question and useful
   guidance. No fabricated demand volumes or evaluated-model claims.
2. A visitor can find each question, follow its resource, filter and reset,
   open a direct link, and print a chosen checklist. Answers work without JS.
3. Calculations show independently checked outputs, reject empty or invalid data,
   handle zero bases and negative cash balances, and invalidate stale results.
4. Cash forecasts carry opening balances forward, move a receipt by a chosen
   number of weeks, preserve receipts outside the horizon and export the scenario.
5. Desktop and mobile keyboard and accessibility tests pass; no page overflow.
6. Run the repository lint, site, browser, capture, audit and Lighthouse commands.
   Record live-link failures and any unavailable checks explicitly.
7. Apply Ponytail full to the design and code and No AI Slop eval to all prose.

## Execution

Create the bounded arithmetic and browser tests first, confirm their failure,
implement the modules and pages, then add all question content. Verify source
routes in Camofox. Run the checks, fix failures, and record the local result.

## Approved improvement pass, 11 September 2026

Ryan approved the six findings in the follow-up review. Keep the existing static
pages and modules. Use exact scaled arithmetic for finite-decimal money inputs;
keep the amortising loan formula an explicitly approximate estimate. Search the
guide content and a short set of accounting aliases.

Add a start date to the cash forecast, seven-day date ranges to results and CSV,
and local JSON save/load of the original inputs. Validate version, currency,
date, all 13 rows, and scenario limits before replacing any field. Reject files
over 64 KB. Do not store browser inputs automatically or add a server.

Add fictional worked examples for BAS, month-end close, and cash flow. Show each
topic's editorial review date and applicable-period guidance, including these in
the downloaded checklist. Add both new routes to the existing Lighthouse runs.

Acceptance: reproduce the rounding and search failures first; then verify half
cents, loan estimates, calendar boundaries, file round trips, invalid-file state
preservation, downloaded CSV dates, and examples in the checklist. Run the
repository checks and inspect mobile and desktop results. Retry existing read
access for search metrics; keep missing measurements explicit. Account changes,
outreach, and paid data purchases remain outside this work.
