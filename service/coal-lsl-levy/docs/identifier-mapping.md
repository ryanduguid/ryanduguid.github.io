# Identifier mapping

The URNs this service uses, where each spelling comes from, and what is still
unagreed. Nothing here has been put to LodgeiT and nothing here is accepted
by anyone but this repository.

## The discrepancy

The publishing standard at <https://lodgeit.org/publish.html> (read
18 September 2026) gives this naming table:

| Thing | Pattern | Example |
| --- | --- | --- |
| Calculator | `urn:sbrm:calc:{name}` | `urn:sbrm:calc:coal-lsl-levy` |
| Period | `urn:sbrm:period:{calculator}:{scope}` | `urn:sbrm:period:coal-lsl-levy:fy2026` |
| Rate table | `urn:sbrm:rate:{calculator}:{period}:{rate-type}` | `urn:sbrm:rate:coal-lsl-levy:fy2026:levy-rate` |

The live registry at `GET /v1/calculators` on the same day returns 22
calculators, every one of them spelled `urn:sbrm:calculator:...`, for example
`urn:sbrm:calculator:fbt:loan` and `urn:sbrm:calculator:depreciation:at`. No
live entry uses `urn:sbrm:calc:`.

Both spellings are current. The page that invites a calculator uses one, the
service that lists calculators uses the other.

## What this service does

- The **canonical** calculator URN is `urn:sbrm:calc:coal-lsl-levy`, the
  spelling the invitation asks for. It is what a manifest cites and what
  discovery reports as `calc_uri`.
- `urn:sbrm:calculator:coal-lsl-levy` is accepted on the invocation path as an
  alias and is listed in discovery as `calc_uri_aliases`. A call using it
  computes normally and the result still names the canonical URN.
- Both are configurable. `COAL_LSL_CALCULATOR_URN` changes the canonical one
  without a code change, so agreeing a spelling later is a configuration
  change, not a release.

Accepting both is the reversible choice: a caller that copied either spelling
from either source works, and no caller is locked to a decision that has not
been made.

## Period scope

The standard's example period is a financial year (`fy2026`). The levy is not
a financial-year figure: s 3B works on what was paid in a reporting month, the
return is monthly, and the casual method changed mid-year on 1 January 2024. A
financial-year scope would have to answer for two methods inside one URN.

So the period scope here is the reporting month:
`urn:sbrm:period:coal-lsl-levy:2026-06`. The standard allows `unscoped` for a
calculator with no period dependence, which this is not. A month is the
smallest scope that is honest about what the figure covers.

If LodgeiT wants financial-year period URNs, the mapping is one to twelve and
the registry would have to say which method applies inside a year that
straddles 1 January 2024.

## Rate and method URNs

- `urn:sbrm:rate:coal-lsl-levy:{month}:levy-rate` is the prescribed percentage
  from the rates register.
- `urn:sbrm:method:coal-lsl-levy:{record_id}` is the eligible-wages method
  record. The standard has no pattern for a method, because its own
  calculators carry the statutory method in the engine. Here the method
  changed on a date, so which method was applied is part of the evidence and
  is hashed alongside the rate. `urn:sbrm:method:` is this repository's
  invention, named so it cannot collide with the three patterns above.

## Status

Proposed. Not submitted, not agreed, not accepted. If any of it is wrong for
the registry, changing it is configuration plus a fixture update.
