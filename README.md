# ryanduguid.github.io

Source for [duguid.com.au](https://duguid.com.au/), the landing page for Ryan Duguid's open-source Australian computational accounting work: engines, MCP servers, Excel LAMBDAs and agent workflows.

## Local preview

The site is static HTML (`index.html`, `about/`, `evidence/`, `rates/`, `tools/`). Open `index.html` in a browser, or serve the folder:

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
- every page carries a title, a meta description in the length band, a canonical matching its own path, Open Graph tags and parseable JSON-LD; ItemList counts and positions must match their entries
- every question marked up as an FAQ is visible on the page that claims it
- every indexable page has one `main#main`, one skip link and the exact shared primary navigation
- `sitemap.xml` and `llms.txt` between them cover every indexable page, and nothing else

Run locally:

```bash
python scripts/check_site.py
```

## Asset provenance

| Asset | Purpose | Source | Licence | Creation | SHA-256 | Refresh trigger |
|---|---|---|---|---|---|---|
| `assets/og-card.png` | Open Graph and Twitter summary card | The portfolio identity and description in `index.html` | MIT | The original generator was not retained. The checked copy was flattened onto white and quantised to 256 colours without dithering using Pillow 12.3.0, then saved as an optimised PNG | `382e2f348b5d56a14455e8be4922091f46bc876b14121007bd3b10c6d3ef3e2f` | Recreate when the portfolio name, positioning or social metadata changes |

## Licence

MIT, see [LICENSE](LICENSE).

Nothing on the site is tax, legal or financial advice. Outputs of the tools it links are review aids for a qualified professional, not compliance determinations.
