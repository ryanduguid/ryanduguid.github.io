# Contributing

The site is HTML with shared Jekyll includes, checked by a Rust binary,
`site-tools` (the crate in `scripts/`), and a small set of Node tests. Read [DESIGN.md](DESIGN.md)
before changing a page.

## Local checks

Use Ruby 3.3 with Bundler, Rust through rustup, Python 3.14 or newer and Node 24 LTS.
Run `bundle install` once for the locked Jekyll build and
`cargo install --locked --path scripts` for `site-tools` (again after pulling
changes). A `site-tools` built from other `scripts/` sources than the checkout
refuses to write there (`--write`, `--update-baseline`, the `build_*` commands,
`check_ato_sources` with a baseline, report or issue path, and the other commands
that write files) and warns before any other command; the message names both
source digests. `.github/workflows/checks.yml` runs the pinned linters first, then the
site checks:

```bash
python -m pip install --require-hashes --requirement requirements-lint.txt
python -m ruff check .
python -m ruff format --check .
python -m mypy
cargo fmt --manifest-path scripts/Cargo.toml --check
cargo clippy --manifest-path scripts/Cargo.toml --locked --all-targets -- -D warnings
site-tools check_site
```

Use `site-tools check_site --offline` to skip external requests while
checking the built pages and local links. CI uses `site-tools check_site --ci`:
pull requests whose changed files contain no links, templates or front matter
use offline checks, as do HTML changes limited to plain paragraph text in pages
whose only Liquid is the shared header, footer and stylesheet version. Potential link, template, script or configuration changes
keep live checks. Pushes to `main` use offline checks, because branch protection
admits them only after their pull request's checks; scheduled and manual runs
keep the full live sweep. An unavailable merge comparison runs
the live checks. PRs changing only the six excluded root documents (`AGENTS.md`,
`CLAUDE.md`, `CONTRIBUTING.md`, `DESIGN.md`, `README.md`, `SECURITY.md`) or `docs/`
use offline site checks and omit browser and Lighthouse execution. Lint, site
validation, type checking, dependency audit and the aggregate gate still run.
The selector requires an actual two-parent PR merge comparison; unknown or
mixed changes keep the full checks. Site validation verifies that the allowed
paths stay excluded from publication.

Transient HTTP 5xx and transport failures wait 1, 2, 4 and 8 seconds between
attempts. HTTP 429 and 5xx `Retry-After` headers take precedence. Each fetch
allows five attempts and at most 30 seconds of accumulated waiting; this is
separate from each request's 30-second timeout. Exhausted retries and permanent
HTTP errors still fail the live check, except on pull requests that run live
link checks: there `check_site --ci` passes `--transient-warnings`, and a link
still failing with HTTP 429, 5xx or a timeout after its retries is reported as a
warning (a `WARN` line and an Actions annotation) instead, as is a
`web.archive.org` snapshot that fails with any transport error (such as a
refused connection), because the archive refuses bursts of automated requests.
HTTP 4xx other than the refusals below, including a 404 from the
archive, and DNS and other transport failures on other hosts still fail pull
requests, and an own-repository link that warns still gets its identity and
archive lookup. The weekly scheduled and manual runs keep
every failure strict, so a host that stays down fails within a week.

On a server error from a `github.com/ryanduguid/<repo>/blob/<ref>/<path>` file
view, remaining attempts use `raw.githubusercontent.com/ryanduguid/<repo>/<ref>/<path>`.
This uses the same five-attempt and 30-second waiting budget. The direct file
must return HTTP 2xx at that exact HTTPS URL; redirects, missing files and
unknown refs fail. Repository identity and archive checks still run. This
qualifies the linked file's availability, not the HTML viewer. Other GitHub
routes, owners, query-bearing URLs, HTTP 4xx and transport errors keep their
existing handling.

The browser and Lighthouse jobs need `npm ci` and Chromium; the README
describes them. CI splits the browser tests across two Windows jobs with
Playwright's `--shard`, and the first also runs the type check, proof capture and
dependency audit. Lighthouse runs as three jobs: `LHCI_SHARD=2/3 npm run test:lighthouse`
runs the second job's pages, and leaving it unset runs every page.

Run `npm run typecheck` after `npm ci` to check the calculator and WebMCP
contracts. TypeScript checks the existing JavaScript without emitting files.
The compiler cases in `tests/types/calculators.ts` must reject invalid input
and result types; the Node tests still check validation and rounding.

The business calculators work in integer cents. Money results round half up to
the cent. Margin, markup and variance percentages round half away from zero to
two decimal places, as Excel's ROUND does, and are worked out from the exact
cents ratio. A percentage that rounds to zero shows as 0.00%, never −0.00%. Keep
both rules in `assets/business-calculators.mjs` and the note on the calculator
pages in step.

