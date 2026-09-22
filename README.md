# ryanduguid.github.io

Source for [duguid.com.au](https://duguid.com.au/), the open-source accounting tool library for Ryan Duguid's Australian computational accounting work: engines, MCP servers, Excel LAMBDAs and agent workflows.

## Site structure

- `/tools/` groups the tool register by Extract, Calculate, Control and Inspect.
- `/evaluate/` holds 3 reproducible evaluations with fabricated inputs and expected results.
- `/rates/` holds maintained Australian rate tables with primary sources and review dates, and `/rates/register/` holds the versioned machine-readable register of those figures.
- `/tools/accounting-questions/` indexes 100 question guides; each of the 10 topic pages under it carries 10 answers with search and checklist downloads. The pages are stubs rendered by `_layouts/question-topic.html` from `_data/accounting_questions.json`.
- `/tools/business-calculators/` indexes 9 planning calculators, one page each under it, rendered by `_layouts/calculator.html` from `_includes/calculators/`. The 13-week cash scenario has CSV export.
- `assets/hub-routes.mjs` forwards an old `#q12` or `#cash` bookmark on either index to the page that now holds it.
- `/feed.xml` is an Atom feed built from the changelog tables by `scripts/build_feed.py`.

The homepage is a short adoption path into those registers. The site is a personal open-source index, not a practice, and does not accept professional engagements.

## Local preview

The pages share a Jekyll header and footer. Install Ruby 3.3 and Bundler,
then install the locked build dependencies once:

```bash
bundle install
```

Build and serve the generated HTML:

```bash
python scripts/serve_site.py
```

Then visit `http://127.0.0.1:4173/`. Restart the preview after editing a page
or an include. `python scripts/build_site.py` builds `_site/` without serving it.
The preview compresses text when the browser accepts gzip, matching the
compression verified on GitHub Pages. Lighthouse uses this same server.

## Checks

`.github/workflows/checks.yml` runs on every push, pull request and a weekly schedule. A `lint` job runs `ruff check .` and `mypy` over the check scripts first (pinned to `ruff==0.16.8` and `mypy==2.3.1`, configured in `pyproject.toml`), then the site checks run on Python 3.14:

- the Coal LSL levy engine's own test suite (`assets/levy.mjs`), run with `node --test scripts/levy.test.mjs`
- the rates register's shape, provenance, ordering and checksums, run with `python scripts/check_rates_register.py` and `python scripts/test_rates_register.py`
- the business planning arithmetic, run with `node --test scripts/business-calculators.test.mjs`
- every install command in the machine-readable files must name a package in the reviewed `scripts/agent_file_policy.json`, and a third-party one must name its version; those files must also carry no invisible or direction-control characters. Run with `python scripts/check_agent_files.py` and `python scripts/test_agent_files.py`
- every `github.com/ryanduguid/...` link must resolve to that exact repository, not through a rename redirect, and must not resolve to an archived repository (looked up once per repository through the GitHub REST API)
- every same-origin link, absolute or root-relative, must resolve to a file on disk
- external links must resolve
- the HTML must parse cleanly
- retired repository names and em or en dashes must not appear
- marketing and machine-written vocabulary ('delve', 'leverage', 'seamless', 'robust', 'tapestry' and the rest of the list in `scripts/check_design.py`) must not appear in visible text, meta content, JSON-LD strings or `llms.txt`
- every page carries a title, a meta description in the length band, a canonical matching its own path, Open Graph tags and parseable JSON-LD; ItemList counts and positions must match their entries
- every question marked up as an FAQ is visible on the page that claims it
- every indexable page has one `main#main`, one skip link and the exact shared primary navigation
- `sitemap.xml` and `llms.txt` between them cover every indexable page, and nothing else
- `llms-full.txt` matches a fresh build from the visible main text of every indexable page, with each page's link destinations retained for citation; each page's `index.txt` is its own entry from that file, and `.well-known/llms.txt` is an identical copy of the canonical `llms.txt` (`python scripts/build_llms_full.py --write` regenerates all of them)
- every styled page discovers design tokens before component CSS, and every indexable page links to its own plain-text alternate and the machine-readable index
- every styled page carries the Content Security Policy meta tag and the 4 font preloads ahead of its stylesheets, and no page carries inline script other than JSON-LD data
- `.well-known/security.txt` names a contact, has not expired and is published through `_config.yml`
- official self-hosted IBM Plex subsets retain their licence, hashes, visible-glyph coverage and byte budget
- contextual social cards retain their fixed copy, dimensions, byte budget, deterministic render and recorded provenance
- the shipped favicon rasters and `favicon.ico` match a fresh render of `assets/favicon.svg`, and every styled page declares the shipped 48px and 96px icons

Run locally:

```bash
python scripts/check_site.py
```

This builds with Jekyll, checks the build and preview with a small fixture,
then runs the existing checks against generated HTML in a temporary copy
containing the repository's test fixtures. The preview serves only `_site/`.

Install the browser-test dependencies and Chromium once:

```bash
npm ci
npx playwright install chromium
```

Run the adoption path, collection hubs, navigation, overflow, accessibility and calculator journeys in the mobile and desktop browser projects:

```bash
npm run test:browser
```

Check the Coal LSL proof and contextual social-card renderers without changing the tracked images:

```bash
npm run test:capture
```

Failure screenshots, traces and the HTML report stay in the ignored `work/`
directory.

Run 3-pass Lighthouse medians for the homepage, Tools, Evidence, Coal
LSL calculator, accounting question hub, and business calculators:

```bash
npm run test:lighthouse
```

The Lighthouse reports stay under ignored `work/lighthouse/`. The tested
browser and hands-on accessibility observations are recorded in
[`docs/browser-quality-evidence.md`](docs/browser-quality-evidence.md).

## Response headers

The origin is GitHub Pages, which does not let a repository set response
headers. There is no `_headers`, `netlify.toml` or CDN configuration here, and
adding one would have no effect on the origin.

The origin therefore sends none of `Strict-Transport-Security`,
`Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options` /
`frame-ancestors` or `Permissions-Policy`, and sets
`Access-Control-Allow-Origin: *`. GitHub Pages does enforce HTTPS with a
permanent redirect, and `Referrer-Policy` is carried in the document as
`<meta name="referrer" content="strict-origin-when-cross-origin">` because that
directive is honoured in markup.

Since 14 September 2026 the public site has been served through Cloudflare in
front of that origin. A response-header transform rule there adds
`Strict-Transport-Security: max-age=31536000; includeSubDomains`,
`X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy: camera=(), microphone=(), geolocation=()` and
`Content-Security-Policy: frame-ancestors 'none'`. No `X-Frame-Options` header
is set; `frame-ancestors` carries the framing restriction. Those headers live in
the Cloudflare account, not in this repository: the local preview and the checks
here cannot see or test them, and a request that reached the origin directly
would still arrive without them.

Cloudflare also changes the delivered page in ways the repository never sees:
it adds `nel`, `report-to` and `speculation-rules` headers, appends an inline
visitor-verification script (blocked by the page's Content Security Policy;
Cloudflare Web Analytics was switched off on 20 September 2026, so no analytics
tag is appended), and answers `301` for the retired `/engage/` and
`/tools/review-ready-gate/` routes. Email Address
Obfuscation is disabled so `mailto:` links work without scripts. Keep it off:
the production check requires those links to arrive intact.
`node scripts/check_production.mjs` fetches the live pages and
fails when a documented header or redirect is missing or a `mailto:` link no
longer arrives intact; it runs weekly from `source-freshness.yml`.

`Content-Security-Policy` is the exception. Browsers honour a policy delivered
as `<meta http-equiv="Content-Security-Policy">`, minus `frame-ancestors`,
`report-uri` / `report-to` and report-only mode, which the specification
reserves for the response header. Every page ships that markup policy:

```
default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self';
font-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none';
object-src 'none'
```

It holds because the site carries no inline `<style>`, no `style` attribute
and no inline script other than JSON-LD data blocks. The Coal LSL calculator's
page wiring lives in `assets/levy-page.mjs` for that reason, and
`scripts/check_design.py` fails if a page drops the policy or gains an inline
script.

The remainder are response-header-only controls: a `<meta http-equiv>` copy
either does nothing or is ignored by browsers, so none is emitted rather than
shipping a header that looks present and is not. They are supplied at the
Cloudflare edge as described above, which is a hosting setting, not a
repository one.

## Published files

GitHub Pages builds the repository with Jekyll. All 55 canonical pages
include `_includes/site-header.html` and `_includes/site-footer.html`,
directly or through a layout in `_layouts/`; the header sets the current page
or section from each page's URL. The count is the number of URLs in
`sitemap.xml`, which `scripts/test_contracts.py` asserts. Local builds and CI
pin Jekyll 3.10.0 in `Gemfile.lock` to match GitHub Pages.
`_config.yml` decides what reaches the published origin. It keeps the
repository's own tooling off duguid.com.au (`docs/`, `scripts/`, `tests/`, the
npm manifests, the Playwright and Lighthouse configuration, `DESIGN.md` and this
README) and includes `.well-known/` so that `security.txt` is served despite
Jekyll's default exclusion of dot-directories.
The Search Console verification file, `LICENSE`, `SECURITY.md` and the font
licence remain published.

