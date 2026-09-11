Lumbridge Services sample
Prepared 11 September 2026. All amounts are AUD.

This is a fictional Newcastle maintenance business. Its businesses, customers,
invoices and accounts are fabricated. No client outcome, forecast accuracy or
time saving has been measured. The independent accountant trial remains pending.

OPEN THE SAMPLE

Open lumbridge.xlsx in desktop Excel with automatic calculation. It needs no
Xero login, macros or external links. Assumptions!B2 accepts a whole-calendar-day
receipt delay from 0 to 120. Restore 0 after trying the 45-day case.

The sample ZIP includes the workbook, source CSVs, assumptions, management
briefing and trial guide. Briefing and CSV values are fixed exports; editing the
workbook does not change them. For an unaided trial, record your answers before
reading the briefing or published results, and note any results already seen.
The separate reviewer answer key is not included in the ZIP.

SOURCE AND REPRODUCTION

The Australian FP&A pack extends Jeff Brines / Guiderail's openfpa.
Source commit: 386c7ff31f7989b86445ef37d83a912fcb02bb47
https://github.com/ryanduguid/au-fpa-pack/tree/386c7ff31f7989b86445ef37d83a912fcb02bb47/examples/lumbridge-services
Upstream: https://github.com/JeffBrines/openfpa
The ZIP includes the source repository's MIT licence with both copyright notices.

From that source checkout, using Python 3.11:
uv sync --locked --extra dev
uv run --locked --extra dev python examples/lumbridge-services/models/generated/lumbridge.py

This recreates the output, then verifies 21 monthly workbook lines against the
Python model. A new export can have different package metadata or cache bytes.

CHECKED WORKBOOK

SHA-256: b150de6281fccb6dcb1d221c034b047eb610ad4064972c5d9ac9fca8916b8463

The distributed workbook reuses the exact native-verified file from the original
example. Its model and all six inputs match the captured source commit after
normalising line endings. A fresh formula check on 11 September 2026 passed all
21 monthly lines. The full offline repository suite also passed.

The original native Excel 16.0 record, dated 11 September 2026, checked 116 cells
and 13 chart values per case at 0, 45 and 100-day delays, invalid input bounds,
formula errors and save/reopen behaviour. These are technical checks, not an
independent accountant trial or professional sign-off.

MODEL LIMITS

Only the receipt-delay scenario is supported. Monthly revenue, wages and other
operating assumptions are fixed. Payment dates, withholding, workers
compensation, tax instalments and loan terms are supplied scenario assumptions.
Read the source README for their full definitions. The output is not a complete
forecast statutory balance sheet and does not model intraday bank liquidity.

Varrock and Falador are Old School RuneScape naming references. No game assets
are used and no affiliation with Jagex is claimed.

FEEDBACK

https://duguid.com.au/contact/#example-feedback
Use the synthetic files and identify the step, result and Excel version.
