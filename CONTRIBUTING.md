# Contributing

The site is HTML with shared Jekyll includes, checked by standard-library
Python scripts and a small set of Node tests. Read [DESIGN.md](DESIGN.md)
before changing a page.

## Local checks

Use Ruby 3.3 with Bundler, Python 3.10 or newer and Node 22. Run `bundle install`
once for the locked Jekyll build. `.github/workflows/checks.yml` runs the
pinned linters first, then the site checks on Python 3.12:

```bash
python -m pip install "ruff==0.16.6" "mypy==2.3.1"
python -m ruff check .
python -m mypy
python scripts/check_site.py
```

Use `python scripts/check_site.py --offline` to skip external requests while
checking the built pages and local links. CI uses `python scripts/check_site.py --ci`:
pull requests whose changed files contain no links, templates or front matter
use offline checks. Potential link, template, script or configuration changes
keep live checks. Pushes, scheduled
runs and manual runs keep live checks too. An unavailable merge comparison runs
the live checks. HTTP 429
retries honour
`Retry-After`, with a 5-attempt limit and at most 30 seconds of waiting per
fetch. An unresolved rate limit still fails the live check.

The browser and Lighthouse jobs need `npm ci` and Chromium; the README
describes them.

The browser job also runs `npm audit --audit-level=high`, including development
dependencies, and fails on high or critical advisories. Lighthouse reports are
retained for 7 days after successful and failed runs.

The weekly source-freshness workflow checks the changelog's release links with
`node scripts/stamp-source-freshness.mjs --check-releases`. This reads public
GitHub releases without credentials and compares stable version numbers within
each package's tag prefix. API failures fail the check. A newer release needs
editorial review of the changelog and capability descriptions; the check does
not rewrite pages or evaluation pins. Its offline tests run through the site
check command above. The same run reads every tool page's `release-meta` line:
a page may keep a worked example pinned to an older release, but then the page
text must name the current release too, so a reader installing from the page
knows which version they get. `scripts/release_record.json` (below) is the
reviewed statement for the components it lists; this weekly read covers the
tool pages outside it.

The same workflow runs `node scripts/check_production.mjs`, which fetches the
live pages and holds them to the delivery promises in the README: the five
Cloudflare response headers, the two edge redirects, and `mailto:` links that
arrive intact. Injected inline scripts and the analytics tag are printed as
notes because the page's Content Security Policy blocks them.

`scripts/design_baseline.json` pins digests of the machine-readable files, the
rates pages and every page's JSON-LD. After a content edit, run
`python scripts/check_design.py --update-baseline` and check that the diff
touches only the pages you changed.

## Ruby Sass in the locked chain

`Gemfile.lock` resolves Jekyll 3.10.0 to jekyll-sass-converter 1.5.2 and Ruby
Sass 3.7.4. Ruby Sass reached end of life on 26 March 2019 and its maintainers
direct users to Dart Sass. As at 18 September 2026 GitHub's advisory database
lists no advisory against the `sass` or `jekyll-sass-converter` gems, and the
one Jekyll advisory, GHSA-4xjh-m3qx-49wc, stops at 3.8.4 and does not reach
3.10.0. So this is unmaintained software in the dependency graph, not a known
vulnerability.

It is also unreached. The site is written in plain CSS under `assets/`, so the
converter is installed but never given an input. `scripts/test_build_site.py`
enforces that: it fails on any `.scss` or `.sass` source, and on any stylesheet
carrying front matter, because Jekyll 3 hands those to the converter. Keep
writing plain CSS and the unsupported code stays off the build path.

