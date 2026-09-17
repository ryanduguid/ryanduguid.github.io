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
python scripts/visibility_benchmark.py --template > round-2026-09-18-chatgpt.json
# answer the prompts by hand, fill in the file, keep the answers beside it
python scripts/visibility_benchmark.py --check
python scripts/visibility_benchmark.py --summary docs/visibility-benchmark/captures/*.json
```

One file per system per round. Send each prompt exactly as `prompts.json` records
it: the validator rejects a reworded prompt, because a reworded prompt is a
different measurement. Use a fresh session for each prompt and say so in the
capture. Record the search-enabled state, because an answer composed without
retrieval says nothing about whether a page is reachable.

Keep the answer itself. `answer_evidence` points at a retained transcript or
screenshot; a summary written from memory is not evidence.

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
| Returned trial reports | Completed copies of the reviewer trial guide | Only what a reviewer chose to send |

Adding an analytics script to make this benchmark look complete would change the
site's privacy position for no measurement worth having. Do not do it.

## Keeping it honest

Record the run, not the conclusion you wanted. If a system cannot be reached, say
so and leave the cell empty. Do not average across systems, do not compare a
branded count with a non-branded one, and do not describe any change in these
numbers as an effect of a site change unless something else rules out the
alternatives.
