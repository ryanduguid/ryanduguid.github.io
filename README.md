# ryanduguid.github.io

Source for [duguid.com.au](https://duguid.com.au/), the public register for Ryan Duguid's open-source Australian computational accounting work: engines, MCP servers, Excel LAMBDAs and agent workflows.

## Site structure

- `/tools/` groups ten controls by Extract, Calculate, Control and Inspect.
- `/evaluate/` holds three reproducible evaluations with fabricated inputs and expected results.
- `/rates/` holds maintained Australian rate tables with primary sources and review dates.

The homepage is a short adoption path into those registers. The site is a personal open-source index, not a practice, and does not accept professional engagements.

## Local preview

The site is static HTML (`index.html`, `about/`, `evidence/`, `tools/`, `evaluate/`, `rates/`). Open `index.html` in a browser, or serve the folder:

```bash
python -m http.server 4173 --bind 127.0.0.1
```

then visit `http://127.0.0.1:4173/`.

## Checks

`.github/workflows/checks.yml` runs on every push, pull request and a weekly schedule:

- the Coal LSL levy engine's own test suite (`assets/levy.mjs`), run with `node --test scripts/levy.test.mjs`
- every `github.com/ryanduguid/...` link must resolve to that exact repository, not through a rename redirect, and must not resolve to an archived repository (looked up once per repository through the GitHub REST API)
- every same-origin link, absolute or root-relative, must resolve to a file on disk
- external links must resolve
- the HTML must parse cleanly
- retired repository names and em or en dashes must not appear
- marketing and machine-written vocabulary ("delve", "leverage", "seamless", "robust", "tapestry" and the rest of the list in `scripts/check_design.py`) must not appear in visible text, meta content, JSON-LD strings or `llms.txt`
- every page carries a title, a meta description in the length band, a canonical matching its own path, Open Graph tags and parseable JSON-LD; ItemList counts and positions must match their entries
- every question marked up as an FAQ is visible on the page that claims it
- every indexable page has one `main#main`, one skip link and the exact shared primary navigation
- `sitemap.xml` and `llms.txt` between them cover every indexable page, and nothing else
- every styled page discovers design tokens before component CSS, and every indexable page exposes the machine-readable index
- every styled page carries the Content Security Policy meta tag and the three font preloads ahead of its stylesheets, and no page carries inline script other than JSON-LD data
- `.well-known/security.txt` names a contact, has not expired and is published through `_config.yml`
- official self-hosted IBM Plex subsets retain their licence, hashes, visible-glyph coverage and byte budget
- contextual social cards retain their fixed copy, dimensions, byte budget, deterministic render and recorded provenance
- the shipped favicon rasters and `favicon.ico` match a fresh render of `assets/favicon.svg`, and every styled page declares the 48px and 96px icons Google needs

Run locally:

```bash
python scripts/check_site.py
```

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

Run three-pass Lighthouse medians for the homepage, Tools, Evidence and Coal
LSL calculator:

```bash
npm run test:lighthouse
```

The Lighthouse reports stay under ignored `work/lighthouse/`. The tested
browser and hands-on accessibility observations are recorded in
[`docs/browser-quality-evidence.md`](docs/browser-quality-evidence.md).

## Response headers

The site is served by GitHub Pages, which does not let a repository set response
headers. There is no `_headers`, `netlify.toml` or CDN configuration here, and
adding one would have no effect on the published origin.

The consequence is that `Strict-Transport-Security`, `Content-Security-Policy`,
`X-Content-Type-Options`, `X-Frame-Options` / `frame-ancestors` and
`Permissions-Policy` are absent, and `Access-Control-Allow-Origin: *` is set by
the platform. GitHub Pages does enforce HTTPS with a permanent redirect, and
`Referrer-Policy` is carried in the document as
`<meta name="referrer" content="strict-origin-when-cross-origin">` because that
directive is honoured in markup.

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
shipping a header that looks present and is not. Closing those means moving the
origin behind a proxy that can set headers, which is a hosting decision, not a
repository one.

## Published files

GitHub Pages builds the repository with Jekyll. No page uses Jekyll templating;
`_config.yml` only decides what reaches the published origin. It keeps the
repository's own tooling off duguid.com.au (`docs/`, `scripts/`, `tests/`, the
npm manifests, the Playwright and Lighthouse configuration, `GATES.md`,
`DESIGN.md` and this README) and includes `.well-known/` so that
`security.txt` is served despite Jekyll's default exclusion of dot-directories.
The Search Console verification file, `LICENSE`, `SECURITY.md` and the font
licence remain published.

