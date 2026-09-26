# Publishing contract and source checks

Checked on 26 September 2026 against
[LodgeiT's publishing page](https://lodgeit.org/publish.html).
This implementation record is not an external conformance certificate.

| Requirement | Implementation |
| --- | --- |
| Discovery | Calculator and module URNs, module filter, schema reference and invocation path |
| HTTP contract | OpenAPI 3.1, liveness, 422 field errors, 400 factual refusals and 404 unknown identifiers |
| Evidence | Exact served rate and method bytes, SHA-256 hashes and statutory citations |
| Numbers | Decimal strings, quarter-cent intermediates and final half-up rounding |
| Reproducibility | Expected fixture values and repeated raw response bytes |
| Access and limits | No key, 16 KiB body cap, platform limiter and Retry-After |
| Cost boundary | Free account quota; paid use needs a separate spending decision |

The page's naming table now uses `urn:sbrm:calculator:{module}:{name}`.
An older short URN remains in its manifest example. This API follows the table:
`urn:sbrm:calculator:coal-lsl:levy`, under `urn:sbrm:module:coal-lsl`.
Periods are monthly; the page's financial-year scope is an example.

LodgeiT offers a manual conformance pass and external listing. Its versioned
suite, signed registry, practitioner attestation and L402 payments are described
as future work. They are not implemented features or dependencies of this API.

## Statutory sources

Read from the Federal Register on 26 September 2026:

- [Payroll Levy Collection Act, Compilation No. 12](https://www.legislation.gov.au/C2004A04352/latest/text),
  C2026C00364, dated 1 September 2026. Section 3B confirms the base-rate, salary
  and casual branches, salary-sacrifice treatment and monthly bonus test.
- [Payroll Levy Regulations, Compilation No. 1](https://www.legislation.gov.au/F2018L00217/latest/text),
  dated 1 July 2023. Section 6 prescribes 2.7%; section 8 applies the 2023
  amendment to wages paid on or after 1 July 2023.

The methods record names this source check. The shared rate register retains
its 18 September check; a 26 September reading does not extend whole-month
coverage. January 2024 to August 2026 remains the served range.
Source retrieval and arithmetic tests do not constitute professional review.

The API calculates from supplied facts. It does not decide employee coverage,
prepare a return, lodge or pay levy. Each computed response states its limits
in the advisory block.
