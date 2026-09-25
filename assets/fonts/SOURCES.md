# Webfont sources

The site self-hosts WOFF2 subsets of three families, each cut from the static
TTFs in its upstream repository.

| Family | Role | Upstream | Pinned revision | Licence file |
| --- | --- | --- | --- | --- |
| Besley 2.001 | Display and section headings | <https://github.com/indestructible-type/Besley> | tag `2.01`, commit `bb3cd54ca0d9b74bb9ddbabc0df380d8b100c274` | `OFL-Besley.txt` |
| Public Sans 2.001 | Navigation, body copy, controls and tables | <https://github.com/uswds/public-sans> | tag `v2.001`, commit `c7923167a592d941646f99fb7b5fba17aa7d69e1` | `OFL-PublicSans.txt` |
| Spline Sans Mono 1.004 | Rates, commands, dates, evidence labels and figures | <https://github.com/SorkinType/SplineSansMono> | commit `b167db03b7d7ae754bf7071c13415e7aeee7d073` (the repository has no tags) | `OFL-SplineSansMono.txt` |

All three are licensed under the SIL Open Font License 1.1. Each licence file is
the upstream `OFL.txt` at the pinned revision, byte for byte. None of them
declares a Reserved Font Name, so the subsets are Modified Versions that may
keep their family names. IBM Plex, which the site used until 24 September 2026,
reserves "Plex"; that is why the Plex files were never cut. Before adding
another family, check its `OFL.txt` copyright line for a reserved name.

## Rebuilding a file

Each WOFF2 file is the output of `pyftsubset` from fontTools 4.60.1 with
Brotli 1.1.0, run on the upstream TTF with the site's `unicode-range`:

```
pyftsubset <upstream>.ttf --unicodes="U+0020-007E,U+00A0,U+00A3,U+00A7,U+00A9,U+00B0,U+00B1,U+00B7,U+00D7,U+00F7,U+2013,U+2018-2019,U+201C-201D,U+2026,U+2212,U+20AC" --layout-features='*' --name-IDs='*' --notdef-outline --flavor=woff2 --output-file=<file>.woff2
```

Add `--no-hinting` for the two Besley files. Besley sets only headings, where
hinting has no visible effect, and its hints push the SemiBold cut past the
25,000-byte per-file budget in `scripts/check_design.py`. The command is
deterministic: rerunning it on the same inputs reproduces the hashes below.

Each face in `assets/tokens.css` declares that same range as its
`unicode-range`, and `scripts/check_design.py` fails when a page or script uses a
character outside it. To use a new character, rebuild the six files with the
wider range, then widen the ranges in `tokens.css` and update this table and
`scripts/design_baseline.json`.

| File | Upstream path | Upstream SHA-256 | Bytes | SHA-256 |
| --- | --- | --- | ---: | --- |
| `Besley-Regular.woff2` | `fonts/ttf/Besley-Regular.ttf` | `1d301224ee3c536421b9da3cae23a8c4f0d71d69c5fdf5dd5231cc5243c7e2d1` | 17584 | `e1982597e2d86dec08f97d4e9d1a40a97561e6b0a822766160e8694a0c31c251` |
| `Besley-SemiBold.woff2` | `fonts/ttf/Besley-SemiBold.ttf` | `c76391d8f2371b7734344e65305ebe4cc709e40df03c46097fda1daa5f0eeabe` | 17984 | `a433942cb02f9fd5bfbb5ae3baa3b3dda7e4e7ea36f606ca985b57227c24c97b` |
| `PublicSans-Regular.woff2` | `fonts/ttf/PublicSans-Regular.ttf` | `b577e9bc9887284e90aae5ad0699689ce36b5cd96207efbec68f77f8aed88379` | 16032 | `74166ad25684c75ad08a310cf8206a828173672f247c688aa14aa0bf494526c0` |
| `PublicSans-Italic.woff2` | `fonts/ttf/PublicSans-Italic.ttf` | `d77f79eca3f513e0b883ddbd293a3d2bb8fd35453ff74aff4afc6a6a1c6ce8f1` | 16612 | `ebea90dd407072e3b438d94ddf6947d453506be4e081591042d93d77b1010a0d` |
| `PublicSans-SemiBold.woff2` | `fonts/ttf/PublicSans-SemiBold.ttf` | `9f537d607dc78450841dc31c401e3c4ba7a0ba7217e8b34c1be684a983806399` | 15960 | `ccba2be7061fd162129c8d8531ce8847a24a8624ed9037130261863f0dc6eb19` |
| `SplineSansMono-Regular.woff2` | `fonts/ttf/SplineSansMono-Regular.ttf` | `79384820b543bd4f52dff46c2da4ddca4bb5131ee3bcba4a6d17a5609351a098` | 18756 | `fb46f2156e5c972c585cc2e4086f54b239a5ec4ff470e46210985bd57f8c6570` |
