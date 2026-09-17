# Coal LSL levy calculator over HTTP

Development source. Not deployed, not listed, not released.

This is the Coal LSL payroll levy calculator from
[duguid.com.au/tools/coal-lsl-levy/](https://duguid.com.au/tools/coal-lsl-levy/)
behind an HTTP surface, so an agent can call it the way the
[LodgeiT Labs calculator constellation](https://lodgeit.org/calculators.html)
is called. The arithmetic is not reimplemented: the service imports
`assets/levy.mjs`, the same module the browser page imports and the same
module `scripts/levy.test.mjs` tests. There is one set of formulas in this
repository and this directory is not a copy of it.

The site stays static. `service/` is excluded from the Jekyll build in
`_config.yml`, and nothing on the public site fetches this service.

## Run it locally

Node 22 or newer, no dependencies to install.

```bash
cd service/coal-lsl-levy
node bin/serve.mjs
```

It binds to `127.0.0.1:8787`. Then:

```bash
curl -s http://127.0.0.1:8787/v1/calculators | head -40
```

```bash
curl -s -X POST \
  "http://127.0.0.1:8787/v1/calculators/urn:sbrm:calc:coal-lsl-levy/urn:sbrm:period:coal-lsl-levy:2026-06" \
  -H 'Content-Type: application/json' \
  -d '{"reporting_month":"2026-06","branch":"base_rate","employee":{"eligible_employee":true},"pay":{"base_rate_of_pay":"6000.00","salary_sacrificed":"0.00","overtime_and_penalty_rates":"3000.00","allowances":"500.00","allowances_exclude_expense_reimbursements":true,"bonuses":[]}}'
```

That returns eligible wages `7125.00`, levy `192.38` and
`levy_before_rounding` `192.375`, with the manifest and advisory blocks.

## Checks

```bash
node --test "test/*.test.mjs"
```

```bash
node conformance/check.mjs
```

The conformance script checks the surface against the six sections of the
draft publishing standard, as this repository reads it. It is a self-check.
It is not a LodgeiT conformance result, an approval or a listing. Only
LodgeiT can say whether the surface conforms.

## What the surface does

| Route | Purpose |
| --- | --- |
| `GET /v1/calculators` | The calculator, its URNs, supported period URNs, limits and refusal classes |
| `GET /openapi.json` | OpenAPI 3.1 for the whole surface |
| `GET /healthz`, `GET /livez` | Liveness |
| `GET /v1/rates/{period_uri}` | The rate tables registered for a month, each with a SHA-256 |
| `GET /v1/rates/{period_uri}/{rate_id}` | The exact bytes those hashes cover |
| `POST /v1/calculators/{calc_uri}/{period_uri}` | Calculate the levy for one employee for one month |

Status codes follow the standard: 200 computed, 422 malformed or incomplete
(the body names the field), 400 well formed but outside what the calculator
answers (the body carries a `refusal_class`), 404 unknown calculator or
period URN (the body names what is accepted), 413 oversized body, 415 wrong
media type, 429 throttled with `Retry-After`, 5xx service fault.

Refusal classes: `unsupported_period`, `out_of_scope_employee`,
`insufficient_facts`, `components_not_read_by_branch`.

## Differences from the browser page, and why

The page is for a person who can see what they typed. The HTTP surface is
not, so it is stricter in four ways.

- **Every amount is required.** The page treats a blank field as `$0.00` and
  says so on screen. Over HTTP a missing field is a `422`: send `"0.00"` when
  an amount is nil.
- **Money is a decimal string.** `"6000.00"`, never `6000` or `6000.0`. The
  string is parsed digit by digit into integer cents, so no dollar figure
  ever passes through a binary float. A JSON number is a `422`.
- **Facts are three-valued.** `true`, `false` or `"unknown"`. `"unknown"` is
  a `400 insufficient_facts`, never read as `false`.
- **Pay the branch does not read is a refusal, not a silent drop.** The page
  names the discarded components under the result; the service refuses with
  `components_not_read_by_branch` and lists the fields.

## Supported months

January 2024 to September 2026, from `GET /v1/calculators`. Two records have
to cover a month before it is served:

- a **rate row** in [`rates/register/series/coal-lsl-levy.json`](../../rates/register/series/coal-lsl-levy.json)
  whose status is `verified` and whose check date is in that month or later;
- a **method record** in [`methods.json`](methods.json) marked
  `service_supported`.

The method record starts at 1 January 2024, when the amendments to s 3B made
by the Fair Work Legislation Amendment (Protecting Worker Entitlements) Act
2023 commenced. The rate row was checked on 18 September 2026, so September
2026 is the last month served: a rate checked once does not vouch for the
months after the check.

The browser page still calculates months before 2024 using the earlier casual
method. The service does not, because the pre-amendment text of s 3B was not
read when this was written. That is a coverage limit, not a statement that
the page is wrong.

## Not what this is

It calculates a levy on supplied facts. It does not decide whether a person
is an eligible employee, separate expense reimbursements from allowances,
decide which payroll weeks fall in the month, prepare a Levy Advice, lodge
anything or pay anything. Every 200 says so in its `advisory` block.

More: [docs/architecture.md](docs/architecture.md),
[docs/identifier-mapping.md](docs/identifier-mapping.md),
[docs/runbook.md](docs/runbook.md),
[docs/contract-snapshot.md](docs/contract-snapshot.md),
[deploy/README.md](deploy/README.md).