Stylesheet links carry a `v` query value because Cloudflare caches CSS for four
hours. When changing `assets/tokens.css` or `assets/site.css`, update the quoted
`asset_version` in `_config.yml` so the new HTML requests fresh CSS. Page and
layout sources use that setting, and the design checks validate the rendered
URLs and stylesheet order. When changing `assets/accounting-pages.css`, update
its value in the layouts and pages that link it and in `scripts/src/check_design.rs`.
Use the release date as `YYYYMMDD`, adding a lowercase suffix for another
release on the same day.

The browser job also runs `npm audit --audit-level=high`, including development
dependencies, and fails on high or critical advisories. Lighthouse reports are
retained for 7 days after failed runs.

Browser CI fails when a test passes only on retry. Failed attempts keep their
traces for diagnosis, even if a retry passes.

The source-freshness workflow checks the changelog's release links every day with
`site-tools stamp_source_freshness --check-releases`; its date-refresh and
production jobs run on Mondays only. This uses the GitHub
CLI to read releases and compares stable version numbers within
each package's tag prefix. API failures fail the check. A newer release needs
editorial review of the changelog and capability descriptions; the check does
not rewrite pages or evaluation pins. After it, the `tool-releases` job runs
`stamp_source_freshness --write-tool-releases` and opens one pull request from
`automation/tool-releases` with the refreshed snapshot, pages and mirrors. Before
it can push, `stamp_source_freshness --verify-tool-releases` refuses a snapshot
line that changes more than a release version, date or commit, a stamped page
that is not what `apply_tool_releases` writes from main, and any other file that
is not a text mirror `build_llms_full --check` regenerates. That
pull request never auto-merges and is not overwritten whilst open: add the
changelog row, review the prose and any licence name, then merge it. Install `gh` and sign in with `gh auth login`
for a local live check. Actions supplies its read-only token to `gh`; the command
does not read or print the token. Its offline tests run through the site
check command above. The same run reads every tool page's `release-meta` line:
a page may keep a worked example pinned to an older release, but then the page
text must name the current release too, so a reader installing from the page
knows which version they get. `scripts/release_record.json` (below) is the
reviewed statement for the components it lists; this daily read covers the
tool pages outside it.

The same job also runs `site-tools release_record --verify-live` (below). When
either check finds drift (exit 1), the job opens or rewrites one issue titled
'Release references are behind the current releases', with a section for the
pages (one line per package for the changelog) and one for the release record,
comments when the list changes, and the first clean run closes it. A check that
only failed to reach its sources exits 2; with no drift elsewhere, that leaves
the issue as it was. For a release-only verification after a fix, dispatch `source-freshness.yml`
with `releases_only=true`. This runs the release check without the date-refresh or
production jobs. Scheduled runs and manual runs with the default
input on `main` still run every job. Date refreshes in GitHub Actions require
`main`; a manual run from another ref fails before refreshing dates.

When a date moves, the publish job pushes `automation/source-freshness` and opens
its pull request with a GitHub App token. GitHub holds `pull_request` runs raised
with `GITHUB_TOKEN` for approval, and an unapproved run ends as a failed run with
no jobs; App-raised runs start normally. The App is installed on this repository
only, with Contents and Pull requests read and write and no Workflows permission.
Its client ID is the repository variable `SOURCE_FRESHNESS_APP_CLIENT_ID` and its
private key the secret `SOURCE_FRESHNESS_APP_PRIVATE_KEY`; the job requests a
token limited to those 2 permissions. The job then enables squash auto-merge, so
the pull request lands once the required checks pass and the branch is up to date
with `main`; it refuses a patch that changes anything but `tools/index.html`,
`tools/index.txt` and the `llms-full` mirrors. GitHub never updates the branch by
itself, so every run of the workflow on `main` brings an open stamp pull request up
to date with the same App token. A required check that fails leaves the pull
request open for a fix.

The same workflow runs `site-tools check_production`, which fetches the
live pages and holds them to the delivery promises in the README: the five
Cloudflare response headers, the two edge redirects, and `mailto:` links that
arrive intact. Injected inline scripts are printed as notes because the page's
Content Security Policy blocks them; an analytics tag fails the check, because
the Privacy page says no analytics script is delivered.

