# Contributing

The site is HTML with shared Jekyll includes, checked by standard-library
Python scripts and a small set of Node tests. Read [DESIGN.md](DESIGN.md)
before changing a page.

## Local checks

Use Ruby 3.3 with Bundler, Python 3.10 or newer and Node 22. Run `bundle install`
once for the locked Jekyll build. `.github/workflows/checks.yml` runs the
pinned linters first, then the site checks on Python 3.10, 3.12 and 3.13:

```bash
python -m pip install "ruff==0.16.6" "mypy==2.3.1"
python -m ruff check .
python -m mypy
python scripts/check_site.py
```

Use `python scripts/check_site.py --offline` to skip external requests while
checking the built pages and local links. CI runs live link checks on Python
3.12 and offline checks on the other versions. HTTP 429 retries honour
`Retry-After`, with a five-attempt limit and at most 30 seconds of waiting per
fetch. An unresolved rate limit still fails the live check.

The browser and Lighthouse jobs need `npm ci` and Chromium; the README
describes them.

The browser job also runs `npm audit --audit-level=high`, including development
dependencies, and fails on high or critical advisories. Lighthouse reports are
retained for seven days after successful and failed runs.

The weekly source-freshness workflow checks the changelog's release links with
`node scripts/stamp-source-freshness.mjs --check-releases`. This reads public
GitHub releases without credentials and compares stable version numbers within
each package's tag prefix. API failures fail the check. A newer release needs
editorial review of the changelog and capability descriptions; the check does
not rewrite pages or evaluation pins. Its offline tests run through the site
check command above.

The npm override pins `@puppeteer/browsers` to 3.2.2 because Lighthouse CI's
dependency chain otherwise installs vulnerable `extract-zip` 2.0.1
([GHSA-7pqw-9j4j-h8q3](https://github.com/advisories/GHSA-7pqw-9j4j-h8q3)).
Keep the browser and Lighthouse checks when changing this override. Remove it
when Lighthouse CI's dependency chain uses a version without `extract-zip`.

The `qs` override pins Lighthouse CI's query parser to 6.16.0, which fixes
[query-parser denial-of-service issues](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g).
Remove it when Express allows a fixed release without the override. Run the browser,
capture, and Lighthouse checks when changing it.

GitHub runners cannot fetch [SBR](https://www.sbr.gov.au/) or
[SuperStream standards](https://softwaredevelopers.ato.gov.au/SuperStreamStandard).
Both returned HTTP 200 locally on 10 September 2026. In
[run 34593410260](https://github.com/ryanduguid/ryanduguid.github.io/actions/runs/34593410260),
the runner also timed out on [applying for an ABN](https://www.abr.gov.au/business-super-funds-charities/applying-abn),
[final pay](https://www.fairwork.gov.au/ending-employment/final-pay) and the
[TPB register](https://www.tpb.gov.au/public-register). These three URLs returned
HTTP 200 locally on 11 September 2026. The link checker reports all five exact
URLs as requiring manual verification in GitHub Actions. Run
`python scripts/check_links.py` locally before changing any of them; local runs
still fetch all five. Remove the CI exceptions when runner access works again.

That run also returned HTTP 403 for 21 ATO source URLs that returned HTTP 200
locally on 11 September 2026. They are listed individually in
`ATO_AUTOMATION_DENIAL_URLS` in `scripts/check_links.py`. Only HTTP 403 is accepted
for those exact URLs; other errors and unlisted URLs still fail. Recheck them
locally before changing a source link and remove exceptions when access permits.

Install the git hooks once with `python -m pip install pre-commit && pre-commit install`; they run the pinned ruff check and ruff format on staged files.

## Pull requests

Suggested resources should support Australian accounting work, have clear
documentation and current maintenance where applicable, and be open-source
software, official public resources or free developer interfaces.

Keep every link to a live target, keep marketing vocabulary out of visible
text, and regenerate `llms-full.txt` with `python scripts/build_llms_full.py
--write` when a page's main text or `llms.txt` changes. That command also copies
the canonical `llms.txt` to `.well-known/llms.txt`; do not edit the copy by hand.
The sitemap contains indexable HTML only; `robots.txt` links both text indexes.
For a potential security vulnerability follow [SECURITY.md](SECURITY.md).
