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
- every styled page discovers design tokens before component CSS, and every indexable page exposes the machine-readable index
- official self-hosted IBM Plex subsets retain their licence, hashes, visible-glyph coverage and byte budget
- the social card is a 1200 by 630 PNG under 350 KB whose checksum, editable SVG source, OLED palette and register copy are recorded below

Run locally:

```bash
python scripts/check_site.py
```

## Asset provenance

| Asset | Purpose | Source | Licence | Creation | SHA-256 | Refresh trigger |
|---|---|---|---|---|---|---|
| `assets/og-card.png` | Open Graph and Twitter summary card | Editable source: `assets/og-card.svg` | MIT | Rendered at 1200×630 with Google Chrome 148.0.7778.96, flattened to RGB and quantised to 256 colours without dithering using Pillow 12.3.0, then saved as an optimised PNG | `02d647239a442240ddea5fa497fa2fe41cf2fe9d07fb06307c35074e5487333d` | Recreate when the register name, homepage heading, host or OLED palette changes |

## Licence

MIT, see [LICENSE](LICENSE).

Nothing on the site is tax, legal or financial advice. Outputs of the tools it links are review aids for a qualified professional, not compliance determinations.
