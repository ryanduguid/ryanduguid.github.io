# OLED, GEO and Performance Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:executing-plans` to implement this plan task by task. The user's
> working agreement prohibits subagents unless the user explicitly requests
> them, so inline execution is the only currently authorised path. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an OLED-first, GEO-friendly and materially faster version of
`duguid.com.au` while preserving its factual, legal and machine-readable
contracts, then merge the reviewed pull request and prove the custom domain is
serving the exact result.

**Architecture:** Keep the static HTML and CSS architecture. Remove the serial
CSS import, expose the machine-readable index through semantic HTML, defer the
below-fold proof image, switch the semantic tokens to one true-black theme and
self-host IBM's official Latin1 WOFF2 subsets. Extend the existing executable
design checker so delivery, OLED contrast, font coverage and protected facts
remain durable contracts.

**Tech Stack:** Native HTML, CSS custom properties, Python 3.13 standard
library checkers, Node's built-in test runner for the unchanged calculator,
GitHub Pages, Browser Use over Chrome DevTools Protocol, GitHub CLI.

**Spec:**
`docs/superpowers/specs/2026-08-28-oled-geo-performance-design.md`

## Global Constraints

- Start from source baseline
  `adb31c63f17e608545197a703d3823c2cb3ca7f3` on branch
  `codex/duguid-oled-geo-performance` in the existing isolated worktree.
- Theme is OLED dark only. The canvas is exactly `#000000` and native controls
  use `color-scheme: dark`.
- Preserve Engage, Adopt and Verify as the three one-thought homepage routes.
- Keep the homepage JavaScript-free and leave `assets/levy.mjs` unchanged.
- Keep `llms.txt`, `robots.txt`, `sitemap.xml`, rate-main content, every JSON-LD
  node, disclaimer, refusal boundary, canonical and public route unchanged.
- Keep IBM Plex licensed under the bundled SIL Open Font License 1.1 and serve
  every font locally as WOFF2.
- Use the official IBM Plex v6.4.2 tag and peeled source commit
  `242c4cccd37e87985a5337815c99b960ef13c65c` for Latin1 subset binaries.
- Do not add Google-specific ranking work, `noindex` to indexable pages,
  analytics, tracking, remote fonts, a framework, a bundler, a service worker,
  a CDN or a JavaScript theme switcher.
- Do not add gradients, glow, scanlines, noise, background video, canvas
  rendering, decorative motion, pills or repeated generic cards.
- Use Australian English. Do not add em dashes, en dashes, marketing slop,
  fabricated claims, rates, citations, testimonials or outcomes.
- Make local source edits with `apply_patch`. Binary WOFF2 downloads are the
  sole exception because a text patch cannot represent them safely.
- Follow strict red, green, refactor cycles. Each new mutation test must fail
  for its named production break before implementation is written.
- Run `python scripts/check_site.py` as the complete repository check. Do not
  invent or substitute another aggregate command.

## File map

### Design and delivery sources

- `assets/tokens.css`: six self-hosted `@font-face` declarations, the only raw
  colour values and all global size, motion and layer tokens.
- `assets/site.css`: component and responsive CSS only; it must not import the
  token sheet or contain raw hex colours.
- `assets/fonts/*.woff2`: official upstream Latin1 subset binaries only.
- `assets/fonts/OFL.txt`: unchanged SIL Open Font License 1.1.
- `assets/fonts/SOURCES.md`: exact upstream tag, commit, path, byte count and
  SHA-256 for every shipped WOFF2 file.
- `index.html`: homepage machine-index discovery, parallel stylesheet links,
  visible footer discovery and deferred proof-image attributes.
- The other 18 indexable pages: parallel stylesheet links, head discovery and
  visible footer discovery.
- `404.html`: parallel stylesheet links and visible footer discovery, with no
  canonical or head alternate added.
- `tools/review-ready-gate/index.html`: no-index static redirect, untouched.
- `google03d2012cc1791991.html`: ownership verification file, untouched.

### Executable contracts

- `scripts/check_design.py`: protected-file, protected-main, JSON-LD,
  disclaimer, delivery, OLED, font coverage and asset-budget checks.
- `scripts/test_check_design.py`: real temporary repositories and mutation
  tests that prove each new checker can fail.
- `scripts/design_baseline.json`: protected whole-file hashes, rate-main text
  hashes, semantic JSON-LD hashes and official font hashes.
- `scripts/check_site.py`: unchanged aggregate runner.
- `scripts/check_seo.py`, `scripts/site_contracts.py`, `scripts/seo_core.py`:
  unchanged contracts that must continue passing.

### Documentation

- `DESIGN.md`: replace the old light/dark contract with the approved OLED,
  GEO, font-delivery and performance contract.
- `README.md`: describe the expanded local check coverage without changing the
  single documented check command.
- `docs/superpowers/specs/2026-08-28-oled-geo-performance-design.md`: approved
  source of requirements, no further change unless implementation contradicts
  it.

---

### Task 1: Protect facts while removing the serial delivery chain

**Files:**

- Modify: `scripts/test_check_design.py`
- Modify: `scripts/check_design.py`
- Modify: `scripts/design_baseline.json`
- Modify: `assets/site.css:1`
- Modify: `index.html:14-17, 160, 294-301`
- Modify: `about/index.html`
- Modify: `evidence/index.html`
- Modify: `evaluate/manager-review-gate/index.html`
- Modify: `evaluate/payday-super-evidence/index.html`
- Modify: `evaluate/xero-trial-balance-integrity/index.html`
- Modify: `rates/cents-per-kilometre/index.html`
- Modify: `rates/div7a-benchmark-rate/index.html`
- Modify: `rates/super-guarantee/index.html`
- Modify: `tools/ato-benchmarks/index.html`
- Modify: `tools/australian-tax-ai-agents/index.html`
- Modify: `tools/coal-lsl-levy/index.html`
- Modify: `tools/company-tax-franking/index.html`
- Modify: `tools/payday-super/index.html`
- Modify: `tools/subcontractor-ledgers/index.html`
- Modify: `tools/trust-distributions/index.html`
- Modify: `tools/wip-schedule/index.html`
- Modify: `tools/workpaper-review-gate/index.html`
- Modify: `tools/xero-trial-balance/index.html`
- Modify: `404.html`
- Must not modify: `tools/review-ready-gate/index.html`
- Must not modify: `google03d2012cc1791991.html`

**Interfaces:**

- Produces: `main_visible_digest(path: Path) -> str | None`
- Produces:
  `check_document_delivery(root: Path, baseline: dict[str, object]) -> list[str]`
- Consumes: `baseline["json_ld"]` keys as the exact 19 indexable page paths.
- Consumes: `baseline["protected_main_text"]` as rate-main text snapshots.
- Preserves: `check_repository(root: Path = ROOT) -> list[str]` as the public
  checker entry point.

- [ ] **Step 1: Add red tests for semantic rate protection**

In `scripts/test_check_design.py`, change the temporary rate page to include a
head and footer around the existing main content. Remove the rate page from the
fixture's `protected_files`, remove the old `rate table drift` whole-file
mutation, then add literal baseline data and the two semantic tests below. The
expected digest is hand-derived from the exact visible main string `12%`, not
calculated through the function under test:

```python
baseline = {
    "protected_files": {"llms.txt": digest(llms)},
    "protected_main_text": {
        "rates/example/index.html": (
            "234d0e73855ae7bf477734cbd4c1e50d56d5d00af3edb4bc8ddbdf44e8d5c8de"
        )
    },
    # existing json_ld, protected_text and fonts entries stay here
}
```

Add these mutations to `self_check()`:

```python
head_only_failures = fixture_failures(
    lambda root: (root / "rates/example/index.html").write_text(
        (root / "rates/example/index.html")
        .read_text(encoding="utf-8")
        .replace("</head>", '<meta name="x-test" content="shared chrome" /></head>'),
        encoding="utf-8",
    )
)
assert not any("protected main" in failure for failure in head_only_failures)

rate_failures = fixture_failures(
    lambda root: (root / "rates/example/index.html").write_text(
        (root / "rates/example/index.html")
        .read_text(encoding="utf-8")
        .replace("<main>12%</main>", "<main>13%</main>"),
        encoding="utf-8",
    )
)
assert any(
    "protected main text changed: rates/example/index.html" in failure
    for failure in rate_failures
)
```

- [ ] **Step 2: Run the focused test and observe the named failure**

Run:

```powershell
python scripts/test_check_design.py
```

Expected: FAIL because `check_design.py` does not yet consume
`protected_main_text`, so changing `12%` to `13%` is not reported as
`protected main text changed`.

- [ ] **Step 3: Implement protected main-text hashing**

Add to `scripts/check_design.py`:

