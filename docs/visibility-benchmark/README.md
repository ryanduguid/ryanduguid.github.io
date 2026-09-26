# Assistant visibility and accuracy benchmark

A repeatable way to record what assistants say about this work, using the
repository's own Python and no new service. It measures two separate things and
never blends them:

- **Visibility.** Did an answer mention the site, and did it cite a page.
- **Accuracy.** Were the facts in the answer right.

`docs/visibility-benchmark/prompts.json` holds the reviewed prompts, their
sourced expected facts and the specific errors worth counting.
`scripts/visibility_benchmark.py` validates and summarises captures.
`scripts/test_visibility_benchmark.py` covers both and runs offline in
`check_site.py`.

## Run a round

```bash
python scripts/visibility_benchmark.py --template > docs/visibility-benchmark/captures/2026-09-18-chatgpt.json
# answer the prompts by hand, fill in the file, keep the answers beside it
python scripts/visibility_benchmark.py --check docs/visibility-benchmark/captures/2026-09-18-chatgpt.json
python scripts/visibility_benchmark.py --summary docs/visibility-benchmark/captures/2026-09-18-chatgpt.json
```

Every command names the same file, so what you validate is what you summarise. With
no path, both reading modes cover every capture in `captures/`. A named file that
does not exist is a failure, not a quiet pass, and `--template`, `--check` and
`--summary` are mutually exclusive so a supplied mode is never ignored.

The template does not validate on its own, by design. It needs a recorder, and any
observation you mark `complete` needs the evidence the validator requires. Leave the
prompts you did not run as `not_run` or `blocked` with a reason: they need no result
fields, they stay out of every denominator, and they report under the same system as
the completed answers in the same file.

A summary validates the files it was given before counting anything. If any selected
file fails, the metrics are withheld and the diagnostics are what you get, because a
partial report of a partly invalid round would misstate it.

One file per system per round. Send each prompt exactly as `prompts.json` records
it: the validator rejects a reworded prompt, because a reworded prompt is a
different measurement. Use a fresh session for each prompt and say so in the
capture. Record the search-enabled state, because an answer composed without
retrieval says nothing about whether a page is reachable.

Keep a copy of `prompts.json` beside each round and record the repository commit in `run_notes`. The template records `answer_key_sha256`, a fingerprint of the exact prompts, sourced facts and error definitions. A changed or missing fingerprint blocks real summaries. To review a historical round, use its retained answer key with the repository revision that recorded it; do not replace the fingerprint to force a pass. Fixtures remain labelled test data and are exempt from this historical-key check.

Keep the answer itself. `answer_evidence` points at a retained transcript or
screenshot; a summary written from memory is not evidence. The validator checks
only that the reference is not blank. It does not open the file, confirm the file
exists or judge whether the answer was right, and it never reaches the network to
do so. Those remain the recorder's responsibility.

## What the numbers mean

- A mention is not a citation. An assistant can describe the work without linking
  it, and that is recorded separately.
- A citation is not a ranking, and a search result page is not an assistant's
  answer. Never report the two together.
- One response is one observation. Assistants vary between runs, so repeat a
  prompt across rounds before reading a trend.
- Branded prompts, which name Ryan Duguid or a product, are summarised apart from
  non-branded prompts, which describe a need. Being found by name proves nothing
  about being found by need.

Denominators are the completed observations in the group being summarised.
An observation that was not run, or was blocked by a sign-in or a rate limit, is
recorded with a reason and excluded from the denominator. It is never counted as
a zero, a failure or an absent citation.

Every file under `captures/` that carries `"fixture": true` is invented test data
for the validator. The summary excludes fixtures unless `--include-fixtures` is
passed, and the tests assert that separation. No real observation has been
recorded through this tool yet.

## Adoption measures that already exist

These need no new dependency and stay inside the current privacy policy, which
records that the site sets no cookies of its own and that the browser security
policy blocks the analytics script the delivery network injects. Nothing here
tracks a visitor.

| Measure | Where it comes from | What it cannot tell you |
| --- | --- | --- |
| Release asset downloads | The GitHub release page for each tagged asset | Nothing about who downloaded it or whether it was used |
| Package downloads | PyPI's public download statistics per distribution | Inflated by mirrors and continuous integration |
| Repository traffic | GitHub's own traffic panel, retained 14 days | Aggregate only, and it expires quickly |
| Delivery request counts | The Cloudflare account's own request metrics | Requests, not people or sessions |

Adding an analytics script to make this benchmark look complete would change the
site's privacy position for no measurement worth having. Do not do it.

## Keeping it honest

Record the run, not the conclusion you wanted. If a system cannot be reached, say
so and leave the cell empty. Do not average across systems, do not compare a
branded count with a non-branded one, and do not describe any change in these
numbers as an effect of a site change unless something else rules out the
alternatives.