The ATO refuses GitHub runners, so a scheduled task on the maintainer's machine
reads its pages every week instead of this workflow. The command
`site-tools check_ato_sources` reads the ATO pages cited in this repository and
in accounting-review-pipeline, au-fpa-pack, australian-accounting and
australian-accounting-skills through a local Chrome (`nodriver batch`), compares
each page's text with the copy in its `--baseline` folder and writes a dated
Markdown report to its `--out` folder (a live run needs both). A page that
returns an error status or no text, or whose text has changed substantively
since the previous run, fails the run and appears in the report with its diff
and the files citing it. Review those files against the changed page; the next
run compares against the new text, so the report is the record. A cited page
that returns HTTP 404 or 410 is noted and held, with its first date in a `.dead`
file in the baseline folder, until a read at least 3 days later agrees; it is then
listed as a dead link whose citations need repointing. The hold is per URL, so a
replaced citation starts its own, and a page that reads again clears it. A cited page whose 'Last updated'
date is after the check date of an accounting question answer citing it
(`fact_checked`, else `facts_checked` in `_data/accounting_questions.json`) also
fails, even on the run that first reads it; recheck those answers and set their
`fact_checked`. A change only to
a legal database page's related documents count, a result count, the external
link label or the Last updated stamp, or to a hub page, newsroom or single-page
application, is listed as needing no review and passes; a changed Last updated
stamp beside other changes is shown as a hint. A cited URL that redirects
permanently (301 or 308 at every hop) is listed with its target, ready to
replace in every citing file, including `scripts/src/check_links_data.rs` and
`scripts/src/site_contracts/data.rs`; like a substantive change, it raises the
issue each week until the citations are updated. With `--issue FILE` the command also
writes these findings as the body of the GitHub issue the scheduled task opens,
naming only public URLs and repository paths. The command saves the report before it
moves any baseline, and a rerun the same day adds to that day's report. A run
reads at most 1,000 URLs: over that it takes the watched pages, then those new to
the baseline, then those read longest ago, and the report says how many it left for
a later run. A page with a permanent redirect or answers to recheck counts as read
longest ago, so its finding is raised every run unless new pages fill the run. `site-tools check_ato_sources --list` prints the URLs and citing files
offline. Its tests run through the site check command.

The same sweep reads 11 pages outside the ATO whose figures their publishers
revise, listed in `WATCHED` in `scripts/src/ato_sources.rs`: the Coal LSL levy
(2.7%), NSW land tax thresholds ($1,075,000), NSW payroll tax thresholds and
rates (5.45% above $1,200,000), and the transfer duty scale of each of the 8
states and territories, by one figure from each scale. It reads them whether or not a file cites them. When one changes,
the report also lists every file containing each watched value, because the
calculators and examples reuse these values without citing the page. Update the
value in `WATCHED` with the pages that use it.

The sweep also reads every `source` and `fact_sources` page behind an accounting
question with a non-empty `fact`. These references come from
`_data/accounting_questions.json`; relative links resolve against
`https://duguid.com.au`. Missing references, credentials, non-default ports and
URLs outside the sweep's supported public HTTPS hosts stop the run before
fetching. New source hosts need an explicit addition to `FACT_SOURCE_HOSTS`.

Each page under `/rates/` is rendered by `_layouts/rate.html` from its front
matter: title, headline, dates, JSON-LD fields and questions. The `fact_check`
suite reads the latest row of the page's CSV and fails if the title lacks that
year and value, if the headline or the `/rates/` entry shows another value, or if
a Source checked date differs from `checked_at`. After a new row or a recheck,
update the front matter, the page's CSV note and the `/rates/` entry together.
Last reviewed is this page's editorial check. `date_modified` is the day the
content last changed; it sets `dateModified`, and the sitemap date matches it.

`scripts/design_baseline.json` pins digests of `robots.txt`, `sitemap.xml`, the
rates pages and every page's JSON-LD (`llms.txt` is verified structurally by
`scripts/tests/llms.rs`, `check_design`, `build_llms_full --check` and
`scripts/webmcp-tools.test.mjs` so concurrent PRs do not conflict on a whole-file hash). After a content edit, run
`site-tools check_design --update-baseline` and check that the diff
touches only the pages you changed. It also pins the JSON-LD of a new page, and
after `site-tools build_site` it recounts the protected footer text in `_site`;
without a build it leaves those counts unchanged. Build first after a rate page
edit: the digests and the JSON-LD pin of a page that uses a layout come from
`_site`.

## Effective life tables

