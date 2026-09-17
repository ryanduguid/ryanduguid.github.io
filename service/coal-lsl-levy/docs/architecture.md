# Architecture

## One engine, three consumers

```
assets/levy.mjs          the formulas: s 3B branches, bonus frequency test,
                         salary sacrifice gross-up, 2.7% and the rounding
     |
     +-- assets/levy-form.mjs  -> assets/levy-page.mjs   the browser page
     +-- scripts/levy.test.mjs                            the engine's own tests
     +-- service/coal-lsl-levy/src/calculate.mjs          this service
```

`assets/levy.mjs` is a pure module with no DOM access, which is why all three
can import it. The service adds a strict boundary around it and takes nothing
away: no formula, no branch rule and no rounding decision is restated here.
If a formula changes, it changes in one file and all three follow.

What the service owns:

| File | Owns |
| --- | --- |
| `src/money.mjs` | Decimal strings to exact cents and back. No float ever holds a dollar figure. |
| `src/schema.mjs` | The request contract: required fields, enums, three-valued facts, unknown-field rejection. |
| `src/calculate.mjs` | Branch selection, scope refusals, the manifest and advisory, decimal rendering. |
| `src/register.mjs` | Which months are supported, and the hashes of the evidence behind them. |
| `src/server.mjs` | Routing, limits, throttling, CORS, logging. |
| `src/openapi.mjs` | The OpenAPI document, built from the same constants the validator uses. |

## Exact money

A decimal string is parsed digit by digit. `"6000.00"` becomes `600000`
cents through `whole * 100 + fraction`, with no `parseFloat` and no
`Math.round(dollars * 100)` at the boundary. The engine then works in integer
cents, except where s 3B needs a fraction: Formula B is three quarters of an
aggregate, so eligible wages can land on a quarter cent. The engine keeps
that fraction; the service renders it exactly, so
`eligible_wages` can read `300.0225`.

Output is rendered by integer division:

- `eligible_wages` from an exact BigInt count of quarter cents over 400;
- `levy_before_rounding` from `quarter_cents x 27` over `4 x 1000 x 100`;
- `levy` from the engine's integer cents.

Every denominator is a product of 2 and 5, so each division terminates. If one
ever did not, `exactDecimal` throws rather than print a truncated figure.

Rounding happens once, at the end, half up. The Act, the Regulations and the
Coal LSL guidance note publish no rounding rule, so this is the calculator's
documented choice and both figures are returned.

## Supported months

A month is served only when a verified rate row and a supported method record
both cover it, and the month is not after the rate row's check date. That last
clause is the one that matters: the engine can parse any `YYYY-MM`, and
without it a rate checked in September 2026 would be applied to 2029.

`supportedMonths()` enumerates months from the earliest record start to the
latest check month and keeps the ones both records cover. Discovery publishes
the resulting period URNs, and a URN outside the list is a 404 before the body
is read.

## Refusals

| Class | Raised when |
| --- | --- |
| `unsupported_period` | The month has no verified rate row or no supported method record |
| `out_of_scope_employee` | `eligible_employee` is `false` |
| `insufficient_facts` | A fact the calculation turns on is `"unknown"` |
| `components_not_read_by_branch` | Pay was supplied that the selected branch does not read |

The last one is the interesting one. On the casual branch, the two loading
answers select between s 3B(3)(a) and s 3B(3)(b), and each reads different pay
fields. A caller who sends base pay and loading while both answers are false
lands on s 3B(3)(b), which reads neither. The browser page reports what it
dropped under a `$0.00`; the service refuses, because an agent will not read
the prose beside the number.

`insufficient_facts` also covers an allowances figure sent without the
assertion that it excludes expense reimbursements, since s 3B(1)(b)(iii) takes
in allowances "other than those for reimbursement of expenses" and the
calculator cannot separate them.

## Evidence in the response

Every 200 carries a `manifest` binding the figure to what produced it: the
calculator and period URNs, the request schema id, the engine version with the
SHA-256 of `assets/levy.mjs` and the code revision, the method record with its
hash, the rate table URN with the SHA-256 of the served bytes, and the
statutory citation. `GET /v1/rates/{period}/{rate_id}` serves exactly the bytes
those hashes cover, so a caller can verify the hash rather than trust it.

A hash proves identity and integrity. It does not prove the figure is right,
and it is not an attestation. The `advisory` block says so, names the rate
row's review status, and states that eligibility was asserted by the caller.

## Determinism

The same request produces the same bytes. Nothing in the calculation path
reads the clock, the network or the file system: the register is loaded once
at start-up. Observation metadata (the request id, the duration) goes to the
log, never into the result.

## Limits

Body 16 KiB, 60 requests per minute per client, both declared in discovery
and both configurable. The throttle is a fixed window in process memory,
which is enough behind a single instance; a fleet needs a shared store, and
`docs/runbook.md` says so. `X-Forwarded-For` is ignored unless
`COAL_LSL_TRUST_PROXY=1`, so a spoofed header cannot buy a fresh bucket.

CORS is off by default and allows only configured origins. It governs which
browser page may read a response; it is not authentication and the service
has none. A disallowed origin still receives an answer, because CORS is a
browser rule, not a gate.
