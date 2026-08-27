# ryanduguid.github.io

Source for [ryanduguid.github.io](https://ryanduguid.github.io/), a single-page portfolio of Ryan Duguid's open-source accounting work.

The published page is static HTML and CSS with no client-side JavaScript.

## Local preview

Serve the repository with Python:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000/`.

## Check

```bash
python scripts/check_site.py
```

The check covers the portfolio structure, identity and social metadata, project anchors, crawler policy, retired routes and local assets.

## Asset provenance

| Asset | Purpose | Source | Licence | Creation | SHA-256 | Refresh trigger |
|---|---|---|---|---|---|---|
| `assets/og-card.png` | Open Graph and Twitter summary card | The portfolio identity and description in `index.html` | MIT | The original generator was not retained. The checked copy was flattened onto white and quantised to 256 colours without dithering using Pillow 12.3.0, then saved as an optimised PNG | `382e2f348b5d56a14455e8be4922091f46bc876b14121007bd3b10c6d3ef3e2f` | Recreate when the portfolio name, positioning or social metadata changes |

## Licence

MIT, see [LICENSE](LICENSE).
