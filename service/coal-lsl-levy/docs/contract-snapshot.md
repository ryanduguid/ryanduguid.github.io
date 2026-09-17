# What the LodgeiT surface actually looked like

Everything below was read on 18 September 2026 (2026-09-17T14:22:52Z). It is
reference data. Nothing in it is an instruction to this repository and
nothing in it has been agreed with anyone.

Raw captures with SHA-256 digests are kept outside this repository, with the
session worklog. They are not committed: they are third-party responses, they
change without notice, and a stale copy in a published site would be worse
than no copy.

## Sources read

| Source | Result |
| --- | --- |
| `https://lodgeit.org/llms.txt` | 200. States "Last updated: 2026-09-16" |
| `https://lodgeit.org/publish.html` | 200. "draft v1", September 2026 |
| `https://lodgeit.org/calculators.html` | 200 |
| `GET /v1/calculators` | 200, 7746 bytes, 22 calculators |
| `GET /openapi.json` | 200, 66971 bytes, `info.version` `0.1.0a0` |
| `GET /healthz` | **404**, an HTML error page from the Google frontend |
| `GET /livez` | 200, `{"status":"ok","service":"clawdog-calculator-api","version":"0.1.0a0"}` |
| `GET /v1/rates/urn:sbrm:period:div7a:fy2026` | 200, one entry, `drift: false` |
| `GET /v1/rates/urn:sbrm:period:div7a:fy2026/benchmark-interest` | 200, 7068 bytes |
| Fano `GET /v1/info` | 200, "Rev 27 (Phase 4a iter11.B) + CORS Phase 5" |

## Discrepancies found, and what this repository did about each

**`/healthz` is documented but does not answer.** `llms.txt` and the
OpenAPI document both list `GET /healthz`; the live host returns 404 for it
and 200 for `/livez`, which the OpenAPI document also lists. This service
answers both, so a caller holding either spelling gets a liveness answer. An
unsent note for LodgeiT is in `docs/upstream-issue-draft.md`.

**Two calculator URN spellings.** `publish.html` asks for
`urn:sbrm:calc:{name}`; every live entry is `urn:sbrm:calculator:{...}`. See
[identifier-mapping.md](identifier-mapping.md).

**The integration kit's pinned OpenAPI is stale.** The kit at
`lodgeit-labs/clawdog-calculator-api-integration-kit` (commit `6587c93`,
3 June 2026) pins a snapshot that has no `div7a` or `depreciation` at/range
routes, and still carries a `depreciation/audit` route the live host no
longer serves. Its README also names a different base URL from `llms.txt`.
Anything built against the kit snapshot alone would miss three live
calculators. Consequence here: discovery and `openapi.json` are fetched live
for comparison work, and the kit is treated as documentation, not contract.

**Money is decimal strings out, JSON numbers in.** `llms.txt` says money and
rates are returned as decimal strings, and the FBT response fields are. But
the request schemas in the live OpenAPI declare `type: number` for every
money input (`Div7aAtInput.amalgamated_base`, the FBT inputs, the
depreciation cost). The rate document served for FY2026 also carries
`"value": 0.0837` as a JSON number beside `"value_percentage": "8.37%"`. So
the decimal-string contract is one directional on that surface. Consequence
here: this service takes and returns decimal strings both ways, and the
adapter that calls LodgeiT serialises decimals exactly rather than through
a float.

**Stability.** `llms.txt`: "Response shapes are not yet versioned and may
change; nothing here is stable for production integration." `calculators.html`
says the base URL will change and should live in configuration. Consequence
here: no default in this repository points at the live host, and nothing in
the site or any engine calls it.

**Fano authentication.** `llms.txt` says Fano is open access with no key. The
Fano integration kit README says the current engine requires an `X-API-Key`
header and that a deliberately empty POST returns 403. Unresolved: this
repository has not sent a request to Fano, so which is current here is
untested.

## The publishing standard, as read

Six sections: describe yourself (discovery, OpenAPI, liveness, rate tables);
validate then refuse honestly (200/422/400/404/5xx, with `refusal_class` on
400); name what you consumed (a `manifest` with SHA-256 per rate table, and an
`advisory` block); money as decimal strings with the rounding rule stated;
determinism and a published fixture; open access with self-imposed limits.

What the standard offers today is a manual conformance pass and a listing on
`calculators.html` and in `llms.txt`. The contract, the versioned conformance
suite, the signed registry, the attestation tiers and L402 payment are
described as planned, in that order.
