# Rates register proposal

Audit phase 3. A read-only inventory of where the portfolio keeps mutable
rates, thresholds and the sources behind them, followed by a proposal for one
versioned, machine-readable register. Nothing consumes the register yet and
nothing here changes a published figure. Every value quoted below is quoted
from the repository named, with that repository's own verification date. This
document does not verify any rate and is not advice.

Inventory taken on 5 September 2026 from `ryanduguid/australian-accounting-skills`
at `1bde4cc`, `ryanduguid/ryanduguid.github.io` at `bf29c81` and
`ryanduguid/australian-accounting` at `913785a`.

## 1. Inventory

### 1.1 Skills: `.claude/skills/*/sources.json`

The brief counted nineteen `sources.json` files. Nineteen skills exist, but
thirteen ship `sources.json` and six ship `sources.exempt.json` instead
(`contracting-exports`, `div7a-compliance`, `fbt-annual-workflow`, `workpaper-tie-out`, `xero-exports`, `year-end-workpapers`). The test
`tests/test_skill_metadata.py` requires one or the other, and an exemption must
carry a reason.

Shape, identical across the thirteen files:

```json
{"skill": "...", "notes": "...", "sources": [
  {"title": "...", "url": "...", "checked_at": "YYYY-MM-DD", "fact": "...", "volatile": true}
]}
```

| Skill | Entries | `checked_at` | Notes field (first sentence) |
|---|---|---|---|
| `bas-preparation` | 5 | 2026-08-14 to 2026-08-19 | Mutable ATO facts. |
| `cashflow-forecast-13week` | 4 | 2026-08-20 | Mutable ATO and Treasury facts behind the Payday Super timing control. |
| `coal-lsl-levy` | 2 | 2026-08-28 | Controlling Commonwealth sources. |
| `contract-cost-tracking` | 2 | 2026-08-28 | Accounting-standard provenance only. |
| `contractor-super-tpar` | 2 | 2026-08-15 | Reviewed source paths transferred from hardhat-ledger commit eb3b8a6ba47dfcdc05cea434f2f6a7dba82f96ef. |
| `fuel-tax-credits` | 2 | 2026-08-28 | Entitlement and rate provenance. |
| `month-end-close` | 4 | 2026-08-20 | Mutable ATO and Treasury facts behind the Payday Super timing control. |
| `payroll-tax-contractors` | 2 | 2026-08-28 | NSW discovery sources only. |
| `plant-and-equipment-costing` | 2 | 2026-08-28 | Financial-reporting and tax provenance. |
| `progress-claim-preparation` | 2 | 2026-08-15 | NSW coverage sources reviewed in hardhat-ledger on 15 August 2026. |
| `retention-schedule` | 2 | 2026-08-15 | NSW trust sources reviewed in hardhat-ledger on 15 August 2026. |
| `stp-finalisation` | 5 | 2026-08-20 | Mutable ATO and Treasury facts. |
| `wip-over-under-billing` | 2 | 2026-08-28 | Accounting-standard provenance. |

Totals: 36 entries, checked between 2026-08-14 and 2026-08-28, 4 marked
`volatile: false` (Acts as made and one judgment), the rest `volatile: true`.

Two properties matter for the register. First, these files record facts and
where to read them, and deliberately not rates: `fuel-tax-credits` says "the
rate is deliberately not stored here" and `coal-lsl-levy` says the levy
percentage "must be read from the in-force compilation each time, not copied
from this index". Second, the same entry is repeated verbatim across skills
with independent check dates:

