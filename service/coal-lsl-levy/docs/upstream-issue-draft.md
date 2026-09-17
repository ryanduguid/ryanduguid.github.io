# Draft issue for lodgeit-labs, unsent

**Not sent.** No issue has been opened on any LodgeiT Labs repository and no
third-party repository has been modified. This is a record of two defects found
while building against the published contract on 18 September 2026, written so
it can be sent later if Ryan chooses.

Target: `lodgeit-labs/lodgeit-labs.github.io` for the first, and
`lodgeit-labs/clawdog-calculator-api-integration-kit` for the second.

---

## 1. `/healthz` is documented but the live host answers 404

**What the docs say.** `llms.txt` lists `GET /healthz` under Discovery as
liveness. `publish.html` section 1 asks publishers to serve `GET /healthz`. The
live `openapi.json` declares both `/healthz` and `/livez`.

**What happens.** On 18 September 2026, against
`https://fbt-calculator-api-qkp3j5bjnq-ts.a.run.app`:

| Request | Status | Body |
| --- | --- | --- |
| `GET /healthz` | 404 | HTML error page from the Google frontend |
| `GET /healthz/` | 307 | redirect |
| `GET /livez` | 200 | `{"status":"ok","service":"clawdog-calculator-api","version":"0.1.0a0"}` |

**Why it matters.** An agent following `llms.txt` treats a 404 on the liveness
route as the service being down, and the 404 is an HTML page from the
frontend rather than JSON from the gateway, so a client that parses the body
gets a parse error rather than a status. Either route is fine; the documented
one and the answering one should be the same one.

**Suggested fix.** Serve `/healthz` as an alias of `/livez`, or change
`llms.txt`, `publish.html` and the OpenAPI document to name `/livez`.

## 2. The integration kit's pinned OpenAPI snapshot is behind the live contract

**Where.** `openapi/clawdog-calculator-api.openapi.json` at commit `6587c93`
(3 June 2026).

**What differs from live on 18 September 2026**, with both documents reporting
`info.version` `0.1.0a0`:

| Live serves, the kit does not | The kit has, live does not |
| --- | --- |
| `POST /v1/calculators/div7a/at/{period_uri}` | `POST /v1/calculators/depreciation/audit/{period_uri}` |
| `POST /v1/calculators/depreciation/at/{period_uri}` | |
| `POST /v1/calculators/depreciation/range/{period_uri}` | |

Schemas only live: `Div7aAtInput`, `Div7aRepaymentIn`, `DepreciationAtInput`,
`DepreciationRangeInput`, `AssetCreatedInput`, `EventInput`. Schemas only in the
kit: `DepreciationAuditInput`, `DepreciationAuditAssetInput`, and the
`Manifest`, `ManifestRateTableEntry`, `AdvisoryBlock` and
`CalculatorInvocationResponse` response schemas, which the live document no
longer declares (its 200 responses are `additionalProperties: true` objects).

The kit README also gives a different base URL
(`fbt-calculator-api-8340695160...`) from the one in `llms.txt`
(`fbt-calculator-api-qkp3j5bjnq...`).

**Why it matters.** The kit says its two-gate CI "fails when the live contract
drifts from the snapshot". The snapshot has drifted and the gate has not caught
it, so a partner generating a client from the pinned snapshot gets no div7a and
no depreciation, which is three of the four live calculator families. The
`info.version` is identical across both, so a version comparison will not
reveal it either.

**Suggested fix.** Refresh the snapshot, check why the drift gate did not fire,
and bump `info.version` when the route set changes so a pinned version means
something.

---

## Before sending

Re-run both checks against the live host on the day. Both are point-in-time
observations and either may have been fixed. Do not send a bug report quoting a
stale reading.
