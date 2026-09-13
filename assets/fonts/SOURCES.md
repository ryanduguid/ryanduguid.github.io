# IBM Plex webfont sources

The site self-hosts subsets of the Latin1 WOFF2 files shipped by IBM Plex v6.4.2,
cut to the characters the pages use.

- Upstream: <https://github.com/IBM/plex>
- Tag: `v6.4.2`
- Peeled commit: `242c4cccd37e87985a5337815c99b960ef13c65c`
- Licence: SIL Open Font License 1.1 in `OFL.txt`
- Source files: official `fonts/split/woff2/*-Latin1.woff2` binaries (SHA-256 values
  in the table), subset on 14 September 2026 with fonttools 4.65.0 (`pyftsubset`)
  and brotli:

```
pyftsubset <Face>-Latin1.woff2 --flavor=woff2 --layout-features='*' \
  --unicodes="U+0020-007E,U+00A0,U+00A3,U+00A7,U+00A9,U+00B0,U+00B1,U+00B7,U+00D7,U+00F7,U+2013,U+2018-2019,U+201C-201D,U+2026,U+2212,U+20AC" \
  --output-file=<Face>-Subset.woff2
```

Every OpenType feature is kept (tabular and old-style figures, fractions,
stylistic sets). The same ranges are the `unicode-range` of each face in
`assets/tokens.css`, and `scripts/check_design.py` fails when a page or script
uses a character outside them; re-run the command above with the new range,
then update `tokens.css` and this table.

| File | Upstream source | Source SHA-256 | Bytes | SHA-256 |
| --- | --- | --- | ---: | --- |
| `IBMPlexMono-Regular-Subset.woff2` | `IBM-Plex-Mono/fonts/split/woff2/IBMPlexMono-Regular-Latin1.woff2` | `10d3c7fa7eaf48e78db24f317b64f008a75e00f63a68bb3c2afc6ef51e58674f` | 11932 | `dc43c343b69db4873f70619a5827d5e480537734754da86d8ca6e2acb52c64c4` |
| `IBMPlexSans-Italic-Subset.woff2` | `IBM-Plex-Sans/fonts/split/woff2/IBMPlexSans-Italic-Latin1.woff2` | `0a06b98143f3453b81f3c396241a01c6c4cff84c1a77bf0c75b18bd603018506` | 16164 | `84ac0929564f7ce9cbf0cb30065c0a4621b687bd369904b2547d4a8dece18cae` |
| `IBMPlexSans-Regular-Subset.woff2` | `IBM-Plex-Sans/fonts/split/woff2/IBMPlexSans-Regular-Latin1.woff2` | `b5ad7bd39f996144915f0ad9849a90183b27d8c28ad97ed98af5b1bebc51f6b1` | 14724 | `97f00f1654ee7be286fcac0ce15ddb394d218653539fa536465ad23b15b52037` |
| `IBMPlexSans-SemiBold-Subset.woff2` | `IBM-Plex-Sans/fonts/split/woff2/IBMPlexSans-SemiBold-Latin1.woff2` | `fff0ab3a88b0b4aa0b693e4f0201359a15183b08e3fa5696d1918d8f0ade8ad5` | 15688 | `f60e1d2fdd59b9c7048122de975628203ec422f752d23441fce4a4e8f33b20d4` |
| `IBMPlexSerif-Regular-Subset.woff2` | `IBM-Plex-Serif/fonts/split/woff2/IBMPlexSerif-Regular-Latin1.woff2` | `6ebe5b7a2bbe864712e0d87a785a77ebde8a58d940d6163c1f03c6ffab1cd9a9` | 15968 | `28303335096961fbfb591133d02e005421e5436f688236edad80713ef49dedf2` |
| `IBMPlexSerif-SemiBold-Subset.woff2` | `IBM-Plex-Serif/fonts/split/woff2/IBMPlexSerif-SemiBold-Latin1.woff2` | `1d34d4612be8d2f06a25858a8bc3c3c3b5c4ec0ee1285501c3a4df2ddace7afa` | 16812 | `2c2d3894bba16df38beb2b48ba4ec38724cd1826dcd5f580b9cf90cbabe66206` |
