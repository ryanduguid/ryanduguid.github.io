# Coal LSL levy API

This API calculates eligible wages and payroll levy for one employee and one
month. It uses the same `assets/levy.mjs` engine as the
[browser calculator](https://duguid.com.au/tools/coal-lsl-levy/).
The caller establishes employee eligibility and pay facts.

Deployed on Cloudflare Workers at
<https://coal-lsl-levy.coal-lsl-levy-service.workers.dev>.
[LodgeiT lists it](https://lodgeit.org/coal-lsl.html) as an external calculator,
tier `conformance-passed`, pinned at revision 53ba9b8. That tier is LodgeiT's
statement about the contract and reproducible numbers, not a practitioner's
review of the law. Jekyll excludes `service/`.

## Run and check

Use Node 24 LTS. The Node server has no runtime package dependencies. Wrangler
is a pinned development dependency for building, testing and deployment.

```sh
npm ci
npm test
npm run conformance
npm run check:worker
npm audit --audit-level=high
npm start
```

The Node server listens on `127.0.0.1:8787`. `npm run dev:worker` runs the Worker
locally on `127.0.0.1:8788`. The repository's `checks.yml` runs service tests,
the conformance check, the Worker build and the dependency audit.

## Contract

| Route | Purpose |
| --- | --- |
| `GET /v1/modules` | Modules and their calculator URNs |
| `GET /v1/calculators` | Schema reference, invocation path, periods and limits |
| `GET /v1/calculators?module=urn:sbrm:module:coal-lsl` | Filter by module |
| `GET /openapi.json` | OpenAPI 3.1 |
| `GET /healthz`, `GET /livez` | Liveness |
| `GET /v1/rates/{period_uri}` | Rate and method records with hashes |
| `GET /v1/rates/{period_uri}/{rate_id}` | Exact bytes covered by each hash |
| `POST /v1/calculators/{calc_uri}/{period_uri}` | One calculation |

The calculator is `urn:sbrm:calculator:coal-lsl:levy`; its module is
`urn:sbrm:module:coal-lsl`. Earlier short URNs remain accepted as invocation
aliases. Selection depends on facts, not an election. Periods use months, such
as `urn:sbrm:period:coal-lsl-levy:2026-06`, because levy returns are monthly.

Responses use 200 for computed values, 400 for factual refusals with a stable
`refusal_class`, 422 for invalid input naming the field, and 404 for unknown
identifiers. Other guards return 413 for oversized bodies, 415 for wrong media
type and 429 with `Retry-After` for throttling. Service faults return 500
without internal error details.

Money and rates are decimal strings. Every amount is required, including
`"0.00"` for nil. JSON-number amounts, negative values, excess precision and
unknown fields are rejected. Unknown facts needed for the selected branch and
pay components it would discard are refused.

A bonus `frequency` takes the engine's 6 values: `weekly`, `fortnightly`,
`monthly`, `quarterly`, `halfYearly` and `annually`. Anything else, including
`daily`, fails with 422 `invalid_enum`. The method record counts bonuses paid at
least monthly as `assets/levy.mjs` implements that test, and the engine has no
daily value, so the service refuses one rather than guessing.

Response figures have fixed scales, which the OpenAPI document publishes as
patterns. Money has 2 decimal places and rates and factors have 4 (`"2.7000"`,
`"0.7500"`). Eligible wages and Formula B have 4 because they keep exact
quarter cents, and `levy_before_rounding` is exact at 8. The final levy rounds
once, half up to cents, from that exact value in integer arithmetic. That
rounding is the calculator's documented choice, not a statutory rule. Each
manifest names it as `rounding_policy` `half_up_cent_final_step`, and the
advisory states which rounding rules of LodgeiT's publishing standard apply.
Each amount is capped at `833999930994.53`, with an aggregate limit checked
separately.

## Evidence and coverage

Each computed response includes rate and method hashes, statutory citations,
engine source hash, version and code revision. A dirty build is labelled
`-dirty`; an archive without Git metadata reports null. No calculation fetches
external data or uses the current date.

Supported months are January 2024 to October 2026. Each month needs a supported
method and a verified rate row checked through month-end. The register's
5 November check does not cover all of November, so November is refused until a
later check. Coverage does not roll forward on its own: each new month needs the
sources re-read, the register updated and the Worker redeployed.

The [24 synthetic fixtures](fixtures/cases.json) cover 8 computed results,
5 factual refusals, 8 validation failures and 3 unsupported periods. Expected
figures include independent arithmetic derivations. The conformance runner
checks every expected value, served hashes and raw response bytes on repeat
calls. Passing it does not constitute LodgeiT approval.

See [deployment and operations](deploy/README.md), the
[contract record](docs/contract-snapshot.md) and the
[listing request template](docs/listing-request-draft.md).

## Licence

This directory is under the repository's
[Ryan Duguid Public Attribution Licence 1.0](../../LICENSE). Revision 53ba9b8 was
released under the MIT licence, and that grant stands for that version.

## Correction

Commit 460d021 (#295, 27 September 2026) deleted this directory as
'never-deployed'. That was wrong. The Worker had been live since 26 September
2026, and 53ba9b8 had been deployed about 2 hours before the deletion. The
Worker kept running, so the source LodgeiT cites left `main` whilst the service
stayed live. This directory was restored from 53ba9b8 on 5 November 2026.

The earlier removal, 65a7c93 (#185, 20 September 2026), used the same words and
was accurate then: the first deployment came 6 days later.