```python
MAIN_PATTERN = re.compile(r"<main\b[^>]*>(.*?)</main>", re.S | re.I)


def main_visible_digest(path: Path) -> str | None:
    matches = MAIN_PATTERN.findall(path.read_text(encoding="utf-8"))
    if len(matches) != 1:
        return None
    return sha256_bytes(visible_text(matches[0]).encode("utf-8"))
```

In `check_repository()`, after the whole-file loop, add:

```python
for rel, expected in baseline.get("protected_main_text", {}).items():
    path = root / rel
    if not path.is_file():
        failures.append(f"protected main page missing: {rel}")
        continue
    actual = main_visible_digest(path)
    if actual is None:
        failures.append(f"protected main missing or duplicated: {rel}")
    elif actual != expected:
        failures.append(f"protected main text changed: {rel}")
```

Update the real `scripts/design_baseline.json` so `protected_files` contains
these exact whole-file hashes:

```json
{
  "llms.txt": "4133a06aeef0cdf1d014d49c61051a80365a1f2680dbbb874a1c5c658376c3a5",
  "robots.txt": "55445c95d41b8c8b1b386bfb1b1279b879954d66715747cdc0b10bff3b5dd7ea",
  "sitemap.xml": "2dd5d7f737a88e28136117706923fc070bc659fa2d34239820e6fd2af633a51b"
}
```

Add this exact sibling object:

```json
"protected_main_text": {
  "rates/super-guarantee/index.html": "66639dfdf6e70c42519c8355a0c91457b8887c5319343dd1f53a5e408f89b290",
  "rates/div7a-benchmark-rate/index.html": "14abcf17bfbdaa2bd2aa8f8bbfba5eee9e3f85613aee946288839d0886326b02",
  "rates/cents-per-kilometre/index.html": "9b07dce55bbb4328e25d69db5663cabe9d4c8d6deb107e609515f6ab0eefca2b"
}
```

Remove the three rate-page entries from `protected_files`. Do not change their
main elements or JSON-LD.

- [ ] **Step 4: Run the focused test and confirm the protection is green**

Run:

```powershell
python scripts/test_check_design.py
```

Expected: PASS, including the head-only tolerance and main-text mutation.

- [ ] **Step 5: Add red delivery mutations against a valid fixture**

Update the temporary fixture page so it contains this exact delivery surface:

```html
<head>
  <link rel="alternate" type="text/plain" href="https://duguid.com.au/llms.txt" />
  <link rel="stylesheet" href="/assets/tokens.css" />
  <link rel="stylesheet" href="/assets/site.css" />
</head>
<body>
  <main><h1>Example</h1>
    <img src="/assets/coal-lsl-calculator.webp" width="868" height="1106"
      loading="lazy" decoding="async" fetchpriority="low" alt="Example" />
  </main>
  <footer><a href="/llms.txt">Machine-readable index</a></footer>
</body>
```

Create the fixture's styled 404 page explicitly so the real delivery boundary
is exercised rather than skipped:

```python
(root / "404.html").write_text(
    '<!doctype html><html><head>'
    '<link rel="stylesheet" href="/assets/tokens.css" />'
    '<link rel="stylesheet" href="/assets/site.css" />'
    '</head><body><main><h1>Not found</h1></main>'
    '<footer><a href="/llms.txt">Machine-readable index</a></footer>'
    '</body></html>',
    encoding="utf-8",
)
```

Remove the old token `@import` from the temporary `assets/site.css`. Replace the
existing `missing token import` mutation with the `serial stylesheet import`
mutation below, then add one mutation for each remaining break. Keep every
mutation's named expected message:

```python
(
    "serial stylesheet import",
    lambda root: (root / "assets/site.css").write_text(
        '@import url("/assets/tokens.css");\nbody { background: var(--colour-canvas); }',
        encoding="utf-8",
    ),
    "assets/site.css: token import creates a serial request chain",
),
(
    "missing token stylesheet",
    lambda root: (root / "index.html").write_text(
        (root / "index.html")
        .read_text(encoding="utf-8")
        .replace('<link rel="stylesheet" href="/assets/tokens.css" />', ""),
        encoding="utf-8",
    ),
    "index.html: expected one tokens stylesheet before site stylesheet",
),
(
    "missing machine alternate",
    lambda root: (root / "index.html").write_text(
        (root / "index.html")
        .read_text(encoding="utf-8")
        .replace(
            '<link rel="alternate" type="text/plain" '
            'href="https://duguid.com.au/llms.txt" />',
            "",
        ),
        encoding="utf-8",
    ),
    "index.html: expected one llms.txt alternate link",
),
(
    "missing visible machine index",
    lambda root: (root / "index.html").write_text(
        (root / "index.html")
        .read_text(encoding="utf-8")
        .replace('<a href="/llms.txt">Machine-readable index</a>', ""),
        encoding="utf-8",
    ),
    "index.html: expected one visible machine-readable index link",
),
(
    "eager proof image",
    lambda root: (root / "index.html").write_text(
        (root / "index.html")
        .read_text(encoding="utf-8")
        .replace(' loading="lazy"', ""),
        encoding="utf-8",
    ),
    "index.html: Coal LSL proof image must load lazily",
),
```

- [ ] **Step 6: Run the focused test and observe the delivery failure**

Run:

```powershell
python scripts/test_check_design.py
```

Expected: FAIL on the first new delivery mutation because the current checker
still requires `@import` and does not inspect HTML delivery.

- [ ] **Step 7: Implement document-delivery checks**

Replace the import requirement in `check_stylesheets()` with:

```python
if re.search(r"@import\b", site_css, re.I):
    failures.append("assets/site.css: token import creates a serial request chain")
```

Add these constants and checker:

```python
TOKENS_LINK = '<link rel="stylesheet" href="/assets/tokens.css" />'
SITE_LINK = '<link rel="stylesheet" href="/assets/site.css" />'
LLMS_ALTERNATE = (
    '<link rel="alternate" type="text/plain" '
    'href="https://duguid.com.au/llms.txt" />'
)
LLMS_VISIBLE = '<a href="/llms.txt">Machine-readable index</a>'
PROOF_IMAGE_PATTERN = re.compile(
    r'<img\b(?=[^>]*\bsrc="/assets/coal-lsl-calculator\.webp")[^>]*>',
    re.I,
)


def check_document_delivery(
    root: Path, baseline: dict[str, object]
) -> list[str]:
    failures: list[str] = []
    indexable = set(baseline.get("json_ld", {}))
    styled = indexable | {"404.html"}

    for rel in sorted(styled):
        path = root / rel
        if not path.is_file():
            failures.append(f"styled page missing: {rel}")
            continue
        raw = path.read_text(encoding="utf-8")
        token_at = raw.find(TOKENS_LINK)
        site_at = raw.find(SITE_LINK)
        if (
            raw.count(TOKENS_LINK) != 1
            or raw.count(SITE_LINK) != 1
            or token_at > site_at
        ):
            failures.append(
                f"{rel}: expected one tokens stylesheet before site stylesheet"
            )
        if raw.count(LLMS_VISIBLE) != 1:
            failures.append(
                f"{rel}: expected one visible machine-readable index link"
            )
        if rel in indexable and raw.count(LLMS_ALTERNATE) != 1:
            failures.append(f"{rel}: expected one llms.txt alternate link")

    homepage_path = root / "index.html"
    if not homepage_path.is_file():
        return failures
    homepage = homepage_path.read_text(encoding="utf-8")
    image_match = PROOF_IMAGE_PATTERN.search(homepage)
    if image_match is None:
        failures.append("index.html: Coal LSL proof image is missing")
    else:
        image = image_match.group(0)
        required = {
            'loading="lazy"': "load lazily",
            'decoding="async"': "decode asynchronously",
            'fetchpriority="low"': "use low fetch priority",
            'width="868"': "keep its width",
            'height="1106"': "keep its height",
        }
        for marker, message in required.items():
            if marker not in image:
                failures.append(
                    f"index.html: Coal LSL proof image must {message}"
                )
    return failures
```

Call `check_document_delivery(root, baseline)` from `check_repository()` after
the factual checks.

- [ ] **Step 8: Apply the parallel HTML delivery contract**

Remove line 1 from `assets/site.css`:

```css
@import url("/assets/tokens.css");
```

On each of the 19 indexable pages listed below, put this alternate link in the
head once, then put the token link immediately before the existing site link:

```html
<link rel="alternate" type="text/plain" href="https://duguid.com.au/llms.txt" />
<link rel="stylesheet" href="/assets/tokens.css" />
<link rel="stylesheet" href="/assets/site.css" />
```

The exact 19 paths are:

```text
about/index.html
evaluate/manager-review-gate/index.html
evaluate/payday-super-evidence/index.html
evaluate/xero-trial-balance-integrity/index.html
evidence/index.html
index.html
rates/cents-per-kilometre/index.html
rates/div7a-benchmark-rate/index.html
rates/super-guarantee/index.html
tools/ato-benchmarks/index.html
tools/australian-tax-ai-agents/index.html
tools/coal-lsl-levy/index.html
tools/company-tax-franking/index.html
tools/payday-super/index.html
tools/subcontractor-ledgers/index.html
tools/trust-distributions/index.html
tools/wip-schedule/index.html
tools/workpaper-review-gate/index.html
tools/xero-trial-balance/index.html
```

On `404.html`, add only the two stylesheet links. Do not add a canonical or
alternate link.

In every one of those 20 styled pages, add this exact third footer link inside
the existing `.site-footer__links` element:

```html
<a href="/llms.txt">Machine-readable index</a>
```

Do not touch the no-index redirect or Google verification file.

Change the homepage proof image to:

```html
<img src="/assets/coal-lsl-calculator.webp" width="868" height="1106"
  loading="lazy" decoding="async" fetchpriority="low"
  alt="Coal LSL levy calculator showing synthetic monthly inputs and an explained levy result" />
```

Do not create another image variant. The current WebP is only 45,726 bytes and
the high-DPI mobile presentation can use its full 868-pixel width. Deferring it
removes the whole request from the initial viewport without adding format or
markup complexity.

- [ ] **Step 9: Run focused and aggregate checks**

Run:

```powershell
python scripts/test_check_design.py
python scripts/check_design.py
python scripts/check_site.py
```

Expected: all three commands pass. The aggregate output must still reach
`site checks passed` and include the 21 calculator tests reported by the
current Node test suite.

- [ ] **Step 10: Prove protected files and rate-main text did not move**

Run:

```powershell
git diff adb31c63f17e608545197a703d3823c2cb3ca7f3 -- llms.txt robots.txt sitemap.xml assets/levy.mjs
python scripts/check_design.py
```

Expected: the Git diff is empty and the design checker reports
`design contracts passed`.

- [ ] **Step 11: Commit the delivery unit**

Run:

```powershell
git add -- assets/site.css index.html 404.html about evidence evaluate rates tools scripts/check_design.py scripts/test_check_design.py scripts/design_baseline.json
git commit -m "perf: remove serial delivery from the public register"
```

Expected: one focused commit containing the executable delivery contract and
the HTML/CSS changes that satisfy it.

---

### Task 2: Make the register OLED-first

**Files:**

- Modify: `scripts/test_check_design.py`
- Modify: `scripts/check_design.py`
- Modify: `assets/tokens.css`
- Modify: `assets/site.css`
- Modify: `DESIGN.md`

**Interfaces:**

- Produces: `css_root_properties(tokens_css: str) -> dict[str, str]`
- Produces: `contrast_ratio(first: str, second: str) -> float`
- Produces: `check_oled_tokens(tokens_css: str) -> list[str]`
- Consumes: semantic custom properties from `assets/tokens.css`.
- Preserves: component CSS continues to use tokens rather than raw colours.

- [ ] **Step 1: Add red OLED and contrast mutations**

Make the temporary token fixture use the approved palette, then add these
mutations to `scripts/test_check_design.py`:

```python
(
    "non-black canvas",
    lambda root: (root / "assets/tokens.css").write_text(
        (root / "assets/tokens.css")
        .read_text(encoding="utf-8")
        .replace("--colour-canvas: #000000", "--colour-canvas: #010101"),
        encoding="utf-8",
    ),
    "OLED canvas must be #000000",
),
(
    "mixed colour scheme",
    lambda root: (root / "assets/tokens.css").write_text(
        (root / "assets/tokens.css")
        .read_text(encoding="utf-8")
        .replace("color-scheme: dark", "color-scheme: light dark"),
        encoding="utf-8",
    ),
    "native colour scheme must be dark only",
),
(
    "low contrast supporting ink",
    lambda root: (root / "assets/tokens.css").write_text(
        (root / "assets/tokens.css")
        .read_text(encoding="utf-8")
        .replace("--colour-ink-soft: #9aa89f", "--colour-ink-soft: #555555"),
        encoding="utf-8",
    ),
    "--colour-ink-soft contrast on canvas must be at least 4.5:1",
),
(
    "system light override",
    lambda root: (root / "assets/tokens.css").write_text(
        (root / "assets/tokens.css").read_text(encoding="utf-8")
        + "\n@media (prefers-color-scheme: light) { :root { --colour-canvas: #fff; } }",
        encoding="utf-8",
    ),
    "OLED theme must not contain a prefers-color-scheme override",
),
```

- [ ] **Step 2: Run the focused test and observe the OLED failure**

Run:

```powershell
python scripts/test_check_design.py
```

Expected: FAIL because the checker does not yet parse the root token block,
measure contrast or reject system colour overrides.

- [ ] **Step 3: Implement token parsing and contrast checks**

Add to `scripts/check_design.py`:

```python
ROOT_BLOCK_PATTERN = re.compile(r":root\s*\{(.*?)\}", re.S | re.I)
PROPERTY_PATTERN = re.compile(r"(--[\w-]+)\s*:\s*([^;]+);")


def css_root_properties(tokens_css: str) -> dict[str, str]:
    match = ROOT_BLOCK_PATTERN.search(tokens_css)
    if match is None:
        return {}
    return {
        name.lower(): value.strip().lower()
        for name, value in PROPERTY_PATTERN.findall(match.group(1))
    }


def relative_luminance(colour: str) -> float:
    value = colour.removeprefix("#")
    channels = [int(value[index : index + 2], 16) / 255 for index in (0, 2, 4)]
    linear = [
        channel / 12.92
        if channel <= 0.04045
        else ((channel + 0.055) / 1.055) ** 2.4
        for channel in channels
    ]
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]


def contrast_ratio(first: str, second: str) -> float:
    first_luminance = relative_luminance(first)
    second_luminance = relative_luminance(second)
    lighter = max(first_luminance, second_luminance)
    darker = min(first_luminance, second_luminance)
    return (lighter + 0.05) / (darker + 0.05)


def check_oled_tokens(tokens_css: str) -> list[str]:
    failures: list[str] = []
    properties = css_root_properties(tokens_css)
    if not re.search(r"\bcolor-scheme\s*:\s*dark\s*;", tokens_css, re.I):
        failures.append("native colour scheme must be dark only")
    if "prefers-color-scheme" in tokens_css.lower():
        failures.append("OLED theme must not contain a prefers-color-scheme override")
    canvas = properties.get("--colour-canvas")
    if canvas != "#000000":
        failures.append("OLED canvas must be #000000")
        return failures
    for token in (
        "--colour-ink",
        "--colour-ink-soft",
        "--colour-stamp",
        "--colour-alert",
    ):
        value = properties.get(token)
        if value is None or not re.fullmatch(r"#[0-9a-f]{6}", value):
            failures.append(f"{token} must be a six-digit colour")
        elif contrast_ratio(value, canvas) < 4.5:
            failures.append(f"{token} contrast on canvas must be at least 4.5:1")
    return failures
```

Call `check_oled_tokens(tokens_css)` from `check_stylesheets()`.

- [ ] **Step 4: Apply the approved OLED token values**

In `assets/tokens.css`, replace only the existing `color-scheme`, 15 colour
declarations and two motion-duration declarations in place with the following
declarations. Leave every font, type, spacing, border, width, layer and easing
declaration in `:root` unchanged:

```css
color-scheme: dark;

--colour-canvas: #000000;
--colour-paper: #050806;
--colour-paper-raised: #09100d;
--colour-ink: #eef4f0;
--colour-ink-soft: #9aa89f;
--colour-rule: #26332d;
--colour-rule-strong: #5c7166;
--colour-stamp: #4dff88;
--colour-stamp-strong: #78ffa3;
--colour-stamp-wash: #082619;
--colour-alert: #ff9c91;
--colour-masthead: #eef4f0;
--colour-code: #020403;
--colour-code-ink: #eef4f0;
--colour-code-comment: #9aa89f;

--motion-fast: 120ms;
--motion-standard: 160ms;
```

Delete the entire `@media (prefers-color-scheme: dark)` block. Retain the
existing reduced-motion block.

Add one restrained selection rule to `assets/site.css` after the universal
box-sizing rule:

```css
::selection {
  color: var(--colour-canvas);
  background: var(--colour-stamp);
}
```

Do not add a light override, theme toggle, gradient, glow, texture or raw hex
colour to component CSS.

- [ ] **Step 5: Update the durable design documentation**

In `DESIGN.md`:

- set the source baseline to `adb31c63f17e608545197a703d3823c2cb3ca7f3`
- set `MOTION_INTENSITY` to 2
- state `Theme: OLED dark only`
- replace the light and dark colour sections with one table containing the
  exact values from Step 4 and their approved contrast ratios
- state that true black is deliberate for OLED pixels and overrides the prior
  pure-black prohibition