## Social-card provenance

The homepage cash-flow chart is a native Excel export of the supplied fictional
workbook. Its [capture record](assets/examples/lumbridge/preview-record.txt)
records the scenario, source and image hashes, renderer, and refresh procedure.

The 5 contexts cover the site, tools, evaluations, rates and evidence. They are rendered from one editable source and one context file. The Playwright renderer is development-only; the public site serves static PNGs with no social-card runtime dependency. The cards contain register geometry and text, with no portrait. Register-card geometry is adapted from unmerged PR 44 commit `89e1b9d`.

The current cards use dated filenames so preview crawlers receive a fresh image
URL after a redesign. The previous undated PNGs remain available for existing
links; current page metadata points only to the dated cards. Rebuild the cards
with `node scripts/render-social-cards.mjs`, inspect all 5 outputs and update
the hashes below. Advance the filename version in the context data, renderer,
page metadata and contracts when changing published artwork. Messaging apps
may retain a cached preview until they fetch the page again.

Every card below shares one provenance record. Sources: `assets/social-card-template.svg`, `assets/social-cards.json`; licence: MIT; renderer: Playwright 1.63.0, Chromium 153.0.8010.12, device scale 1. Refresh when the template, context copy, embedded fonts or pinned browser changes.

| Asset | SHA-256 |
| --- | --- |
| `assets/social-card-site-20260922.png` | `506ccb1c53e0dbd2f6f5b6cca754a6d3fc1bee9595c304d2ed4cd2fab6f9888d` |
| `assets/social-card-tools-20260922.png` | `9a3d5851a81190b81982d6ece515b8321b4ce98a004e41c0e4bdcdfd5907dd9c` |
| `assets/social-card-evaluations-20260922.png` | `9d0acd2b4ae15ec9be0ea475a7cf632c8f7b380e8ae449bfa09bb81393215222` |
| `assets/social-card-rates-20260922.png` | `91ef2d4ced969cc172022264f6af9a29030512d4bf653e51c55133f313d1cfeb` |
| `assets/social-card-evidence-20260922.png` | `f5bafedc7b836da7b43286ad3628ddeaa9a05dc8d47ec949fc4e02157793a552` |

