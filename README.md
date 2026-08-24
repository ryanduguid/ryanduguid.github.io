# ryanduguid.github.io

Source for [ryanduguid.github.io](https://ryanduguid.github.io/), the landing page for Ryan Duguid's open-source Australian computational accounting work: engines, MCP servers, Excel LAMBDAs and agent workflows.

## Local preview

The site is ten static HTML pages: `index.html`, `404.html`, `about/index.html`, and one per tool under `tools/`. Open `index.html` in a browser, or serve the folder:

```bash
python -m http.server 8000
```

then visit `http://localhost:8000/`.

## Checks

`.github/workflows/checks.yml` runs on every push, pull request and a weekly schedule:

- the Coal LSL levy engine's own test suite (`assets/levy.mjs`), run with `node --test scripts/levy.test.mjs`
- every `github.com/ryanduguid/...` link must resolve to that exact repository, not through a rename redirect
- every same-origin link, absolute or root-relative, must resolve to a file on disk
- external links must resolve
- the HTML must parse cleanly
- retired repository names and em or en dashes must not appear
- every page carries a title, a meta description in the length band, a canonical matching its own path, Open Graph tags and parseable JSON-LD
- every question marked up as an FAQ is visible on the page that claims it
- `sitemap.xml` and `llms.txt` between them cover every indexable page, and nothing else

Run locally:

```bash
node --test scripts/levy.test.mjs
python scripts/check_links.py
python scripts/check_seo.py
```

## Licence

MIT, see [LICENSE](LICENSE).

Nothing on the site is tax, legal or financial advice. Outputs of the tools it links are review aids for a qualified professional, not compliance determinations.