- replace system light/dark inspection requirements with one OLED theme plus
  forced-colours and reduced-motion inspection
- state that rate main text is protected semantically while shared head and
  footer chrome may evolve
- correct the JSON-LD count to the 19 indexable pages represented by the
  baseline map
- document no Google-specific ranking work and the preserved crawler split
- document the production baseline of about 303 KB, about 250 KB of fonts,
  about 46 KB of eager image, 1.40-second LCP under the recorded profile and
  CLS 0

- [ ] **Step 6: Run focused, design and aggregate checks**

Run:

```powershell
python scripts/test_check_design.py
python scripts/check_design.py
python scripts/check_site.py
git diff --check
```

Expected: all commands pass. The OLED checker must report no contrast failure,
and `git diff --check` must print nothing.

- [ ] **Step 7: Commit the OLED unit**

Run:

```powershell
git add -- assets/tokens.css assets/site.css scripts/check_design.py scripts/test_check_design.py DESIGN.md
git commit -m "feat: make the accounting register OLED-first"
```

Expected: one focused commit that contains the executable palette contract,
the token change and its design documentation.

---

### Task 3: Replace full fonts with official IBM Latin1 subsets

**Files:**

- Modify: `scripts/test_check_design.py`
- Modify: `scripts/check_design.py`
- Modify: `scripts/design_baseline.json`
- Modify: `assets/tokens.css`
- Delete: `assets/fonts/IBMPlexMono-Regular.woff2`
- Delete: `assets/fonts/IBMPlexSans-Italic.woff2`
- Delete: `assets/fonts/IBMPlexSans-Regular.woff2`
- Delete: `assets/fonts/IBMPlexSans-SemiBold.woff2`
- Delete: `assets/fonts/IBMPlexSerif-Regular.woff2`
- Delete: `assets/fonts/IBMPlexSerif-SemiBold.woff2`
- Create: `assets/fonts/IBMPlexMono-Regular-Latin1.woff2`
- Create: `assets/fonts/IBMPlexSans-Italic-Latin1.woff2`
- Create: `assets/fonts/IBMPlexSans-Regular-Latin1.woff2`
- Create: `assets/fonts/IBMPlexSans-SemiBold-Latin1.woff2`
- Create: `assets/fonts/IBMPlexSerif-Regular-Latin1.woff2`
- Create: `assets/fonts/IBMPlexSerif-SemiBold-Latin1.woff2`
- Create: `assets/fonts/SOURCES.md`
- Preserve byte-for-byte: `assets/fonts/OFL.txt`
- Modify: `DESIGN.md`
- Modify: `README.md`

**Interfaces:**

- Produces: `unicode_ranges(font_face: str) -> list[tuple[int, int]]`
- Produces: `range_covers(ranges: list[tuple[int, int]], codepoint: int) -> bool`
- Produces:
  `check_font_delivery(root: Path, tokens_css: str, baseline: dict[str, object]) -> list[str]`
- Consumes: visible HTML text through the existing `visible_text()` parser.
- Enforces: each declared font file is at most 25,000 bytes and all six total
  at most 135,000 bytes.

- [ ] **Step 1: Add red font coverage and budget mutations**

Add a visible middle dot to the temporary page fixture and add an official
Latin1 `unicode-range` to its `@font-face`:

```css
unicode-range: U+0020-007E, U+00A0-00FF;
```

Add these mutations:

```python
(
    "missing visible glyph",
    lambda root: (root / "assets/tokens.css").write_text(
        (root / "assets/tokens.css")
        .read_text(encoding="utf-8")
        .replace("U+0020-007E, U+00A0-00FF", "U+0020-007E"),
        encoding="utf-8",
    ),
    "font face 1 does not cover visible U+00B7",
),
(
    "oversized webfont",
    lambda root: (root / "assets/fonts/Test.woff2").write_bytes(b"x" * 25001),
    "font exceeds 25000-byte delivery budget: assets/fonts/Test.woff2",
),
```

- [ ] **Step 2: Run the focused test and observe the font failure**

Run:

```powershell
python scripts/test_check_design.py
```

Expected: FAIL because the checker currently verifies presence, digest and
`font-display` only; it does not prove visible glyph coverage or byte budgets.

- [ ] **Step 3: Implement unicode-range and byte-budget checks**

Add to `scripts/check_design.py`:

```python
UNICODE_RANGE_PATTERN = re.compile(
    r"U\+([0-9A-F]{1,6})(?:-([0-9A-F]{1,6}))?", re.I
)
MAX_FONT_BYTES = 25_000
MAX_TOTAL_FONT_BYTES = 135_000


def unicode_ranges(font_face: str) -> list[tuple[int, int]]:
    declaration = re.search(
        r"\bunicode-range\s*:\s*([^;]+);", font_face, re.I
    )
    if declaration is None:
        return []
    ranges: list[tuple[int, int]] = []
    for start, end in UNICODE_RANGE_PATTERN.findall(declaration.group(1)):
        first = int(start, 16)
        ranges.append((first, int(end, 16) if end else first))
    return ranges


def range_covers(ranges: list[tuple[int, int]], codepoint: int) -> bool:
    return any(start <= codepoint <= end for start, end in ranges)


def check_font_delivery(
    root: Path, tokens_css: str, baseline: dict[str, object]
) -> list[str]:
    failures: list[str] = []
    faces = FONT_FACE_PATTERN.findall(tokens_css)
    visible = " ".join(
        visible_text(path.read_text(encoding="utf-8"))
        for path in sorted(root.rglob("*.html"))
        if not (path.name.startswith("google") and path.name.endswith(".html"))
    )
    required = sorted({ord(character) for character in visible if ord(character) > 31})
    for index, face in enumerate(faces, start=1):
        ranges = unicode_ranges(face)
        if not ranges:
            failures.append(f"font face {index} must declare unicode-range")
            continue
        for codepoint in required:
            if not range_covers(ranges, codepoint):
                failures.append(
                    f"font face {index} does not cover visible U+{codepoint:04X}"
                )
                break

    declared = sorted(
        {url.removeprefix("/") for url in FONT_URL_PATTERN.findall(tokens_css)}
    )
    total = 0
    for rel in declared:
        path = root / rel
        if not path.is_file():
            continue
        size = path.stat().st_size
        total += size
        if size > MAX_FONT_BYTES:
            failures.append(f"font exceeds {MAX_FONT_BYTES}-byte delivery budget: {rel}")
    if total > MAX_TOTAL_FONT_BYTES:
        failures.append(
            f"declared fonts total {total} bytes, over {MAX_TOTAL_FONT_BYTES}-byte budget"
        )
    return failures
```

Call it once from `check_repository()` after `check_stylesheets()`.

- [ ] **Step 4: Download the six exact official subset binaries**

Download from IBM's immutable v6.4.2 tag into `assets/fonts/` using the
upstream filenames below. These are binary retrievals, not text-file edits:

```powershell
$fontBase = 'https://raw.githubusercontent.com/IBM/plex/v6.4.2/'
$fontPaths = @(
  'IBM-Plex-Serif/fonts/split/woff2/IBMPlexSerif-Regular-Latin1.woff2',
  'IBM-Plex-Serif/fonts/split/woff2/IBMPlexSerif-SemiBold-Latin1.woff2',
  'IBM-Plex-Sans/fonts/split/woff2/IBMPlexSans-Regular-Latin1.woff2',
  'IBM-Plex-Sans/fonts/split/woff2/IBMPlexSans-Italic-Latin1.woff2',
  'IBM-Plex-Sans/fonts/split/woff2/IBMPlexSans-SemiBold-Latin1.woff2',
  'IBM-Plex-Mono/fonts/split/woff2/IBMPlexMono-Regular-Latin1.woff2'
)
foreach ($fontPath in $fontPaths) {
  $fontName = [IO.Path]::GetFileName($fontPath)
  Invoke-WebRequest -Uri ($fontBase + $fontPath) `
    -OutFile (Join-Path 'assets/fonts' $fontName) -UseBasicParsing
}
```

Verify the retrieved files before deleting the old ones:

```text
IBMPlexMono-Regular-Latin1.woff2   17268  10d3c7fa7eaf48e78db24f317b64f008a75e00f63a68bb3c2afc6ef51e58674f
IBMPlexSans-Italic-Latin1.woff2    22924  0a06b98143f3453b81f3c396241a01c6c4cff84c1a77bf0c75b18bd603018506
IBMPlexSans-Regular-Latin1.woff2   20984  b5ad7bd39f996144915f0ad9849a90183b27d8c28ad97ed98af5b1bebc51f6b1
IBMPlexSans-SemiBold-Latin1.woff2  22260  fff0ab3a88b0b4aa0b693e4f0201359a15183b08e3fa5696d1918d8f0ade8ad5
IBMPlexSerif-Regular-Latin1.woff2  22680  6ebe5b7a2bbe864712e0d87a785a77ebde8a58d940d6163c1f03c6ffab1cd9a9
IBMPlexSerif-SemiBold-Latin1.woff2 23756  1d34d4612be8d2f06a25858a8bc3c3c3b5c4ec0ee1285501c3a4df2ddace7afa
```

Run this exact verification:

```powershell
Get-ChildItem assets/fonts/*-Latin1.woff2 | Sort-Object Name | ForEach-Object {
  $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash.ToLowerInvariant()
  "{0} {1} {2}" -f $_.Name, $_.Length, $hash
}
```

Expected: every byte count and hash matches the table. Stop if any differs.

- [ ] **Step 5: Point each font face at its official subset**

Change each `src` in `assets/tokens.css` to its `-Latin1.woff2` filename and add
the official IBM Latin1 range to every face. Sans uses:

```css
unicode-range: U+0000, U+000D, U+0020-007E, U+00A0-00FF, U+0131,
  U+0152-0153, U+02C6, U+02DA, U+02DC, U+2013-2014, U+2018-201A,
  U+201C-201E, U+2020-2022, U+2026, U+2030, U+2039-203A, U+2044,
  U+20AC, U+2122, U+2212, U+FB01-FB02;
```

Serif and Mono use the same range without `U+0000, U+000D`. Keep
`font-display: optional` and the current family, style and weight descriptors.
Do not add `local()` sources, which would make performance and rendering
measurements depend on fonts installed on the test machine.

- [ ] **Step 6: Update official hashes and remove the replaced full files**

Replace the six WOFF2 entries under `fonts` in
`scripts/design_baseline.json` with the exact `-Latin1` paths and hashes from
Step 4. Keep the existing OFL hash:

```text
d741e57d5f865e294df801f96b7b5161a88b211df65887e4358d271c9fc5fb4f
```

After the checker points only to verified subset files, remove the six old
full files with exact Git paths:

```powershell
git rm -- assets/fonts/IBMPlexMono-Regular.woff2 `
  assets/fonts/IBMPlexSans-Italic.woff2 `
  assets/fonts/IBMPlexSans-Regular.woff2 `
  assets/fonts/IBMPlexSans-SemiBold.woff2 `
  assets/fonts/IBMPlexSerif-Regular.woff2 `
  assets/fonts/IBMPlexSerif-SemiBold.woff2
```

This deletion is recoverable from Git and is limited to superseded full-font
binaries.

- [ ] **Step 7: Record provenance without adding a build dependency**

Create `assets/fonts/SOURCES.md` with:

```markdown
# IBM Plex webfont sources

The site self-hosts the Latin1 WOFF2 subsets shipped by IBM Plex v6.4.2.

- Upstream: <https://github.com/IBM/plex>
- Tag: `v6.4.2`
- Peeled commit: `242c4cccd37e87985a5337815c99b960ef13c65c`
- Licence: SIL Open Font License 1.1 in `OFL.txt`
- Format: official `fonts/split/woff2/*-Latin1.woff2` binaries, unmodified

| File | Upstream path | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| `IBMPlexMono-Regular-Latin1.woff2` | `IBM-Plex-Mono/fonts/split/woff2/IBMPlexMono-Regular-Latin1.woff2` | 17268 | `10d3c7fa7eaf48e78db24f317b64f008a75e00f63a68bb3c2afc6ef51e58674f` |
| `IBMPlexSans-Italic-Latin1.woff2` | `IBM-Plex-Sans/fonts/split/woff2/IBMPlexSans-Italic-Latin1.woff2` | 22924 | `0a06b98143f3453b81f3c396241a01c6c4cff84c1a77bf0c75b18bd603018506` |
| `IBMPlexSans-Regular-Latin1.woff2` | `IBM-Plex-Sans/fonts/split/woff2/IBMPlexSans-Regular-Latin1.woff2` | 20984 | `b5ad7bd39f996144915f0ad9849a90183b27d8c28ad97ed98af5b1bebc51f6b1` |
| `IBMPlexSans-SemiBold-Latin1.woff2` | `IBM-Plex-Sans/fonts/split/woff2/IBMPlexSans-SemiBold-Latin1.woff2` | 22260 | `fff0ab3a88b0b4aa0b693e4f0201359a15183b08e3fa5696d1918d8f0ade8ad5` |
| `IBMPlexSerif-Regular-Latin1.woff2` | `IBM-Plex-Serif/fonts/split/woff2/IBMPlexSerif-Regular-Latin1.woff2` | 22680 | `6ebe5b7a2bbe864712e0d87a785a77ebde8a58d940d6163c1f03c6ffab1cd9a9` |
| `IBMPlexSerif-SemiBold-Latin1.woff2` | `IBM-Plex-Serif/fonts/split/woff2/IBMPlexSerif-SemiBold-Latin1.woff2` | 23756 | `1d34d4612be8d2f06a25858a8bc3c3c3b5c4ec0ee1285501c3a4df2ddace7afa` |
```

Update `DESIGN.md` with the same upstream tag and the result: all six declared
faces total 129,872 bytes, down from 384,756 bytes. The four homepage faces
total 84,268 bytes before HTTP overhead, down from about 250 KB transferred.

Update the README check list with these two bullets:

```markdown
- every styled page discovers design tokens before component CSS, and every indexable page exposes the machine-readable index
- official self-hosted IBM Plex subsets retain their licence, hashes, visible-glyph coverage and byte budget
```

- [ ] **Step 8: Run focused, aggregate and binary integrity checks**

Run:

```powershell
python scripts/test_check_design.py
python scripts/check_design.py
python scripts/check_site.py
git diff --check
Get-ChildItem assets/fonts/*.woff2 | Measure-Object Length -Sum
```

Expected:

- all Python and Node checks pass
- `git diff --check` prints nothing
- WOFF2 count is 6
- summed WOFF2 length is exactly 129872
- no old full-font filename remains in `assets/tokens.css` or
  `scripts/design_baseline.json`

Confirm the last point with:

```powershell
rg -n 'IBMPlex(Mono|Sans|Serif)-(Regular|Italic|SemiBold)\.woff2' assets scripts
```

Expected: no matches.

- [ ] **Step 9: Commit the font-delivery unit**

Run:

```powershell
git add -- assets/fonts assets/tokens.css scripts/check_design.py scripts/test_check_design.py scripts/design_baseline.json DESIGN.md README.md
git commit -m "perf: serve official IBM Plex Latin1 subsets"
```

Expected: one commit containing the six verified binaries, provenance,
delivery checks and documentation.

---

### Task 4: Verify the local site and quantify the improvement

**Files:**

- Inspect: all files changed since `adb31c6`
- Create outside the repository:
  `C:\Users\-\Documents\Codex\2026-08-28\goal-duguid-com-au-no-longer\work\performance-results.json`
- Create detached baseline worktree:
  `C:\Users\-\Documents\Codex\2026-08-28\goal-duguid-com-au-no-longer\scratch\duguid-baseline-site`
- Create browser recording:
  `C:\Users\-\.config\browser-harness\agent-workspace\recordings\duguid-oled-local`

**Interfaces:**

- Consumes: candidate site at `http://127.0.0.1:8000/` and baseline commit
  `adb31c6` at `http://127.0.0.1:8001/` through the same local server.
- Produces: three cold-cache runs per site for transfer, FCP, LCP and CLS using
  one fixed throttle profile.
- Produces: browser evidence for 320, 390, 768 and 1440 CSS pixel layouts,
  reduced motion and failed-font/image fallbacks.

- [ ] **Step 1: Run the complete clean-tree verification set**

Run:

```powershell
python scripts/check_site.py
git diff --check
git status --short
git diff --stat adb31c6..HEAD
git diff adb31c6..HEAD -- llms.txt robots.txt sitemap.xml assets/levy.mjs
```

Expected:

- the aggregate reports `site checks passed`
- whitespace check prints nothing
- status is clean
- protected-file diff prints nothing
- the branch contains the three specification and planning commits plus the
  three focused implementation commits from Tasks 1 to 3

- [ ] **Step 2: Start identical candidate and baseline previews**

Create a detached, read-only baseline worktree at the exact approved source
commit, then serve both trees with the same Python server:

```powershell
$baselineTree = 'C:\Users\-\Documents\Codex\2026-08-28\goal-duguid-com-au-no-longer\scratch\duguid-baseline-site'
git worktree add --detach $baselineTree adb31c6
python -m http.server 8000 --bind 127.0.0.1
```

Keep that candidate server session open. Start a second terminal session with
working directory `$baselineTree`:

```powershell
python -m http.server 8001 --bind 127.0.0.1
```

Keep both exact session IDs. Confirm:

```powershell
@(
  (Invoke-WebRequest -Uri 'http://127.0.0.1:8000/' -UseBasicParsing).StatusCode,
  (Invoke-WebRequest -Uri 'http://127.0.0.1:8001/' -UseBasicParsing).StatusCode
)
```

Expected: `200`, `200`.

- [ ] **Step 3: Record the responsive and OLED browser matrix**

Use Browser Use and save the exact recording directory:

```powershell
@'
start_recording("duguid-oled-local", title="duguid.com.au OLED local verification")
new_tab("http://127.0.0.1:8000/")
wait_for_load()
cdp("Page.addScriptToEvaluateOnNewDocument", source="""
window.__pageErrors = [];
window.addEventListener('error', event => {
  window.__pageErrors.push(`error: ${event.message}`);
});
window.addEventListener('unhandledrejection', event => {
  window.__pageErrors.push(`rejection: ${String(event.reason)}`);
});
const originalConsoleError = console.error;
console.error = (...args) => {
  window.__pageErrors.push(`console: ${args.map(String).join(' ')}`);
  originalConsoleError(...args);
};
""")
for width, height in ((320, 720), (390, 844), (768, 1024), (1440, 1000)):
    cdp("Emulation.setDeviceMetricsOverride", width=width, height=height,
        deviceScaleFactor=2 if width <= 390 else 1, mobile=width <= 768)
    goto_url(f"http://127.0.0.1:8000/?viewport={width}")
    wait_for_load()
    print(js("""(() => {
      const body = getComputedStyle(document.body);
      const h1 = getComputedStyle(document.querySelector('h1'));
      const label = getComputedStyle(document.querySelector('.technical-label'));
      return {
        viewport: [innerWidth, innerHeight],
        overflow: document.documentElement.scrollWidth - innerWidth,
        canvas: body.backgroundColor,
        bodyFont: body.fontFamily,
        headingFont: h1.fontFamily,
        labelFont: label.fontFamily,
        navLabels: [...document.querySelectorAll('.site-nav a')].map(a => a.textContent.trim()),
        llmsLinks: document.querySelectorAll('a[href="/llms.txt"]').length,
        readyState: document.readyState,
        errors: window.__pageErrors
      };
    })()"""))

for route, path in (
    ("about", "/about/"),
    ("evidence", "/evidence/"),
    ("rate", "/rates/super-guarantee/"),
    ("tool", "/tools/company-tax-franking/"),
    ("calculator", "/tools/coal-lsl-levy/"),
    ("404", "/404.html"),
):
    for width, height in ((390, 844), (1440, 1000)):
        cdp("Emulation.setDeviceMetricsOverride", width=width, height=height,
            deviceScaleFactor=2 if width == 390 else 1, mobile=width == 390)
        goto_url(f"http://127.0.0.1:8000{path}?viewport={width}")
        wait_for_load()
        metrics = js("""(() => {
          const heading = document.querySelector('h1');
          return {
            overflow: document.documentElement.scrollWidth - innerWidth,
            canvas: getComputedStyle(document.body).backgroundColor,
            main: Boolean(document.querySelector('main')),
            heading: heading?.textContent.trim() ?? null,
            footerLinks: document.querySelectorAll('.site-footer__links a').length,
            errors: window.__pageErrors
          };
        })()""")
        print({"route": route, "width": width, **metrics})
stop_recording()
'@ | browser-use
```

Expected for every viewport:

- `overflow` is 0
- `canvas` is `rgb(0, 0, 0)`
- body, heading and label fonts report IBM Plex Sans, Serif and Mono
- all five shared navigation labels are present
- one visible machine-readable index link is present
- ready state is `complete`
- every representative page reports a main landmark, a heading and zero errors
- every representative page keeps the true-black canvas and zero overflow

Open the recording frames and inspect for clipped text, accidental grey page
bands, excessive raised surfaces, generic equal cards, missing rules or an
unbalanced first viewport.

- [ ] **Step 4: Verify reduced motion and fallback resilience**

Use the same local tab:

```powershell
@'
cdp("Emulation.setEmulatedMedia", features=[
    {"name": "prefers-reduced-motion", "value": "reduce"}
])
goto_url("http://127.0.0.1:8000/?mode=reduced")
wait_for_load()
print(js("""(() => ({
  motion: getComputedStyle(document.documentElement).getPropertyValue('--motion-fast').trim(),
  overflow: document.documentElement.scrollWidth - innerWidth
}))()"""))
cdp("Network.setCacheDisabled", cacheDisabled=True)
cdp("Network.setBlockedURLs", urls=["*assets/fonts/*", "*coal-lsl-calculator.webp*"])
goto_url("http://127.0.0.1:8000/?mode=fallback")
wait_for_load()
print(js("""(() => ({
  overflow: document.documentElement.scrollWidth - innerWidth,
  bodyText: document.body.innerText.length,
  proofAlt: document.querySelector('img[src*="coal-lsl-calculator"]')?.alt,
  footerLink: document.querySelector('a[href="/llms.txt"]')?.textContent.trim()
}))()"""))
cdp("Network.setBlockedURLs", urls=[])
cdp("Network.setCacheDisabled", cacheDisabled=False)
cdp("Emulation.setEmulatedMedia", features=[])
'@ | browser-use
```

Expected:

- reduced motion token is `0.01ms`
- fallback overflow is 0
- visible body text remains non-empty
- proof alt describes the Coal LSL result
- footer link text is `Machine-readable index`

- [ ] **Step 5: Exercise the calculator without changing its engine**

Open `http://127.0.0.1:8000/tools/coal-lsl-levy/` at 390 and 1440 CSS
pixels. Use the existing labelled controls to verify initial, invalid and valid
states, add and remove one employee, and export the CSV. Confirm the browser
console has no errors and that the same values pass through
`assets/levy-form.mjs` to the unchanged `assets/levy.mjs` engine.

Run the executable engine suite again after the interaction:

```powershell
node --test scripts/levy.test.mjs
```

Expected: all 21 tests pass.

- [ ] **Step 6: Run three matched cold-cache measurements per tree**

Use one fixed local profile for baseline and candidate. Capture the single JSON
array printed by Browser Use as the generated evidence file:

```powershell
$perfResults = 'C:\Users\-\Documents\Codex\2026-08-28\goal-duguid-com-au-no-longer\work\performance-results.json'
$perfProgram = @'
import json
import time
new_tab("http://127.0.0.1:8000/?perf=setup")
cdp("Network.enable")
cdp("Network.setCacheDisabled", cacheDisabled=True)
cdp("Network.emulateNetworkConditions", offline=False, latency=150,
    downloadThroughput=200000, uploadThroughput=75000,
    connectionType="cellular4g")
cdp("Emulation.setCPUThrottlingRate", rate=4)
cdp("Emulation.setDeviceMetricsOverride", width=390, height=844,
    deviceScaleFactor=2, mobile=True)
cdp("Page.addScriptToEvaluateOnNewDocument", source="""
window.__lcp = [];
window.__cls = 0;
new PerformanceObserver(list => {
  for (const entry of list.getEntries()) {
    window.__lcp.push({startTime: entry.startTime, size: entry.size});
  }
}).observe({type: 'largest-contentful-paint', buffered: true});
new PerformanceObserver(list => {
  for (const entry of list.getEntries()) {
    if (!entry.hadRecentInput) window.__cls += entry.value;
  }
}).observe({type: 'layout-shift', buffered: true});
""")
results = []
for site, base in (
    ("baseline", "http://127.0.0.1:8001/"),
    ("candidate", "http://127.0.0.1:8000/"),
):
    for run in (1, 2, 3):
        goto_url(f"{base}?perf={run}")
        wait_for_load()
        time.sleep(1)
        metrics = js("""(() => {
          const navigation = performance.getEntriesByType('navigation')[0];
          const resources = performance.getEntriesByType('resource');
          const paints = Object.fromEntries(
            performance.getEntriesByType('paint').map(p => [p.name, p.startTime])
          );
          return {
            transfer: navigation.transferSize + resources.reduce((n, r) => n + r.transferSize, 0),
            requestCount: 1 + resources.length,
            resources: resources.map((r, index) => ({
              order: index + 1,
              name: r.name,
              transfer: r.transferSize,
              initiator: r.initiatorType
            })),
            fcp: paints['first-contentful-paint'] ?? null,
            lcp: window.__lcp.at(-1)?.startTime ?? null,
            cls: window.__cls,
            proofLoadedInitially: resources.some(r => r.name.includes('coal-lsl-calculator.webp')),
            overflow: document.documentElement.scrollWidth - innerWidth
          };
        })()""")
        results.append({"site": site, "run": run, **metrics})
print("PERF_JSON=" + json.dumps(results, separators=(",", ":")))
'@
$perfOutput = @($perfProgram | browser-use)
$perfLine = $perfOutput | Where-Object { $_ -like 'PERF_JSON=*' } | Select-Object -Last 1
if ($null -eq $perfLine) {
  throw 'Browser measurement did not emit PERF_JSON.'
}
$jsonLine = $perfLine.Substring('PERF_JSON='.Length)
$jsonLine | ConvertFrom-Json | Out-Null
[IO.File]::WriteAllText($perfResults, $jsonLine + [Environment]::NewLine)
```

Read the six results and calculate medians:

```powershell
$results = Get-Content -LiteralPath $perfResults -Raw | ConvertFrom-Json
function Get-Median([double[]]$values) {
  $ordered = @($values | Sort-Object)
  return $ordered[[math]::Floor($ordered.Count / 2)]
}
if (@($results).Count -ne 6) {
  throw "Expected six performance runs, found $(@($results).Count)."
}
if (@($results | Where-Object { $null -eq $_.fcp -or $null -eq $_.lcp }).Count) {
  throw 'FCP or LCP was missing from at least one run.'
}
if (@($results | Where-Object { $_.cls -ne 0 -or $_.overflow -ne 0 }).Count) {
  throw 'A performance run had non-zero CLS or horizontal overflow.'
}
if (@($results | Where-Object { $_.site -eq 'candidate' -and $_.proofLoadedInitially }).Count) {
  throw 'The candidate loaded the deferred proof image in an initial run.'
}
$baselineTransfer = Get-Median @($results | Where-Object site -eq 'baseline' | ForEach-Object transfer)
$candidateTransfer = Get-Median @($results | Where-Object site -eq 'candidate' | ForEach-Object transfer)
$baselineLcp = Get-Median @($results | Where-Object site -eq 'baseline' | ForEach-Object lcp)
$candidateLcp = Get-Median @($results | Where-Object site -eq 'candidate' | ForEach-Object lcp)
$transferReduction = 1 - ($candidateTransfer / $baselineTransfer)
if ($transferReduction -lt 0.4) {
  throw "Transfer reduction was below 40 per cent: $transferReduction"
}
if ($candidateLcp -gt ($baselineLcp * 1.1)) {
  throw "Candidate median LCP regressed by more than 10 per cent."
}
[pscustomobject]@{
  BaselineTransfer = $baselineTransfer
  CandidateTransfer = $candidateTransfer
  TransferReduction = $transferReduction
  BaselineLcp = $baselineLcp
  CandidateLcp = $candidateLcp
}
```

Passing evidence requires:

- candidate median initial transfer at least 40 per cent below the matched
  local baseline median
- proof image absent from every candidate initial resource set
- CLS exactly 0 in every run
- overflow exactly 0 in every run
- candidate median LCP no more than 10 per cent slower than the matched local
  baseline median

If the LCP median regresses, do not add a speculative preload. First compare
the resource waterfall. Use the systematic-debugging workflow to identify
whether tokens, site CSS or the LCP font begins late, then run the same three
measurements after one isolated change.

- [ ] **Step 7: Run the design-taste preflight**

Inspect the recorded pages against this exact checklist:

```text
[ ] true-black canvas reaches every browser edge
[ ] near-black paper appears only where hierarchy needs it
[ ] one electric green accent, no second decorative accent
[ ] no gradients, glow, scanlines, noise or decorative animation
[ ] hero reads as one ceremonial statement, not a dashboard
[ ] Engage, Adopt and Verify remain one thought each
[ ] route labels do not overlap their content
[ ] no repeated generic card grid returns
[ ] IBM Plex Serif, Sans and Mono roles remain distinct
[ ] body copy stays at least 16 CSS pixels
[ ] focus is visible and body links remain underlined
[ ] rate tables and calculator remain usable at 320 CSS pixels
[ ] all disclaimer and refusal copy remains visible and exact
[ ] homepage, About, route copy and index blurbs still pass DESIGN.md's five copy principles
[ ] Machine-readable index is the only new visible sentence and is plain, factual and one-pass
```

Expected: every item is checked. A failed item is a design defect, not a note
to defer.

- [ ] **Step 8: Stop both previews and remove only the detached baseline**

Stop only the two exact HTTP server sessions started in Step 2. Verify the
baseline path and detached worktree state before removing it:

```powershell
$baselineTree = 'C:\Users\-\Documents\Codex\2026-08-28\goal-duguid-com-au-no-longer\scratch\duguid-baseline-site'
$resolvedBaseline = [IO.Path]::GetFullPath($baselineTree)
$approvedBaseline = [IO.Path]::GetFullPath('C:\Users\-\Documents\Codex\2026-08-28\goal-duguid-com-au-no-longer\scratch\duguid-baseline-site')
if ($resolvedBaseline -ne $approvedBaseline) {
  throw 'Baseline worktree path did not resolve to the approved scratch target.'
}
git -C $baselineTree status --short
git worktree remove $baselineTree
```

Expected: baseline status is clean and only that detached scratch worktree is
removed. Then run:

```powershell
git status --short
python scripts/check_site.py
```

Expected: candidate status is clean and the aggregate reports
`site checks passed`.

---

### Task 5: Review, publish, merge and prove production

**Files:**

- Inspect: branch diff from `origin/main`
- Inspect after merge: production `https://duguid.com.au/`, `/llms.txt`,
  `/robots.txt` and all three rate pages

**Interfaces:**

- Consumes: clean, verified branch and `work/performance-results.json`.
- Produces: one GitHub pull request, green hosted checks, one squash merge and
  a successful GitHub Pages deployment.
- Produces: exact production-source, factual-parity, visual and performance
  evidence.

- [ ] **Step 1: Fetch and reconcile current main without rewriting work**

Run:

```powershell
git fetch origin main
git log --oneline --left-right origin/main...HEAD
git diff --stat origin/main...HEAD
```

Expected: `origin/main` remains at the approved source line or contains only
changes that do not overlap this branch. If it advanced in an overlapping
file, stop and use the systematic-debugging or merge-conflict workflow before
publication. Do not force-push or reset.

- [ ] **Step 2: Perform a standards and spec self-review**

Read the complete diff:

```powershell
git diff --check origin/main...HEAD
git diff --name-status origin/main...HEAD
git diff origin/main...HEAD -- . ':(exclude)assets/fonts/*.woff2'
```

Verify each changed file against the approved spec and the repository's
documented standards. Confirm the two excluded files remain untouched:

```powershell
git diff --exit-code origin/main...HEAD -- tools/review-ready-gate/index.html google03d2012cc1791991.html
```

Expected: whitespace check and excluded-file diff both return 0 with no
output. No unrelated file appears in the name-status list.

- [ ] **Step 3: Re-run every release gate at the exact head**

Run:

```powershell
python scripts/check_site.py
git diff --check
git status --short
git rev-parse HEAD
```

Record the exact head SHA. Expected: all checks pass and the working tree is
clean.

- [ ] **Step 4: Write the pull request body from measured evidence**

Load the six measured results and calculate the four median values with the
same `Get-Median` function from Task 4. Build the pull request body in memory so
measured values cannot be left as template markers:

```powershell
$perfResults = 'C:\Users\-\Documents\Codex\2026-08-28\goal-duguid-com-au-no-longer\work\performance-results.json'
$results = Get-Content -LiteralPath $perfResults -Raw | ConvertFrom-Json
function Get-Median([double[]]$values) {
  $ordered = @($values | Sort-Object)
  return $ordered[[math]::Floor($ordered.Count / 2)]
}
$baselineTransfer = Get-Median @($results | Where-Object site -eq 'baseline' | ForEach-Object transfer)
$candidateTransfer = Get-Median @($results | Where-Object site -eq 'candidate' | ForEach-Object transfer)
$baselineLcp = Get-Median @($results | Where-Object site -eq 'baseline' | ForEach-Object lcp)
$candidateLcp = Get-Median @($results | Where-Object site -eq 'candidate' | ForEach-Object lcp)
$transferReductionPercent = [math]::Round((1 - ($candidateTransfer / $baselineTransfer)) * 100, 1)
$prBody = @"
## Summary

- make the public accounting register OLED-first with a true-black canvas and one electric-green evidence signal
- refine the existing register with Pliny's contrast, type hierarchy and ruled geometry without copying its identity
- expose the existing machine-readable index consistently while preserving the search-versus-training crawler split
- remove the serial CSS import, defer the below-fold proof image and replace full IBM Plex files with official v6.4.2 Latin1 subsets

## Verification

- python scripts/check_site.py
- git diff --check
- local browser matrix: 320, 390, 768 and 1440 CSS pixels
- reduced-motion, blocked-font and blocked-image fallbacks
- calculator initial, invalid, valid, employee and CSV workflows
- protected llms.txt, robots, sitemap, rate-main text, JSON-LD and disclaimers
- homepage, About, route copy and index blurbs pass the five DESIGN.md copy principles and ban list

## Design and copy

- Pliny is a supplementary aesthetic reference for true-black contrast, ceremonial type and fine register rules; the information architecture and IBM Plex identity remain duguid.com.au's own
- IBM Plex remains self-hosted under the bundled SIL Open Font License 1.1; SOURCES.md records the official tag, commit and six binary hashes
- visible copy is unchanged except for the factual Machine-readable index discovery label
- no sales funnel, intake form, mascot, generic call to action, invented claim or altered advice boundary was added

## Performance

- production baseline initial transfer: about 303 KB
- matched local baseline median transfer: $baselineTransfer bytes
- matched local candidate median transfer: $candidateTransfer bytes
- matched local transfer reduction: $transferReductionPercent per cent
- matched local baseline median LCP: $baselineLcp milliseconds
- matched local candidate median LCP: $candidateLcp milliseconds
- CLS: 0
- six-font source set: 384,756 bytes to 129,872 bytes
- four homepage faces: about 250 KB transferred to 84,268 source bytes before HTTP overhead

## Risks

- the shared token and component stylesheets affect every styled page; the responsive matrix covers representative home, article, rate, tool, calculator and 404 surfaces
- GitHub Pages controls response cache headers, so this change optimises asset discovery and bytes rather than cache duration
- llms.txt and structured data remain unchanged; GEO improves discoverability and visible answer structure without promising citation
"@
```

- [ ] **Step 5: Push the authorised branch and open the pull request**

Run:

```powershell
git push -u origin codex/duguid-oled-geo-performance
gh pr create --base main --head codex/duguid-oled-geo-performance `
  --title "Make duguid.com.au OLED-first and faster" `
  --body $prBody
```

Expected: GitHub returns one new pull request URL.

- [ ] **Step 6: Verify the hosted diff and checks at the exact head**

Run:

```powershell
gh pr view --json number,url,headRefOid,baseRefOid,mergeable,mergeStateStatus,statusCheckRollup
gh pr diff --name-only
gh pr checks --watch
```

Expected:

- `headRefOid` equals the SHA recorded in Step 3
- only the reviewed files appear
- mergeability is not conflicted
- every required check succeeds

Do not merge on a stale head or with a pending or failed required check.

- [ ] **Step 7: Squash-merge the reviewed pull request**

Run:

```powershell
gh pr merge --squash --delete-branch
```

Expected: the pull request reports merged. Fetch main and record the merge SHA:

```powershell
git fetch origin main
git log -1 --oneline origin/main
```

- [ ] **Step 8: Wait for GitHub Pages and repository checks**

Run:

```powershell
$mergeSha = (git rev-parse origin/main).Trim()
$mergeRuns = @(
  gh run list --branch main --limit 30 `
    --json databaseId,headSha,workflowName,status,conclusion,url |
    ConvertFrom-Json |
    Where-Object headSha -eq $mergeSha
)
$requiredWorkflows = @('checks', 'pages-build-deployment', 'CodeQL')
$missingWorkflows = @(
  $requiredWorkflows | Where-Object { $_ -notin $mergeRuns.workflowName }
)
if ($missingWorkflows.Count -gt 0) {
  throw "Merge runs are not visible yet: $($missingWorkflows -join ', ')"
}
foreach ($workflowName in $requiredWorkflows) {
  $run = $mergeRuns |
    Where-Object workflowName -eq $workflowName |
    Sort-Object databaseId -Descending |
    Select-Object -First 1
  gh run watch $run.databaseId --exit-status
  if ($LASTEXITCODE -ne 0) {
    throw "$workflowName failed for $mergeSha"
  }
}
```

If GitHub has not exposed all three exact-SHA runs yet, report the wait and
rerun this bounded step after the next update; do not substitute another branch
or older green run. Expected: Pages, site checks and CodeQL all complete
successfully for `$mergeSha`.

- [ ] **Step 9: Prove production source and factual parity**

Fetch with cache-busting query strings into a new scratch directory:

```powershell
$liveProof = 'C:\Users\-\Documents\Codex\2026-08-28\goal-duguid-com-au-no-longer\scratch\duguid-live-oled'
New-Item -ItemType Directory -Path $liveProof -Force | Out-Null
$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
Invoke-WebRequest "https://duguid.com.au/?verify=$stamp" -OutFile (Join-Path $liveProof 'index.html') -UseBasicParsing
Invoke-WebRequest "https://duguid.com.au/llms.txt?verify=$stamp" -OutFile (Join-Path $liveProof 'llms.txt') -UseBasicParsing
Invoke-WebRequest "https://duguid.com.au/robots.txt?verify=$stamp" -OutFile (Join-Path $liveProof 'robots.txt') -UseBasicParsing
Invoke-WebRequest "https://duguid.com.au/sitemap.xml?verify=$stamp" -OutFile (Join-Path $liveProof 'sitemap.xml') -UseBasicParsing
Invoke-WebRequest "https://duguid.com.au/rates/super-guarantee/?verify=$stamp" -OutFile (Join-Path $liveProof 'super.html') -UseBasicParsing
Invoke-WebRequest "https://duguid.com.au/rates/div7a-benchmark-rate/?verify=$stamp" -OutFile (Join-Path $liveProof 'div7a.html') -UseBasicParsing
Invoke-WebRequest "https://duguid.com.au/rates/cents-per-kilometre/?verify=$stamp" -OutFile (Join-Path $liveProof 'cents.html') -UseBasicParsing
```

Compare normalised production and merged source for the unchanged text files,
then use the executable semantic checker for local facts:

```powershell
Compare-Object `
  ([IO.File]::ReadAllText('index.html').Replace("`r`n", "`n")) `
  ([IO.File]::ReadAllText((Join-Path $liveProof 'index.html')).Replace("`r`n", "`n"))
Compare-Object `
  ([IO.File]::ReadAllText('llms.txt').Replace("`r`n", "`n")) `
  ([IO.File]::ReadAllText((Join-Path $liveProof 'llms.txt')).Replace("`r`n", "`n"))
Compare-Object `
  ([IO.File]::ReadAllText('robots.txt').Replace("`r`n", "`n")) `
  ([IO.File]::ReadAllText((Join-Path $liveProof 'robots.txt')).Replace("`r`n", "`n"))
Compare-Object `
  ([IO.File]::ReadAllText('sitemap.xml').Replace("`r`n", "`n")) `
  ([IO.File]::ReadAllText((Join-Path $liveProof 'sitemap.xml')).Replace("`r`n", "`n"))
python scripts/check_site.py
$env:DUGUID_LIVE_PROOF = $liveProof
@'
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path("scripts").resolve()))
import check_design

live_root = Path(os.environ["DUGUID_LIVE_PROOF"])
pairs = (
    (Path("rates/super-guarantee/index.html"), live_root / "super.html"),
    (Path("rates/div7a-benchmark-rate/index.html"), live_root / "div7a.html"),
    (Path("rates/cents-per-kilometre/index.html"), live_root / "cents.html"),
)
for local, live in pairs:
    assert check_design.main_visible_digest(local) == check_design.main_visible_digest(live), local
    assert check_design.json_ld_digests(local) == check_design.json_ld_digests(live), local
print("Live rate main text and JSON-LD match merged source.")
'@ | python -
```

Expected: all four comparisons print nothing, the local merged-source check
passes and the semantic comparison prints its success message.

- [ ] **Step 10: Verify production visually and measure it three times**

Repeat Task 4's responsive browser matrix and three-run performance script
against `https://duguid.com.au/?verify=$stamp`, using the numeric `$stamp`
created in Step 9. For the 404 surface, use the genuinely missing production
route `https://duguid.com.au/__codex-oled-404-$stamp` and assert its HTTP status
is 404 before inspecting its custom render. Save the recording as
`duguid-oled-production`.

Expected:

- production canvas, typography, navigation, route order and machine-index
  links match local
- no console error or horizontal overflow
- initial proof image remains deferred
- every font request resolves only to one of the six declared `-Latin1.woff2`
  files
- three-run median transfer remains materially below the 303 KB baseline
- CLS remains 0 and LCP does not regress beyond ordinary run variance

- [ ] **Step 11: Complete the release audit and handoff**

For each explicit goal requirement, record its authoritative evidence:

```text
distinct Pliny-inspired register: production desktop and mobile recordings
OLED-friendly: computed production canvas rgb(0, 0, 0) and contrast checker
fast and responsive: three-run production medians and four-width overflow matrix
GEO-optimised: production alternate and visible llms links plus crawler parity
copy passes five principles: completed DESIGN.md copy checklist and ban-list checker
fonts licensed and self-hosted: production local WOFF2 URLs, OFL and SOURCES hashes
facts unchanged: live llms, robots, rate-main and JSON-LD digest parity
disclaimers unchanged: protected-text checker and production inspection
PR opened and merged: pull request URL, exact reviewed head and merge SHA
live: successful Pages run and custom-domain source match
```

Only after every line has direct passing evidence, update the Agent Hub handoff,
release its claim and mark the active goal complete.
