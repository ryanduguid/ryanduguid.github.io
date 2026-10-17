# Review preview provenance

Captured on 17 October 2026 using Python 3.15.0 and the unchanged fictional
fixtures in accounting-review-pipeline. No client records or live APIs were used.
The website's existing example versions remain fixed.

Monthly Close Controls source: ae88966fc416f6f2ad618652779c50d0e348949d,
packages/monthly-close-control-plane. From that directory:

```text
python -m closecontrol.cli review --current examples/current_trial_balance.csv --prior examples/prior_trial_balance.csv --mapping examples/account_mapping.csv --subledger examples/subledger_balances.csv --absolute-threshold 10000 --percentage-threshold 0.10 --reconciliation-tolerance 0.01 --review-note examples/review_note.json --output <directory outside version control>
```

Expected and observed: exit 2, REVIEW, 8 exceptions and 6 draft queries.
The website carries the generated exceptions.csv unchanged.

Workpaper Review Gate source: tag review-ready-gate/v0.1.3, commit
2de565b3ce3916afe718b2b895d5474930030aee, packages/review-ready-gate:

```text
python -m reviewready.cli gate --profile bas --pack examples/bas-not-ready --output <directory outside version control>
python -m reviewready.cli gate --profile bas --pack examples/bas-ready --output <another directory outside version control>
```

Expected and observed: exit 2, NOT_READY, 3 findings; then exit 0, READY,
0 findings. The website carries the incomplete pack's findings.csv and the
corrected pack's readiness-summary.md. Only platform line endings are normalised
to the repository's LF policy; the CSV's UTF-8 byte-order mark is retained.

These are outputs from MIT-licensed software and synthetic fixtures. The report
formats and human review boundary belong to those exact source versions.