## Favicon provenance

The register seal is drawn once, in `assets/favicon.svg`, as square-cornered rectangles on the OLED palette. Every raster below is rendered from that one drawing by `scripts/favicon_render.py`, which scales the 64-unit grid by whole pixels, so no shipped icon carries resampling or a fourth colour.

| Asset | Role |
| --- | --- |
| `assets/favicon-32.png` | browser tabs |
| `assets/favicon-48.png` | a square raster option for search results |
| `assets/favicon-96.png` | high-density displays; exceeds Google's recommended 48px size |
| `favicon.ico` | 16, 32 and 48 pixel frames for clients that request the root icon |

[Google's favicon guidance](https://developers.google.com/search/docs/appearance/favicon-in-search) requires a square image at least 8 × 8 pixels and recommends one larger than 48 × 48 pixels. The shipped 48px and 96px files meet the minimum; the 96px file also meets that recommendation. Eligibility does not guarantee display in search results. Rebuild them after any change to the seal:

```bash
python scripts/favicon_render.py
```

`scripts/check_design.py` fails if a shipped raster falls behind the SVG or a page drops an icon link. `assets/favicon-180.png` is the Apple touch icon at the 180px size iOS asks for; 180 is not a whole-pixel scale of the 64-unit grid, so that file stays outside the render step.

## Credential documents

`assets/credentials/` holds the certificate Xero issued to Ryan Duguid and the
individual Level 3 badge taken from it, which the evidence register publishes at
[`/evidence/#xero-certification`](https://duguid.com.au/evidence/#xero-certification).
[`assets/credentials/SOURCES.md`](assets/credentials/SOURCES.md) records both
files' hashes, how the badge is rebuilt from the certificate with
`python scripts/extract_xero_badge.py`, the usage limits carried into the page,
and the 4 places to update on renewal. No Xero partner badge is published; that
note records what evidence a Payroll or Migration badge would need first.

## Licence

MIT, see [LICENSE](LICENSE), for this repository's own code and text.

The MIT grant does not extend to third-party material published here. The IBM
Plex subsets under `assets/fonts/` keep the SIL Open Font License 1.1 in
`assets/fonts/OFL.txt`. The certificate and badge under `assets/credentials/`
are Xero's document and artwork, published as a factual record of Ryan Duguid's
own certification under the terms in `assets/credentials/SOURCES.md`, and carry
no Xero endorsement of this site or its tools.

Nothing on the site is tax, legal or financial advice. Outputs of the tools it links are review aids for a qualified professional, not compliance determinations.
