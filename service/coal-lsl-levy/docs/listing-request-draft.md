# Draft listing request

**Unsent.** Nothing here has been sent to LodgeiT Labs, no listing has been
requested, and no conformance pass has been run by anyone but this repository.
The service is not deployed, so the base URL below does not exist.

Before sending, everything in [../deploy/README.md](../deploy/README.md) has to
be true, `node conformance/check.mjs --base <live url>` has to pass against the
deployed service, and the contract snapshot has to be re-read, because it is
quoted below.

---

Subject: Coal LSL payroll levy calculator for the constellation

Andrew,

Thanks for the invitation on lodgeit.org/publish.html. The Coal LSL levy
calculator is behind the surface in sections 1 to 4.

Base URL: PLACEHOLDER

- `GET /v1/calculators` returns one entry: `urn:sbrm:calc:coal-lsl-levy`, its
  input schema ref, the period URNs it accepts, its limits and its refusal
  classes.
- `GET /openapi.json` is the full OpenAPI 3.1 document.
- `GET /healthz` and `GET /livez` both answer.
- `GET /v1/rates/{period_uri}` lists the rate tables for a month with SHA-256
  content hashes, and `GET /v1/rates/{period_uri}/{rate_id}` serves the exact
  bytes those hashes cover.
- Every 200 carries a `manifest` (calculator, period, schema id, engine version
  with the SHA-256 of the calculation module, method record, rate table URNs
  with hashes, statutory citation) and an `advisory` block.
- Money and rates are decimal strings in both directions, including requests.
- The fixture is at `service/coal-lsl-levy/fixtures/cases.json` in the
  repository: 8 computed cases and 15 refusals, every expected figure derived
  by hand from s 3B before the service ran.

Three things are worth flagging before you run your pass.

**Period scope is a month, not a financial year.** The levy is imposed on
eligible wages paid in a reporting month, the return is monthly, and the casual
method changed mid-year on 1 January 2024. A financial-year URN would have to
answer for two methods inside one period. So the URNs read
`urn:sbrm:period:coal-lsl-levy:2026-06`. If the registry needs financial years,
the mapping is one to twelve and I will make the change.

**Two calculator URN spellings are current.** publish.html asks for
`urn:sbrm:calc:{name}`; every entry your live `/v1/calculators` returns is
`urn:sbrm:calculator:{...}`. I have made the short form canonical because the
invitation asks for it, and I accept the long form as an alias so a caller that
copied either works. Tell me which you want indexed and it is a configuration
change, not a release.

**Supported months are narrower than the calculator can compute.** A month is
served only where a verified rate row and a reviewed method record both cover
it, and not after the rate row's check date. A rate checked once does not vouch
for later months, so the service returns 404 rather than applying today's
figure to a month nobody has checked. That is deliberate and it means the
supported range moves when the register is re-verified.

Two things I noticed on your side while building against the contract, in
`docs/upstream-issue-draft.md`: `/healthz` is documented in llms.txt and in
your OpenAPI document but returns 404 on the live host, where `/livez` answers;
and the pinned OpenAPI snapshot in the integration kit is missing the div7a and
depreciation routes your live host now serves.

What this calculator will not do: decide whether a person is an eligible
employee, separate expense reimbursements from allowances, decide which payroll
weeks fall in a month, prepare a Levy Advice, or lodge anything. It refuses
rather than guess on each of those, with a stable `refusal_class`.

Ryan

---

## Notes for whoever sends this

- Replace PLACEHOLDER with the real base URL.
- Re-read the live surface first. The paragraphs about `/healthz` and the kit
  snapshot quote a reading from 18 September 2026 and may be out of date.
- Do not claim conformance, a pass, a listing, an attestation tier or a
  partnership. None of those exists.
- The bounty and attestation tiers on publish.html are described as planned.
  Do not write as though a practitioner attestation is available.
