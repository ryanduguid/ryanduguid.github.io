# ryanduguid.github.io

Source for [duguid.com.au](https://duguid.com.au/), the landing page for Ryan Duguid's open-source Australian computational accounting work: engines, MCP servers, Excel LAMBDAs and agent workflows.

## Local preview

The site is static HTML (`index.html`, `about/`, `evidence/`, `rates/`, `tools/`). Open `index.html` in a browser, or serve the folder:

```bash
python -m http.server 4173 --bind 127.0.0.1
```

then visit `http://127.0.0.1:4173/`.

## Checks

`.github/workflows/checks.yml` runs on every push, pull request and a weekly schedule:

- the Coal LSL levy engine's own test suite (`assets/levy.mjs`), run with `node --test scripts/levy.test.mjs`
- every `github.com/ryanduguid/...` link must resolve to that exact repository, not through a rename redirect
- every same-origin link, absolute or root-relative, must resolve to a file on disk
- external links must resolve
- the HTML must parse cleanly
- retired repository names and em or en dashes must not appear
- every page carries a title, a meta description in the length band, a canonical matching its own path, Open Graph tags and parseable JSON-LD; ItemList counts and positions must match their entries
- every question marked up as an FAQ is visible on the page that claims it
- every indexable page has one `main#main`, one skip link and the exact shared primary navigation
- `sitemap.xml` and `llms.txt` between them cover every indexable page, and nothing else
- every styled page discovers design tokens before component CSS, and every indexable page exposes the machine-readable index
- official self-hosted IBM Plex subsets retain their licence, hashes, visible-glyph coverage and byte budget

Run locally:

```bash
python scripts/check_site.py
```

Install the browser-test dependencies and Chromium once:

```bash
npm ci
npx playwright install chromium
```

Run the calculator journey in the mobile and desktop browser projects:

```bash
npm run test:browser
```

Run the Coal LSL proof capture and filesystem-security tests:

```bash
node --test scripts/capture-coal-lsl-proof.test.mjs
```

Failure screenshots, traces and the HTML report stay in the ignored `work/`
directory.

Run three-pass Lighthouse medians for the homepage, Evidence and Coal LSL
calculator:

```bash
npm run test:lighthouse
```

The Lighthouse reports stay under ignored `work/lighthouse/`. The tested
browser and hands-on accessibility observations are recorded in
[`docs/browser-quality-evidence.md`](docs/browser-quality-evidence.md).

## Licence

MIT, see [LICENSE](LICENSE).

Nothing on the site is tax, legal or financial advice. Outputs of the tools it links are review aids for a qualified professional, not compliance determinations.