Removing the gem is not a dependency bump. Jekyll 3.10.0 is pinned to match
what GitHub Pages actually runs, and jekyll-sass-converter is Jekyll's own
dependency, so the gem cannot be dropped while the site uses the Pages legacy
build. Migrating means changing how the site is deployed: build with a current
Jekyll in Actions and publish the artefact, which replaces the Pages legacy
build with a workflow, changes the deployment surface and needs the Pages
source setting changed from a branch to GitHub Actions. That is a hosting
decision, so it is recorded here rather than made in a pull request. Whoever
takes it should keep the rendered output byte-identical where possible and run
the full offline check, the browser suite and Lighthouse against the result
before switching the Pages source.

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
[TPB register](https://www.tpb.gov.au/public-register). These 3 URLs returned
HTTP 200 locally on 11 September 2026. The link checker reports all 5 exact
URLs as requiring manual verification in GitHub Actions. Run
`python scripts/check_links.py` locally before changing any of them; local runs
still fetch all 5. Remove the CI exceptions when runner access works again.

That run also returned HTTP 403 for 21 ATO source URLs that returned HTTP 200
locally on 11 September 2026. They are listed individually in
`ATO_AUTOMATION_DENIAL_URLS` in `scripts/check_links.py`. Only HTTP 403 is accepted
for those exact URLs; other errors and unlisted URLs still fail. Recheck them
locally before changing a source link and remove exceptions when access permits.

The [Division 7A benchmark rate table](https://www.ato.gov.au/tax-rates-and-codes/division-7a-benchmark-interest-rate)
also returned HTTP 403 in [run 34852175800](https://github.com/ryanduguid/ryanduguid.github.io/actions/runs/34852175800).
The local link check and Camofox both returned HTTP 200 on 14 September 2026.
Its exact URL is in the same exception list; other statuses and neighbouring
URLs still fail. Recheck local access before changing the link, and remove
the exception when runner access permits.

The six ATO sources behind the car limit and FBT rate tables returned HTTP 403
in [run 35459888870](https://github.com/ryanduguid/ryanduguid.github.io/actions/runs/35459888870)
and HTTP 200 locally and in Camofox on 20 September 2026; they are in the same
list under the same rule.

## Release claims

`scripts/release_record.json` is the reviewed statement of which release each page
documents, which release is published, and which release each preserved evaluation
reproduced. `scripts/check_site.py` validates the pages against it offline; no
ordinary build fetches a version number.

Refresh it deliberately, not on a schedule:

```bash
python scripts/release_record.py --verify-live
```

That reads the public GitHub, PyPI and MCP registry records and reports drift. It
changes nothing. Review each difference, then update the record and the pages it
covers together. A newer release does not change a preserved evaluation: those keep
the version they were run against, and the tests fail if one is quietly upgraded.
A page may document an older release than the published one, but it must say so in
its own words, naming both versions.

## Visibility benchmark

`docs/visibility-benchmark/` holds the reviewed prompts and any recorded captures,
and stays out of the published site. Read its README before recording a round.

```bash
python scripts/visibility_benchmark.py --template > docs/visibility-benchmark/captures/round.json
python scripts/visibility_benchmark.py --check docs/visibility-benchmark/captures/round.json
python scripts/visibility_benchmark.py --summary docs/visibility-benchmark/captures/round.json
```

Each command names the same file, so what you validate is what you summarise.
With no path, `--check` and `--summary` read every capture in that directory. A
named file that does not exist fails rather than being skipped. The template is
deliberately unfinished: it needs a recorder, and an observation marked complete
needs its evidence, so it does not validate until a real round is recorded in it.
A summary validates first and withholds every metric when any selected file fails.

Install the git hooks once with `python -m pip install pre-commit && pre-commit install`; they run the pinned ruff check on staged files.

## Pull requests

Suggested resources should support Australian accounting work, have clear
documentation and current maintenance where applicable, and be open-source
software, official public resources or free developer interfaces.

Keep every link to a live target, keep marketing vocabulary out of visible
text, regenerate `feed.xml` with `python scripts/build_feed.py --write` after a
changelog edit, and regenerate `llms-full.txt` with `python scripts/build_llms_full.py
--write` when a page's main text or `llms.txt` changes. That command also writes
each page's entry to `index.txt` beside it (the Machine view fetches that file)
and copies the canonical `llms.txt` to `.well-known/llms.txt`; do not edit those
copies by hand.
The sitemap contains indexable HTML only; `robots.txt` links both text indexes.
For a potential security vulnerability follow [SECURITY.md](SECURITY.md).