`tools/depreciation-rates/effective-life.json` holds Schedule 2 of the
Commissioner of Taxation's effective life determination. `site-tools
build_effective_life` builds it from the instrument's EPUB on the Federal
Register of Legislation; never edit it by hand. Its `source` block records the
instrument, its registration date, its URL and the date it was read, and
`scripts/depreciation-rates.test.mjs` holds the page to the same details.

When a new or amending determination is registered (the ATO page 'Effective life
determinations, rulings and law' names the current instrument):

1. Download that version's EPUB from the Register into an empty folder and unzip
   it. The tables are in `OEBPS/document_1/document_1.html`.
2. Rebuild the file with that version's details:

   ```bash
   site-tools build_effective_life --write --source <path to document_1.html> \
     --register-id <ID> --registered <YYYY-MM-DD> --source-url <URL of its text> --read <YYYY-MM-DD>
   ```

   The builder stops at any row it cannot read, and at any entry of
   `NESTING_CORRECTIONS` that does not match exactly one row: remove an entry
   the new text no longer needs. With `--check --source <file>` it compares the
   committed file with a source and writes nothing.
3. Review the diff. The file has one line for each row, so each life that was
   changed, added or removed is one line.
4. Compare the file with a second format of the same version, the Register's
   Word file or its authorised PDF: the rows in each table, then every
   description, life, flag and date.
5. Update the counts and sampled rows pinned in `scripts/tests/effective_life.rs`
   from the authorised PDF, and its `DATA_SHA256` once step 4 finds no
   difference, then the instrument, counts, dates and attribution the page
   states. A new instrument also needs its ATO legal database citation (such as
   LI 2025/20) and commencement date in `INSTRUMENTS` in
   `assets/depreciation-working.mjs`.
6. Reread the page's sections beyond the tables against the law in force and
   move its Sources checked date. Finish as for any content edit: a changelog
   row, `build_feed --write`, `build_llms_full --write`, `check_design
   --update-baseline` and `check_site`.
7. Rebuild the effective life pages from the new file, as 'Effective life pages'
   below describes, before step 6's `check_site`, which fails until they match.

### Effective life pages

`site-tools build_effective_life_pages --write` writes a page for every life in
`effective-life.json` under `tools/depreciation-rates/industry/` and
`tools/depreciation-rates/asset/`, a group page for each Table A sub-industry and
each Table B asset with rows under it, the 2 index pages, a text mirror of each
page, `tools/depreciation-rates/sitemap.xml`, `tools/depreciation-rates/llms.txt`
and `_includes/effective-life-groups.html`, which the depreciation rates page
includes to link every group page. A Table B asset with a life of its own has an
asset page; one that only points to another row has none. Never edit these files
by hand. `--check` compares them with the data and writes
nothing; `check_site` runs it before Jekyll.

`tools/depreciation-rates/effective-life-pages.json` is the address map: each
page's key (its table, headings and wording), address, date published, date
modified and content hash. It is the only source of addresses and dates. An
address, once in the map, does not change; `published` never moves; `--write`
moves `modified` to today only for a page whose content changed.

After a new determination:

1. Run `--write`. If the data no longer has a page the map holds, it lists each
   one and refuses, as a published address must not disappear.
2. Note each listed page's `url` and `published`, delete its record and run
   `--write`: the rows that are new to the map get records of their own.
3. For each listed page, find the row it became (a reworded row, or one moved to
   another heading), set that row's `url` and `published` back to the noted ones
   and run `--write` again, which moves the page to its old address. A row removed
   outright has no successor: its address now returns 404, since GitHub Pages
   cannot send a 301. Record each such removal in the changelog row.
4. Run `--check` and review the diff: the map shows each page that changed as a
   moved `modified` date. `scripts/tests/effective_life_pages.rs` pins the page
   counts and lists the pages whose opening sentence may run long (`LONG_LEADS`):
   update both from the new determination after reading the pages they name.
5. After the change is deployed, tell search engines once. `--indexnow` prints
   the IndexNow request body for the pages dated by the last `--write`; POST it to
   a search engine's `/indexnow` endpoint as JSON. A 200 or 202 is success; 403
   means the key file at the site root does not match; 422 means a URL is on
   another host. Run `--indexnow` after the last `--write` and before the next:
   a second `--write` on another day dates only what it changed, so the first
   batch is no longer listed.

## Ozzit reference examples

The ten examples use the documented release's function index. Edit the reviewed examples in
`scripts/ozzit_reference_examples.json`, then run
`site-tools build_ozzit_reference --write`. The builder takes the documented tag
and workbook hash from `scripts/release_record.json`, so a release bump adds the
tagged index, function reference and reference record in `assets/`, updates the
release record and edits the page prose. It
fails when a page states a function, help-table or named-formula count that
differs from the index. The ordinary site checks
require the generated include to match both inputs. They also require every
formula to match the native Excel inputs and results. When the documented release
and the Excel check differ, the reference record's `example_evidence` names the
checked release and workbook hash. The v3.8.0 reference points to the v3.6.0
record in `assets/ozzit-reference-v3.6.0.json`. Each example records its result shape and a
Python format template. The generator formats every recorded result and requires
that display to equal the reviewed expected text, including array values and totals.

Changing a formula requires a new native Excel check against the named release;
editing an expected display also requires checking it against the raw result.
The workbook remains the authority. The 15 November 2026 record used the v3.6.0
`tools/excel_eval_formulas_verified.ps1`, opened the release asset, whose SHA-256
equals the workbook at the signed tag, read-only and confirmed the hash was
unchanged after closing it without saving. The v3.5.0 and v3.4.2 indexes and their
records stay in `assets/` for links to the earlier releases.
The results establish arithmetic for these examples, not an accounting treatment.

The 6 module pages under `tools/ozzit/functions/` come from
`assets/ozzit-function-reference-<tag>.json`, which Ozzit's
`ozzit function_reference src functions.csv <output>` command writes from each
function's help block in the release source. `site-tools build_ozzit_reference --write`
then writes every page from that file, and the site checks require each entry to match
the pinned index: name, module, previous name, one-line description and signature,
with no name missing or repeated. A sentence of help text that uses a word the copy
check refuses is left out, with a link to the released source. For a new release, run
that command on the tagged `src/` and `functions.csv` and save its output under the
tag's name beside the index.

## Ruby Sass in the locked chain

`Gemfile.lock` resolves Jekyll 3.10.0 to jekyll-sass-converter 1.5.2 and Ruby
Sass 3.7.4. Ruby Sass reached end of life on 26 March 2019 and its maintainers
direct users to Dart Sass. As at 18 September 2026 GitHub's advisory database
lists no advisory against the `sass` or `jekyll-sass-converter` gems, and the
one Jekyll advisory, GHSA-4xjh-m3qx-49wc, stops at 3.8.4 and does not reach
3.10.0. So this is unmaintained software in the dependency graph, not a known
vulnerability.

It is also unreached. The site is written in plain CSS under `assets/`, so the
converter is installed but never given an input. `scripts/tests/build_site.rs`
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

The same decision would let Actions build `feed.xml`, `llms-full.txt` and the
`index.txt` pages at deploy time instead of committing them. That ends their merge
conflicts, but it takes them out of the repository and changes what
`build_feed --check` and `build_llms_full --check` verify. The `changelog-rows`
and `generated` merge drivers (Pull requests, below) resolve those conflicts
without it.

The npm override pins `@puppeteer/browsers` to 3.2.2 because Lighthouse CI's
dependency chain otherwise installs vulnerable `extract-zip` 2.0.1
([GHSA-7pqw-9j4j-h8q3](https://github.com/advisories/GHSA-7pqw-9j4j-h8q3)).
Keep the browser and Lighthouse checks when changing this override. Remove it
when Lighthouse CI's dependency chain uses a version without `extract-zip`.

The `qs` override pins Lighthouse CI's query parser to 6.16.0, which fixes
[query-parser denial-of-service issues](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g).
Remove it when Express allows a fixed release without the override. Run the browser,
capture, and Lighthouse checks when changing it.

The `basic-ftp` override pins Lighthouse CI's FTP client to 6.2.6, which fixes a
[directory-listing denial-of-service issue](https://github.com/advisories/GHSA-c475-qrg2-pj4r)
in every release up to 6.2.0. `get-uri` 6.0.5 asks for `^5.0.2`, but it calls only
`Client`, `access`, `lastMod`, `downloadTo`, `list` and `close`, which 6.2.6 keeps.
Remove it when `get-uri` accepts a fixed release. Run the browser, capture, and
Lighthouse checks when changing it.

The `js-yaml` override gives Lighthouse CI's `js-yaml` 3.15.2 `argparse` 2.0.1,
which drops `sprintf-js` 1.0.3 and its
[unbounded-precision denial-of-service issue](https://github.com/advisories/GHSA-hp3w-g68c-fv3c),
which has no fixed release. Only the `js-yaml` command-line tool uses `argparse`,
and nothing here runs it; `@lhci/utils` uses the library to read configuration.
Remove it when Lighthouse CI moves to `js-yaml` 4. Run the browser, capture, and
Lighthouse checks when changing it.

GitHub runners cannot fetch [SBR](https://www.sbr.gov.au/) or
[SuperStream standards](https://softwaredevelopers.ato.gov.au/SuperStreamStandard).
Both returned HTTP 200 locally on 10 September 2026. In
run 34593410260,
the runner also timed out on [applying for an ABN](https://www.abr.gov.au/business-super-funds-charities/applying-abn),
[final pay](https://www.fairwork.gov.au/ending-employment/final-pay) and the
[TPB register](https://www.tpb.gov.au/public-register). These 3 URLs returned
HTTP 200 locally on 11 September 2026. In
run 36531719107
it timed out on the National AI Centre's
[implementation guidance](https://www.ai.gov.au/staying-safe-and-responsible/essential-ai-practices/guidance-ai-adoption-implementation-guidance)
and [AI systems register](https://www.ai.gov.au/staying-safe-and-responsible/essential-ai-practices/ai-systems-register)
pages, which returned HTTP 200 locally on 29 September 2026. In
run 43794456386
the runner's connection to Tasmania's
[rates of duty](https://www.sro.tas.gov.au/property-transfer-duties/rates-of-duty)
ended before a response, which returned HTTP 200 locally on 16 November 2026. In
run 43966788055 it did the same for 6 more Tasmanian land tax and first home pages
the land tax and transfer duty calculators cite; each returned HTTP 200 locally
on 17 November 2026. In
run 44015978829 it timed out 4 times on the ATO's
[GDP adjustment](https://softwaredevelopers.ato.gov.au/GDPupliftfactor) page that the
PAYG instalments calculator cites, which returned HTTP 200 locally on 17 November 2026
and timed out 4 times again in run 44173032679 on 18 November 2026.
In run 44229492536 the runner's connection ended before a response for 3
Tasmanian foreign investor duty surcharge pages the foreign buyer surcharge calculator
cites; each returned HTTP 200 locally on 18 November 2026.
In run 45010467606 on 22 November 2026 the connection ended the same way for the
Tasmanian first home owner grant eligibility page the first home owner grant
calculator cites, which returned HTTP 200 locally that day.
The link checker
reports every exact URL in `CI_MANUAL_URLS` as requiring manual verification in
GitHub Actions. Run `site-tools check_links` locally before changing any
of them; local runs still fetch them all. Remove the CI exceptions when runner
access works again.

Actions run 37219134539 returned HTTP 404 for the LinkedIn profile linked from
About and Contact. A public browser reached LinkedIn's login wall, and Ryan
confirmed the profile URL on 5 October 2026. That exact URL now requires manual
verification in CI. Local checks still fetch it and fail on HTTP 404; other
LinkedIn URLs receive no CI exception. Remove this exception when runner access
works again.

Government sites often refuse automated requests, GitHub's runners most of all:
by 19 November 2026 the checker held 209 cited ATO, state revenue, holiday and
legislation pages on a list of exact URLs allowed to answer HTTP 403, each loaded
locally or in a browser, every one on a `.gov.au` host, and every new citation of
such a site needed an entry. The link checker therefore reports an HTTP 403 from a
`.gov.au` host, and LinkedIn's HTTP 999, as "refused the runner": a `REFUSED`
line, an Actions annotation and a count at the end, but not a failure, because the
refusal says nothing about the page. Check a refused source in a browser when you
cite it or edit its citation. A 403 from any other host still fails, as cloud
storage answers 403 for a missing file, and so do a 404, 410, 401 or any other
HTTP error.

## Release claims

`scripts/release_record.json` is the reviewed statement of which release each page
documents, which release is published, and which release each preserved evaluation
reproduced. `site-tools check_site` validates the pages against it offline; no
ordinary build fetches a version number.

Refresh it deliberately, not on a schedule:

```bash
site-tools release_record --verify-live
```

That reads the public GitHub, PyPI and MCP registry records and reports drift. It
changes nothing. It exits 1 when a source has drifted, is absent or has changed,
and 2 when no source could be read; `GH_TOKEN`, when set, authenticates its
GitHub API calls. Review each difference, then update the record and the pages it
covers together. A newer release does not change a preserved evaluation: those keep
the version they were run against, and the tests fail if one is quietly upgraded.
A page may document an older release than the published one, but it must say so in
its own words, naming both versions. A page documenting a published release whose
record carries `asset_sha256` must link its `download_url` and show that hash and
the asset size in bytes.
For a component with engine pins, an older guide must also record its release's
pins in `documented.pinned_engines`. The checker validates the guide against those
pins; the component's `pinned_engines` still describes the published release.
When the MCP registry still lists an older version than the published one, record
it as `published.registry_lag` with that version and the sentence the documented
page uses; `--verify-live` then reports drift once the registry catches up, and the
offline check refuses a documented page that says the registry still lists, shows
or has not caught up with a version whilst the record holds no lag. When GitHub holds a newer
release than PyPI, because the owner has yet to publish it, record the older version as
`published.pypi_lag` with the sentence the documented page uses; `--verify-live` then expects
PyPI to serve that version, reports drift once it catches up, and the offline check refuses a
documented page that lacks the sentence. Other pages
that name the published release are listed in the component's
`published_mentions`, each with the text the page must show, where `{version}` is
the published version and `{<engine>}` that engine's pin in the component's
`pinned_engines`, the published release's pins.

## What an agent can be made to run

`llms.txt`, the per-page text alternates, the README and everything the index
links an agent to, including the agent-skills manifest, are instruction files:
an agent reads them and runs what they say. So an install command in them executes on
a reader's machine, and two things follow.

A package name nobody has published is claimable by anyone, who then serves their
own code from a command printed in an official file. An unpinned third-party
command runs whatever that registry serves at read time, so someone else's later
release changes what this site tells an agent to do. Ryan's own names resolve to
his own latest release, so those may stay unpinned; anything published by someone
else names its version.

`scripts/agent_file_policy.json` is the reviewed record of every package those
files can install, and `site-tools check_agent_files` holds the pages to it
offline. It also refuses invisible and direction-control characters, which a
reader never sees and a model reads in full.

Refresh the record deliberately:

```bash
site-tools check_agent_files --verify-live
```

That asks PyPI and npm whether each recorded name is still published and reports
drift. It changes nothing. A name of Ryan's that stops being published is the
finding that matters: the name is then free for someone else to claim while these
files still tell agents to install it.

## Passage rules

`site-tools check_passages` holds each page in `sitemap.xml` to the rules below, so a passage quoted alone keeps its subject and a page answers before it explains. It reads each page's `index.txt`, the visible main text, so run `site-tools build_site` and `site-tools build_llms_full --write` first. `site-tools check_site` runs it.

| Rule | Limit |
| --- | --- |
| The page's lead, the first paragraph after the H1 | required, at most 45 words |
| The first sentence under an H2 or H3 | at most 45 words, and no filler opener such as 'In this guide' |
| Prose and list items under one heading, H1 to H4; tables and code do not count | at most 400 words |
| The first passage of 12 or more words under a heading | no dangling opener such as 'This', 'It' or 'However' |
| The page's passages of 12 or more words without a dangling opener | at least 85% |

The limits, phrase lists and first-sentence rule come from `thresholds.json` in [seo-skills/geo-audit-skill](https://github.com/seo-skills/geo-audit-skill) 1.2.1 (MIT). They are that project's heuristics; no study shows that meeting them causes a citation. The site differs in 3 ways. The page lead limit covers the whole paragraph, which is stricter. A section ends at the next heading, not the next H2, because a question or Ozzit page holds many short H3 answers and each answer is the passage a reader lifts. The dangling opener is a failure for a section's first passage, where the 85% share alone would let a section open on 'It'.

Fix a failure by rewording, splitting a paragraph or adding a heading that names the topic. Change a limit only with a stated reason in the pull request.

## Visibility benchmark

`docs/visibility-benchmark/` holds the reviewed prompts and any recorded captures,
and stays out of the published site. Read its README before recording a round.

```bash
site-tools visibility_benchmark --template > docs/visibility-benchmark/captures/round.json
site-tools visibility_benchmark --check docs/visibility-benchmark/captures/round.json
site-tools visibility_benchmark --summary docs/visibility-benchmark/captures/round.json
```

Each command names the same file, so what you validate is what you summarise.
With no path, `--check` and `--summary` read every capture in that directory. A
named file that does not exist fails rather than being skipped. The template is
deliberately unfinished: it needs a recorder, and an observation marked complete
needs its evidence, so it does not validate until a real round is recorded in it.
A summary validates first and withholds every metric when any selected file fails.

Install the git hooks once with `python -m pip install "pre-commit==4.6.2" && pre-commit install`; they run the pinned ruff check on staged files and `cargo fmt` and `cargo clippy` when the Rust site tools change.

## Pull requests

Contributed software uses Apache-2.0. Original page prose uses CC BY 4.0. Data compilations and artwork retain their existing terms. See [NOTICE](NOTICE) and
[LICENSE](LICENSE).

Suggested resources should support Australian accounting work, have clear
documentation and current maintenance where applicable, and be open source
software, official public resources or free developer interfaces.

Keep every link to a live target, keep marketing vocabulary out of visible
text, regenerate `feed.xml` with `site-tools build_feed --write` after a
changelog edit, and regenerate `llms-full.txt` with `site-tools build_llms_full
--write` when a page's main text or `llms.txt` changes. That command also writes
each page's entry to `index.txt` beside it (the Machine view fetches that file)
and copies the canonical `llms.txt` to `.well-known/llms.txt`; do not edit those
copies by hand. Each section part stays within 96,000 bytes; a page longer than
that, such as the changelog, continues in the next numbered part of its section,
cut after a whole line outside any fenced block, and the part index lists it again
with '(continued)'.

`.github/review-generated.json` lists the generated files that a pre-merge review
may omit, because its build reproduces them and the `--check` runs in CI fail when
the committed copies are stale. The review tooling reads it from the pull
request's base, so a pull request cannot widen its own list. The `--check` runs of
`build_rates_json`, `build_ozzit_reference`, `build_effective_life_pages` and
`build_llms_full` also fail when a file they write is missing from the list, so a
pull request that adds a page or an `llms-full` part adds its entries too (the
effective life address map is an input as well and stays in review). A generated file it
does not name, such as a new `llms-full` part, stays in review until it is added.

Concurrent pull requests each add a dated row at the top of a changelog table,
so a plain rebase stops in `changelog/index.html` and again in
`changelog/index.txt` and `feed.xml`. `.gitattributes` assigns
those files to the `changelog-rows` merge driver. Each pull request that adds or
edits a page also rewrites the files the builders write from the pages:
`llms.txt`'s part index, `.well-known/llms.txt`, `llms-full.txt` and its parts,
the other `index.txt` copies and `scripts/design_baseline.json`. `.gitattributes`
assigns those to the `generated` driver, which keeps the current side, merges
`llms.txt` outside its part index and merges the baseline's keys. After
installing `site-tools`, configure both once per clone; worktrees share the
setting, and removing one means removing its whole `merge.<name>` section:

```bash
git config merge.changelog-rows.name "changelog rows in date order"
git config merge.changelog-rows.driver "site-tools merge_driver %O %A %B || git merge-file -L current -L base -L incoming --marker-size=%L %A %O %B"
git config merge.generated.name "builder output, rebuilt after the merge"
git config merge.generated.driver "site-tools merge_driver --generated %O %A %B %P || git merge-file -L current -L base -L incoming --marker-size=%L %A %O %B"
```

Merge the default branch with `git merge --no-commit origin/main`, resolve any
conflict in a page source, then rebuild before committing: `site-tools build_feed
--write`, `site-tools build_llms_full --write` and `site-tools check_design
--update-baseline`, in that order. The driver also keeps the current side of
`tools/depreciation-rates/llms.txt` and the effective life pages' `index.txt`
mirrors, so when both sides changed those pages, run `site-tools
build_effective_life_pages --write` first. A generated file the merge kept from the
current side is stale until then, and the `--check` runs fail on it. GitHub runs
no merge driver, so a pull request page still reports these conflicts until the
default branch is merged in locally. Git takes merge attributes from the
checked-out branch, so a branch cut before a change to these `.gitattributes`
lines merges with its old ones: for that merge, first copy the default branch's
with `git show origin/main:.gitattributes > "$(git rev-parse --git-path
info/attributes)"`, and delete that file after it. A `site-tools` older than
`--generated` leaves Git's markers in these files.