| Source URL | Skills carrying it |
|---|---|
| `softwaredevelopers.ato.gov.au/PaydaySuper` | `cashflow-forecast-13week`, `month-end-close`, `stp-finalisation` |
| `www.ato.gov.au/businesses-and-organisations/super-for-employers/paying` | `cashflow-forecast-13week`, `month-end-close`, `stp-finalisation` |
| `www.legislation.gov.au/C2025A00057/asmade/text` | `cashflow-forecast-13week`, `month-end-close`, `stp-finalisation` |
| `www.legislation.gov.au/F2018L01289/latest/text` | `cashflow-forecast-13week`, `month-end-close`, `stp-finalisation` |
| `standards.aasb.gov.au/aasb-15-dec-2022` | `contract-cost-tracking`, `wip-over-under-billing` |
| `legislation.nsw.gov.au/view/whole/html/inforce/current/act-1999-046` | `progress-claim-preparation`, `retention-schedule` |

One entry (`wip-over-under-billing`) still cites the archived
`github.com/ryanduguid/TheWIPTally`; the file is byte-pinned by
`tests/test_hardhat_consolidation.py`, which is why Phase 1 left it.

### 1.2 Site: `ryanduguid.github.io/rates/`

Three reference tables, each an HTML page with a `page-meta` review date plus a
CSV the page links as its machine-readable copy. All three pages read "Last
reviewed 2 September 2026". Only the super guarantee page carries a
per-table verification sentence ("Verified 30 August 2026 against the ATO's
super guarantee rate table"); the other two carry primary-source links but no
separate verification date. The CSVs have no provenance columns beyond the
notes below.

| Table | CSV columns | Rows | Coverage as recorded | Primary sources linked on the page |
|---|---|---|---|---|
| Super guarantee rate history | `period_start`, `period_end`, `general_sg_rate_percent`, `notes` | 8 | 2002-07-01 onward; last row 2025-07-01 open-ended, 12.00 per cent | SGAA 1992 compilation (legislation.gov.au C2004A04402), Treasury Laws Amendment (Payday Superannuation) Act 2025 (C2025A00057), ATO super guarantee rate table |
| Division 7A benchmark interest rate | `income_year`, `benchmark_rate_percent`, `rba_series_month`, `notes` | 8 | 2019-20 to 2026-27; 2026-27 recorded as 8.77 per cent from RBA series month 2026-05 | ITAA 1936 compilation (C1936A00027), RBA statistical tables |
| Cents per kilometre | `income_year`, `cents_per_km`, `instrument`, `register_id`, `scope` | 3 | 2024-25 to 2026-27; 2026-27 recorded as 91 cents under F2026L00785 | Determinations F2024L00697 and F2026L00785 on legislation.gov.au |

A fourth rate lives outside `rates/`: the Coal LSL levy in
`assets/levy.mjs`, held as `27 / 1000` with `LEVY_RATE_AS_AT = '2026-09-02'`
and a source constant, and repeated in prose on `tools/coal-lsl-levy/`.

### 1.3 Engines: `ryanduguid/australian-accounting`

| Component | File | What it holds | Provenance fields | Check date recorded |
|---|---|---|---|---|
| payday-super-checker | `paydaysuper/data/rates.json` | Per financial year: `charge_percentage`, `concessional_cap`, `max_contributions_base` (2026-27 only) | `source`, `verify_at`, `cross_check`, `seen` | `seen` 2026-08-15 |
| payday-super-checker | `paydaysuper/data/gic_rates.json` | GIC quarters `from`, `to`, `annual_pct`; covers 2026-04-01 to 2026-09-30 | `source`, `verify_at`, `seen` per quarter | `seen` 2026-08-14 |
| payday-super-checker | `paydaysuper/data/business_days.json` | 59 non-business days, 11 official sources | `verified_from`, `verified_until`, `generated`, `official_sources` | verified 2026-07-01 to 2027-08-31, generated 2026-08-02 |
| div7a-loan-review | `div7aloan/data/benchmark_rates.csv` | 8 income years 2019-20 to 2026-27, `rate` as a decimal fraction | columns `rba_table`, `rba_series`, `rba_month`, `source`, `verify_at`, `seen`; header comments `reviewed_until: 2026-27`, `reviewed_on: 2026-08-28` | `seen` 2026-08-28 |
| ato-benchmark-compare | `atobenchmark/data/benchmarks-2022-23.json`, `benchmarks-2023-24.json` | 100 business types per year, `schema_version: 1` | `source` block: `publisher`, `dataset_page`, `resource_url`, `resource_last_modified`, `retrieved`, `sha256`, `bytes`, `licence`, `licence_url` | `retrieved` 2026-08-13 |
| the-exchequer-tally | `edwinnixon/corporate_tax.py` | `BRE_RATES` 2018 to 2027, `STANDARD_CORPORATE_RATE`, `TURNOVER_THRESHOLDS`, `BREPI_THRESHOLD_PERCENT` as Python constants | Docstring cites ITRA 1986 ss 23AA and 23AB and the Enterprise Tax Plan Act; no URL | none |
| solomons-sword, the-wip-tally, aus-accounting-mcp | none | Logic only; the MCP consumes the engines above | | |

Two provenance details stand out. The Division 7A engine's `verify_at` column
points at `https://duguid.com.au/rates/div7a-benchmark-rate/`, so the engine
cites the site and the site cites the RBA: a primary source one hop removed.
The benchmarks dataset is the only table in the portfolio that records a
SHA-256 of the material it was built from.

### 1.4 What the inventory shows

1. Six shapes for one idea: a skills fact index, a site CSV with an HTML page,
   two JSON dialects in one engine (`seen` and `verify_at`), a CSV with
   provenance in header comments, a dataset manifest with a hash, and Python
   constants with none.
2. The same rate is held in more than one place with independent dates. The
   Division 7A benchmark rate sits in the site CSV (page reviewed 2 September
   2026) and the engine CSV (`seen` 2026-08-28). The super guarantee percentage
   sits in the site CSV (verified 30 August 2026) and in `rates.json`
   (`seen` 2026-08-15). The four payday-super source entries are copied into
   three skills.
3. Verification granularity ranges from per row (engines, skills) to per page
   (site) to none (corporate tax constants).
4. Nothing carries a checksum a consumer could verify, except the upstream
   hash inside the benchmarks manifest.
5. Units differ silently: percent on the site, a decimal fraction in the
   Division 7A engine, cents in one table, a numerator and denominator in the
   levy module.

## 2. Proposal: one versioned rates register

### 2.1 Scope

A register of rate and threshold series only: a figure with an effective
period, a unit and a primary source. Fact entries (the skills' "how the rule
works" sentences), the business-day calendar and the benchmarks dataset stay
where they are; they are not rate series. The register can be cited from all
of them by series id later.

### 2.2 Location and versioning

Recommended home: a `rates/register/` directory in `ryanduguid.github.io`,
because the site already publishes the three CSVs at stable URLs, runs the
protected-file and link checks, and is the place a human is sent to verify a
figure. A separate repository is the alternative if the register grows past
the site's static-hosting role; that is a later decision and this proposal
works in either.

Layout:

```text
rates/register/
  README.md                  what the register is and is not
  schema/rates-register.schema.json
  series/super-guarantee.json
  series/div7a-benchmark-rate.json
  series/cents-per-kilometre.json
  series/coal-lsl-levy.json
  SHA256SUMS                 sha256 of every file above except itself
  CHANGELOG.md
```

Versioning: the schema carries `schema_version` (integer, starts at 1, bumps
only on an incompatible change). The register as a whole carries
`register_version` as a date, `YYYY.MM.DD`, set whenever any row changes, and
a matching entry in `CHANGELOG.md`. A published version is never edited; a
correction is a new version. If the register is ever released, the tag would
use a new prefix (for example `rates-register/v2026.09.05`), which touches
no existing tag prefix. Nothing is tagged by this proposal.

### 2.3 Entry schema

One file per series. Values are strings, never floats, so `12.00` and
`0.0837` survive a round trip unchanged. Every row carries its own
`verified_at`, `verified_by` and `primary_source`; a row without a check date
must be marked `unverified`, it cannot be omitted. Every file carries the
fixed advice statement as data so a consumer that prints a figure can print
the boundary with it.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://duguid.com.au/rates/register/schema/rates-register.schema.json",
  "title": "Rates register series",
  "type": "object",
  "required": ["schema_version", "register_version", "series_id", "name", "jurisdiction",
               "unit", "basis", "advice_status", "rows"],
  "additionalProperties": false,
  "properties": {
    "schema_version": {"type": "integer", "const": 1},
    "register_version": {"type": "string", "pattern": "^[0-9]{4}\\.[0-9]{2}\\.[0-9]{2}$"},
    "series_id": {"type": "string", "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$"},
    "name": {"type": "string", "minLength": 1},
    "jurisdiction": {"type": "string", "enum": ["AU", "AU-NSW", "AU-QLD", "AU-VIC", "AU-WA", "AU-SA", "AU-TAS", "AU-ACT", "AU-NT"]},
    "unit": {"type": "string", "enum": ["percent", "fraction", "cents", "aud", "days"]},
    "basis": {
      "type": "object",
      "required": ["instrument", "provision"],
      "properties": {
        "instrument": {"type": "string"},
        "provision": {"type": "string"},
        "url": {"type": "string", "format": "uri"}
      }
    },
    "advice_status": {
      "type": "string",
      "const": "Not advice. Verify each figure against its primary source at the time of use."
    },
    "rows": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["period_start", "period_end", "value", "status", "primary_source",
                     "verified_at", "verified_by"],
        "additionalProperties": false,
        "properties": {
          "period_start": {"type": "string", "format": "date"},
          "period_end": {"type": ["string", "null"], "format": "date"},
          "income_year": {"type": "string", "pattern": "^[0-9]{4}-[0-9]{2}$"},
          "value": {"type": "string", "pattern": "^-?[0-9]+(\\.[0-9]+)?$"},
          "status": {"type": "string", "enum": ["verified", "unverified", "superseded"]},
          "primary_source": {
            "type": "object",
            "required": ["title", "url", "publisher"],
            "properties": {
              "title": {"type": "string"},
              "url": {"type": "string", "format": "uri"},
              "publisher": {"type": "string"},
              "register_id": {"type": "string"},
              "series_reference": {"type": "string"}
            }
          },
          "cross_checks": {"type": "array", "items": {"type": "string", "format": "uri"}},
          "verified_at": {"type": ["string", "null"], "format": "date"},
          "verified_by": {"type": ["string", "null"]},
          "verification_note": {"type": "string"},
          "supersedes": {"type": "string"}
        },
        "allOf": [
          {"if": {"properties": {"status": {"const": "verified"}}},
           "then": {"properties": {"verified_at": {"type": "string"}, "verified_by": {"type": "string"}}}},
          {"if": {"properties": {"status": {"const": "unverified"}}},
           "then": {"required": ["verification_note"]}}
        ]
      }
    }
  }
}
```

Field rules the schema cannot express, to be enforced by a check script:

- `primary_source.url` must sit on a primary host: `legislation.gov.au`,
  `ato.gov.au`, `rba.gov.au`, a state or territory legislation site,
  `standards.aasb.gov.au` or `coallsl.com.au` for the levy instruments. A
  `duguid.com.au` page, an engine file or a skills index is a `cross_checks`
  entry, never the primary source. This closes the one-hop loop in 1.3.
- Rows in a series must not overlap and must be ordered by `period_start`.
  `period_end: null` is allowed only on the last row.
- `verified_at` must not be in the future and must not precede
  `period_start` of a row whose instrument was not yet made.
- A row may be `superseded` only by a later row citing it in `supersedes`.
- `value` holds the figure in the series `unit` and nothing derived from it.
  The register never computes; consumers convert.

### 2.4 Example series file

Populated from the super guarantee CSV as the site records it on
5 September 2026, with the site's own verification date. This is a worked
example of the shape, not a fresh verification.

```json
{
  "schema_version": 1,
  "register_version": "2026.09.05",
  "series_id": "super-guarantee",
  "name": "Superannuation guarantee charge percentage",
  "jurisdiction": "AU",
  "unit": "percent",
  "basis": {
    "instrument": "Superannuation Guarantee (Administration) Act 1992",
    "provision": "charge percentage",
    "url": "https://www.legislation.gov.au/C2004A04402/latest/text"
  },
  "advice_status": "Not advice. Verify each figure against its primary source at the time of use.",
  "rows": [
    {
      "period_start": "2025-07-01",
      "period_end": null,
      "income_year": "2025-26",
      "value": "12.00",
      "status": "verified",
      "primary_source": {
        "title": "Superannuation Guarantee (Administration) Act 1992",
        "url": "https://www.legislation.gov.au/C2004A04402/latest/text",
        "publisher": "Federal Register of Legislation"
      },
      "cross_checks": [
        "https://www.ato.gov.au/tax-rates-and-codes/key-superannuation-rates-and-thresholds/super-guarantee",
        "https://duguid.com.au/rates/super-guarantee/super-guarantee-rates.csv"
      ],
      "verified_at": "2026-08-30",
      "verified_by": "Ryan Duguid",
      "verification_note": "Final scheduled step. Payday super from 1 July 2026 changed timing, not the percentage."
    }
  ]
}
```

The `provision` above is deliberately the plain words "charge percentage".
The site page cites the Act without a section, and the payday engine's
`rates.json` cites `s 17A(2)`; the verifier records the section when the row
is verified against the compilation, and this document does not choose one.

### 2.5 Integrity: `SHA256SUMS`

`SHA256SUMS` lists the SHA-256 of every file in `rates/register/` except
itself, in `sha256sum` format, regenerated by a script on every register
version and checked in CI. A consumer downloads the series file and the sums
file, runs `sha256sum --check --ignore-missing SHA256SUMS`, and only then reads
a value. The same pattern already ships in Ozzit and DrDebits releases, so
nothing new is invented. If the register is ever released as a tagged asset,
the release policy's attestation workflow would cover it; that is not
proposed here.

### 2.6 Checks to add with the register

- Schema validation of every `series/*.json` against the schema.
- The host allowlist, ordering, overlap and future-date rules from 2.3.
- `SHA256SUMS` matches the tree.
- The site's existing `check_links.py` resolves every `primary_source.url`
  and `cross_checks` entry, since the register would live under the site.
- A drift test: for each series the register also holds, the site CSV and the
  engine table must agree with the register row for the same period, or the
  engine must cite the register version it was built from. This is the check
  that ends the duplicate-with-independent-dates problem.

### 2.7 Migration order, when consumers exist

No consumer changes are proposed now. When they are:

1. Site CSVs become generated from the series files (the HTML pages already
   link the CSVs, so their URLs do not change).
2. `div7a-loan-review/benchmark_rates.csv` and `paydaysuper/data/rates.json`
   gain a `register_series` and `register_version` field, and their check
   dates come from the register row.
3. `the-exchequer-tally` moves `BRE_RATES` and the turnover thresholds into a
   data file with the same fields, which is the only table in the inventory
   with no check date at all.
4. Skills `sources.json` entries that describe a rate gain a `series_id`
   pointer; fact entries stay as they are.
5. The levy constants in `assets/levy.mjs` read from the `coal-lsl-levy`
   series at build time.

### 2.8 Decisions for the owner

- Register home: the site repository (recommended) or a new repository.
- Who verifies and signs: `verified_by` is a person, and the proposal assumes
  the owner. A second verifier field can be added without a schema bump.
- Cadence: a scheduled check that flags a row whose `verified_at` is older
  than a chosen age (six months is the number the forks policy already uses)
  as due for re-verification, without changing the value.
- Whether `unverified` rows may be published at all, or only held on a branch
  until verified.
