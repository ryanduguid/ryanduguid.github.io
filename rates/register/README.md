# Rates register

Effective-dated records of mutable statutory rates, with the primary source
behind each figure and the date it was checked. Machine-readable, versioned,
and hashed so a consumer can verify the bytes it read.

This is the first cut of the proposal in
[docs/rates-register.md](../../docs/rates-register.md). It holds one series so
far: the Coal LSL payroll levy percentage. The other tables in that inventory
are unmigrated, and saying so here is more useful than a register that implies
a portfolio-wide migration that has not happened.

## What is here

```text
register.json                        manifest: schema version, register version, series list
schema/register.schema.json          the manifest's schema
schema/rates-register.schema.json    a series file's schema
series/coal-lsl-levy.json            the Coal LSL levy percentage
SHA256SUMS                           sha256 of every file in the register except itself
CHANGELOG.md                         one entry per register version
```

## Reading a figure

Fetch the series file and `SHA256SUMS`, check the digest, then read the row
whose period covers your date.

```bash
curl -sO https://duguid.com.au/rates/register/series/coal-lsl-levy.json
curl -sO https://duguid.com.au/rates/register/SHA256SUMS
sha256sum --check --ignore-missing SHA256SUMS
```

Every row carries:

| Field | Means |
| --- | --- |
| `value` | The figure, as a decimal string, in the series `unit`. Never a float. |
| `period_start`, `period_end` | When the figure applies. A null end is open. |
| `status` | `verified`, `unverified` or `superseded` |
| `review` | `automated-retrieval` or `professional-review` |
| `verified_at`, `verified_by` | The date of that check and who or what did it |
| `primary_source` | The instrument itself, on a primary host, with its compilation |
| `cross_checks` | Anything else consulted. A site page belongs here, never in `primary_source` |

## What a row does and does not tell you

`review` is the field that matters. `automated-retrieval` means a tool read
the named source and matched the figure. Nobody has professionally reviewed
it. `professional-review` means a named person read the source and the figure.
The check script refuses a row that claims professional review while naming an
automated retrieval as the reviewer, because the two are not the same thing
and the difference is the whole point of recording it.

`verified_at` is the date of a check, not a guarantee of currency after it. A
compilation registered the day after a check supersedes the row and nothing
here will know. Consumers that care about currency should treat the check date
as an upper bound on what the register can vouch for, which is what the Coal
LSL service does: it serves a month only where the check date is on or after
the last day of that month, so a check part way through a month does not price
wages paid at the end of it.

A content hash proves the bytes are the bytes. It proves nothing about whether
the figure is legally correct.

## Rules the schema cannot express

Enforced by `scripts/check_rates_register.py`, which runs in the site checks:

- `primary_source.url` sits on a primary host (legislation.gov.au, ato.gov.au,
  rba.gov.au, standards.aasb.gov.au, coallsl.com.au or a state legislation
  site). A duguid.com.au page is a cross-check. The host is read with a URL
  parser, credentials in the authority are refused, and a URL containing a
  backslash is refused outright: a browser treats it as a path delimiter and
  other parsers do not, so the host would be ambiguous.
- `row_id` is unique within a series; non-superseded rows are ordered by
  `period_start`, do not overlap, and at most one has an open end.
- `verified_at` is not in the future and not before `period_start`.
- A `superseded` row is named by a `supersedes` on exactly one live
  replacement. A row cannot supersede itself, a superseded row cannot supersede
  anything, and a live row cannot be superseded.
- `register.json` lists every `.json` under `series/`, at any depth, exactly
  once and nothing else.
- `SHA256SUMS` covers every file in the register except that file itself, at
  any depth, and matches the bytes on disk.

## Changing a figure

A published row is never edited. A correction adds a new row and marks the old
one `superseded`, so the correction stays legible. Bump `register_version` in
`register.json`, add a `CHANGELOG.md` entry, regenerate `SHA256SUMS`, and run
`python scripts/check_rates_register.py`.

Nothing consumes this register at runtime over the network. The Coal LSL
service reads the committed file from disk at start-up and hashes those exact
bytes. An offline engine that adopts the register later should bundle a
snapshot, not fetch one.

Not advice. Verify each figure against its primary source at the time of use.