The driver runs Git's three-way merge, then resolves only conflicts where both
sides added dated changelog rows, or whole feed entries from one changelog table,
and changed nothing else at that point, and the feed's own `<updated>` date,
which takes the later side. It keeps both sides' additions, newest date first; on
the same date the incoming side goes above, so a rebased pull request's row stays
on top. If any other conflict remains in a file, or `site-tools` cannot run, the
command falls back to `git merge-file` and the whole file keeps Git's markers:
resolve the sources, restore `feed.xml` from either side (`git checkout --ours
feed.xml`), since `build_feed` reads its published IDs, then rerun `build_feed
--write` and `build_llms_full --write`. The `--check` runs still compare the committed files with a fresh
build, so a resolution that differs fails the site checks. Without the
configuration, or in GitHub's web conflict editor, Git merges these files as
before.

Each changelog row's `id="entry-<feed ID>"` anchor holds its published Atom ID,
so a row keeps its ID when it moves or its wording changes. Never edit, copy or
remove an anchor; regenerate the feed after the edit. A new row gets its anchor
from `site-tools build_feed --write`, which hashes its date and title. A
`data-feed-id` on a row's `<tr>` must match its anchor. The site checks test
this behaviour and reject invalid, conflicting or duplicate IDs.
Date each new site row by the day its change was published (merged), in
Australia/Sydney time.
The sitemap contains indexable HTML only; `robots.txt` links both text indexes.
Add or update tests with every change to behaviour: new functionality needs a
test that fails without it, and a fixed defect needs a regression test, in the
Python checks, the Node tests or the browser tests as fits the change.
For a potential security vulnerability follow [SECURITY.md](SECURITY.md).