## Social-card provenance

The five contexts cover the site, tools, evaluations, rates and evidence. They are rendered from one editable source and one context file. The Playwright renderer is development-only; the public site serves static PNGs with no social-card runtime dependency. The cards contain register geometry and text, with no portrait. Register-card geometry is adapted from unmerged PR 44 commit `89e1b9d`.

| Asset | Reproducible provenance |
| --- | --- |
| `assets/social-card-site.png` | Sources: `assets/social-card-template.svg`, `assets/social-cards.json`; licence: MIT; renderer: Playwright 1.62.1, Chromium 151.0.7922.34, device scale 1; SHA-256: `7b6ac06a26aceca7c59d4cd4c32eb16f54365672dca7b13fa7d20942f303b3e3`. Refresh when the template, context copy, embedded fonts or pinned browser changes. |
| `assets/social-card-tools.png` | Sources: `assets/social-card-template.svg`, `assets/social-cards.json`; licence: MIT; renderer: Playwright 1.62.1, Chromium 151.0.7922.34, device scale 1; SHA-256: `68852e24b466f50c79e22034eff2dab27f5dc2c76df2a8b02c96ffbd8517d9c9`. Refresh when the template, context copy, embedded fonts or pinned browser changes. |
| `assets/social-card-evaluations.png` | Sources: `assets/social-card-template.svg`, `assets/social-cards.json`; licence: MIT; renderer: Playwright 1.62.1, Chromium 151.0.7922.34, device scale 1; SHA-256: `1a28d3e9397f6ccda32e90b0c27017f10fda603efbbdf0b694a36dc27aeef5cb`. Refresh when the template, context copy, embedded fonts or pinned browser changes. |
| `assets/social-card-rates.png` | Sources: `assets/social-card-template.svg`, `assets/social-cards.json`; licence: MIT; renderer: Playwright 1.62.1, Chromium 151.0.7922.34, device scale 1; SHA-256: `daf8408deabe8bd9a0fae26390b46e475728521ab10006088dc47bc9f01775c2`. Refresh when the template, context copy, embedded fonts or pinned browser changes. |
| `assets/social-card-evidence.png` | Sources: `assets/social-card-template.svg`, `assets/social-cards.json`; licence: MIT; renderer: Playwright 1.62.1, Chromium 151.0.7922.34, device scale 1; SHA-256: `0397b4ec77e5b7fcd8f6c14737482f805f7a59ff3d63627c19b1c0d8429ec291`. Refresh when the template, context copy, embedded fonts or pinned browser changes. |

## Favicon provenance

The register seal is drawn once, in `assets/favicon.svg`, as square-cornered rectangles on the OLED palette. Every raster below is rendered from that one drawing by `scripts/favicon_render.py`, which scales the 64-unit grid by whole pixels, so no shipped icon carries resampling or a fourth colour.

| Asset | Role |
| --- | --- |
| `assets/favicon-32.png` | browser tabs |
| `assets/favicon-48.png` | the smallest raster Google accepts |
| `assets/favicon-96.png` | high-density displays, and Google's pick on most results |
| `favicon.ico` | 16, 32 and 48 pixel frames for the root file Google falls back to when no link element offers it a usable icon |

Google only adopts a favicon whose raster is a multiple of 48px square, which is why the 48 and 96 pixel files ship alongside the 32px tab icon and are declared in every page head. Rebuild them after any change to the seal:

```bash
python scripts/favicon_render.py
```

`scripts/check_design.py` fails if a shipped raster falls behind the SVG or a page drops an icon link. `assets/favicon-180.png` is the Apple touch icon at the 180px size iOS asks for; 180 is not a whole-pixel scale of the 64-unit grid, so that file stays outside the render step.

## Licence

MIT, see [LICENSE](LICENSE).

Nothing on the site is tax, legal or financial advice. Outputs of the tools it links are review aids for a qualified professional, not compliance determinations.
