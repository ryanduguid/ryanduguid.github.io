# IBM Plex webfont sources

The site self-hosts the Latin1 WOFF2 splits shipped by IBM Plex v6.4.2, unmodified.

- Upstream: <https://github.com/IBM/plex>
- Tag: `v6.4.2`
- Peeled commit: `242c4cccd37e87985a5337815c99b960ef13c65c`
- Licence: SIL Open Font License 1.1 in `OFL.txt`
- Format: official `fonts/split/woff2/*-Latin1.woff2` binaries, byte for byte as published

The files keep IBM's font names because they are IBM's own binaries. The OFL
reserves the name "Plex" (condition 3 in `OFL.txt`), and its publisher treats a
static subset as a Modified Version that may not carry a reserved name without
the copyright holder's written permission. A `pyftsubset` cut of these files
shipped between 14 September 2026 pull request 144 and this change; it was
withdrawn for that reason, not for a rendering fault. Do not subset or rename
these files without recording a permission basis here.

Each face in `assets/tokens.css` declares the characters the pages use as its
`unicode-range`, and `scripts/check_design.py` fails when a page or script uses a
character outside it. Every code point in those ranges is present in the Latin1
splits; widen the ranges in `tokens.css` before using a new character.

| File | Upstream path | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| `IBMPlexMono-Regular-Latin1.woff2` | `IBM-Plex-Mono/fonts/split/woff2/IBMPlexMono-Regular-Latin1.woff2` | 17268 | `10d3c7fa7eaf48e78db24f317b64f008a75e00f63a68bb3c2afc6ef51e58674f` |
| `IBMPlexSans-Italic-Latin1.woff2` | `IBM-Plex-Sans/fonts/split/woff2/IBMPlexSans-Italic-Latin1.woff2` | 22924 | `0a06b98143f3453b81f3c396241a01c6c4cff84c1a77bf0c75b18bd603018506` |
| `IBMPlexSans-Regular-Latin1.woff2` | `IBM-Plex-Sans/fonts/split/woff2/IBMPlexSans-Regular-Latin1.woff2` | 20984 | `b5ad7bd39f996144915f0ad9849a90183b27d8c28ad97ed98af5b1bebc51f6b1` |
| `IBMPlexSans-SemiBold-Latin1.woff2` | `IBM-Plex-Sans/fonts/split/woff2/IBMPlexSans-SemiBold-Latin1.woff2` | 22260 | `fff0ab3a88b0b4aa0b693e4f0201359a15183b08e3fa5696d1918d8f0ade8ad5` |
| `IBMPlexSerif-Regular-Latin1.woff2` | `IBM-Plex-Serif/fonts/split/woff2/IBMPlexSerif-Regular-Latin1.woff2` | 22680 | `6ebe5b7a2bbe864712e0d87a785a77ebde8a58d940d6163c1f03c6ffab1cd9a9` |
| `IBMPlexSerif-SemiBold-Latin1.woff2` | `IBM-Plex-Serif/fonts/split/woff2/IBMPlexSerif-SemiBold-Latin1.woff2` | 23756 | `1d34d4612be8d2f06a25858a8bc3c3c3b5c4ec0ee1285501c3a4df2ddace7afa` |