The site-check runner reports elapsed time for the Jekyll build and each
subcommand, including a failing command. Compare the same event, source revision
and runner before changing check coverage. These timings measure elapsed time;
they do not establish billed minutes or savings.

## Current tool releases

Read the component’s licence at the new tag or source revision. Record its name against that version in `_data/tools.json` and point the product’s software JSON-LD licence to the same file. Keep install instructions that use an older version linked to that version’s licence.

Run `site-tools stamp_source_freshness --write-tool-releases` to read published stable GitHub release tags and refresh `_data/tool_releases.json`, the twelve tool pages' software JSON-LD, `sitemap.xml`, names in `tools/index.html` and the current MCP version in `llms.txt`. `--build` performs the same source refresh and then runs the ordinary Jekyll build. After editing `_data/tool_releases.json`, `changelog/index.html` or capability prose offline, run `site-tools stamp_source_freshness --sync-releases` to stamp the tool pages, `sitemap.xml`, `tools/index.html`, sorted `index.html` latest releases and `llms.txt`, then rebuild `feed.xml`, `llms-full*.txt` and `scripts/design_baseline.json` in one pass. Review capability prose and update each changed document's review date before committing; the refresh preserves document dates and uses them for sitemap `lastmod`, whilst software entries use the release date. Each tagged release in `_data/tool_releases.json` needs a Tool releases row in `changelog/index.html` with the same date and release link; write it by hand, since `site-tools build_feed` refuses the changelog without one. Regenerate text mirrors with `site-tools build_llms_full --write`. Offline builds use the checked snapshot. Tool identity and source paths live in `_data/tools.json`; the browser Coal LSL calculator has no release tag and records its own source revision instead. Dates use Australia/Sydney.
