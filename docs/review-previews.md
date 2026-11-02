# Review preview provenance

Both captures use the unchanged fictional fixtures in
accounting-review-pipeline. No client records or live APIs were used.

Monthly Close Controls source: 6cd77689cfee98664468a833da6961ef95b0d5c2,
packages/monthly-close-control-plane, the unreleased native 1.0.0 source.
Captured on 2 November 2026 on Linux with Rust 1.99.0, which that directory's
rust-toolchain.toml selects. From that directory:

```text
cargo run --locked --release --bin close-control -- review --current examples/current_trial_balance.csv --prior examples/prior_trial_balance.csv --mapping examples/account_mapping.csv --subledger examples/subledger_balances.csv --absolute-threshold 10000 --percentage-threshold 0.10 --reconciliation-tolerance 0.01 --review-note examples/review_note.json --output <directory outside version control>
```

Expected and observed: exit 2, REVIEW, 8 exceptions and 6 draft queries.
The same command with `--output ./close-control-demo` exits 1 with an output
error saying the directory is inside the version-control checkout, and creates
nothing. The website carries the generated exceptions.csv with its CRLF line
endings normalised to the repository's LF policy; the UTF-8 byte-order mark is
retained. The previous capture, at ae88966fc416f6f2ad618652779c50d0e348949d
with Python 3.15.0 on 17 October 2026, gave the 5 period-variance rows the
reason 'YTD net balance moved beyond both configured materiality thresholds.';
the native command writes 'YTD net balance movement met or exceeded both
configured materiality thresholds.' Every other cell is unchanged.

Workpaper Review Gate source: tag review-ready-gate/v0.1.3, commit
2de565b3ce3916afe718b2b895d5474930030aee, packages/review-ready-gate,
captured on 17 October 2026 using Python 3.15.0:

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
