# Proof-led Portfolio Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `ryanduguid.github.io` as the approved proof-led technical portfolio while preserving its routes, content contracts, structured data and Coal LSL calculation engine.

**Architecture:** Keep the site as hand-authored static HTML with one shared stylesheet. Add semantic shell and article contracts through repeated native markup, reshape the homepage into a four-layer system map, and change only the Coal LSL page controller around the protected `assets/levy.mjs` engine.

**Tech Stack:** HTML5, CSS custom properties and responsive CSS, browser-native JavaScript modules, Python standard-library validation scripts, Node's built-in test runner, Pillow for one WebP conversion.

**Spec:** `docs/superpowers/specs/2026-08-26-proof-led-portfolio-redesign-design.md`

## Global Constraints

- The approved source baseline is `825b5f601f814cfc30c64e6af796fe681e44852d`.
- Before Task 1, run `git fetch origin main` and verify `git rev-parse origin/main` is exactly the approved baseline. Stop and reconcile the spec and plan if it differs.
- Work only on local branch `codex/proof-led-portfolio-redesign`. Do not push, open a pull request or publish Pages.
- Preserve unrelated user changes. Start each task from a clean working tree.
- Do not add a framework, package manager, build step, third-party font, analytics service or runtime dependency.
- Do not add a light theme, contact form, client intake, engagement offer, tracking, testimonial, case study or new adoption claim.
- Do not change GitHub profile or repository content outside this site.
- Keep the dark palette exactly: `#04001F`, `#140E24`, `#1E1236`, `#2D184E`, `#5C2D91`, `#9F6FD8`, `#ECECEC`, `#B1AFAD`, `#4F485E`.
- Keep navigation labels exactly `About`, `Evidence`, `AI agents`, `GitHub`, `Awesome List`.
- Keep every public route, canonical, JSON-LD identity, sitemap entry, crawler rule, advice boundary and current source link.
- Preserve the direct aus-accounting-mcp PyPI route, version `0.1.5` metadata and stale-release-claim checks added at `825b5f6`.
- Keep `assets/levy.mjs` byte-for-byte unchanged.
- Use Australian English. Do not add em or en dashes. Do not reintroduce retired repository names.
- Do not change visible review dates or JSON-LD `dateModified` values for markup-only restyling. The homepage is already reviewed on 26 August 2026.
- Use no automatic animation. Respect `prefers-reduced-motion`.
- Keep all five navigation links available on mobile without JavaScript.

## Preflight Gate

- [ ] Run the remote and working-tree gate.

```powershell
git fetch origin main
git rev-parse origin/main
git merge-base --is-ancestor 825b5f601f814cfc30c64e6af796fe681e44852d HEAD
git status --short
```

Expected: `origin/main` prints `825b5f601f814cfc30c64e6af796fe681e44852d`, the merge-base command exits 0 and `git status --short` prints nothing.

- [ ] Run the approved baseline checks.

```powershell
node --test scripts/levy.test.mjs
python scripts/check_links.py
python scripts/check_seo.py
```

Expected: 20 levy tests pass, then both Python scripts finish with `all clear`.

## File Responsibility Map

| File or cohort | Responsibility after the redesign |
| --- | --- |
| `assets/site.css` | Tokens, base typography, shared shell, homepage, article, table, calculator, responsive and reduced-motion presentation |
| `index.html` | Hero, credentials, four-layer system map, install band, authentic proof artefact, principles, compact index and homepage JSON-LD |
| `about/index.html`, `evidence/index.html` | First-person authority and inspectable proof in the shared article pattern |
| `rates/*/index.html` | Shared article pattern plus accessible scroll regions around reference tables |
| Nine non-calculator `tools/*/index.html` pages | Shared article pattern while preserving install routes, worked examples, FAQs, sources and disclaimers |
| `tools/coal-lsl-levy/index.html` | Calculator presentation, accessible validation, result states, employee workflow and existing inline controller |
| `assets/levy.mjs` | Protected calculation engine, no changes |
| `assets/coal-lsl-calculator.webp` | Authentic synthetic calculator result used as the homepage proof image |
| `scripts/check_seo.py` | Existing search contracts plus stable semantic shell, homepage and calculator markup contracts |
| `README.md` | Accurate list of automated repository checks |

---

### Task 1: Define the semantic shell checker

**Files:**
- Modify: `scripts/check_seo.py:137-157`
- Modify: `scripts/check_seo.py:631-775`

**Interfaces:**
- Consumes: existing `visible_html(html: str) -> str` and `visible_text(html: str) -> str`
- Produces: `opening_tags(html: str, tag: str) -> list[str]`, `tag_attr(tag: str, name: str) -> str | None`, and `check_shared_shell(html: str, rel: str, failures: list[str]) -> None`
- The helper is self-tested in this task but is not wired into `check_file` until Task 2, so the current site remains green after this commit.

- [ ] **Step 1: Add reusable tag helpers and the fixed primary-navigation contract**

Add below `visible_text`:

```python
PRIMARY_NAV_LINKS = [
    ("/about/", "About"),
    ("/evidence/", "Evidence"),
    ("/tools/australian-tax-ai-agents/", "AI agents"),
    ("https://github.com/ryanduguid", "GitHub"),
    (
        "https://github.com/ryanduguid/awesome-australian-accounting-tech",
        "Awesome List",
    ),
]


def opening_tags(html: str, tag: str) -> list[str]:
    """Return rendered opening tags without script, style or template content."""
    return re.findall(rf"<{tag}\\b[^>]*>", visible_html(html), re.I)


def tag_attr(tag: str, name: str) -> str | None:
    """Read one quoted HTML attribute from an opening tag."""
    match = re.search(rf"\\b{re.escape(name)}\\s*=\\s*([\"'])(.*?)\\1", tag, re.I | re.S)
    return html_lib.unescape(match.group(2)).strip() if match else None
```

- [ ] **Step 2: Add the checker without calling it from `check_file`**

```python
def check_shared_shell(html: str, rel: str, failures: list[str]) -> None:
    """Require one skip target and the exact global primary navigation."""
    rendered = visible_html(html)
    mains = [tag for tag in opening_tags(rendered, "main") if tag_attr(tag, "id") == "main"]
    if len(mains) != 1:
        failures.append(f"{rel}: expected exactly one main#main, found {len(mains)}")

    skip_links = []
    for tag in opening_tags(rendered, "a"):
        classes = (tag_attr(tag, "class") or "").split()
        if "skip-link" in classes and tag_attr(tag, "href") == "#main":
            skip_links.append(tag)
    if len(skip_links) != 1:
        failures.append(
            f"{rel}: expected exactly one .skip-link targeting #main, found {len(skip_links)}"
        )

    primary_blocks = re.findall(
        r"<nav\\b(?=[^>]*\\baria-label\\s*=\\s*([\"'])Primary\\1)[^>]*>(.*?)</nav>",
        rendered,
        re.I | re.S,
    )
    if len(primary_blocks) != 1:
        failures.append(
            f"{rel}: expected exactly one nav labelled Primary, found {len(primary_blocks)}"
        )
        return

    links = []
    for tag, label in re.findall(r"(<a\\b[^>]*>)(.*?)</a>", primary_blocks[0][1], re.I | re.S):
        links.append((tag_attr(tag, "href"), visible_text(label)))
    if links != PRIMARY_NAV_LINKS:
        failures.append(f"{rel}: primary navigation is {links!r}, expected {PRIMARY_NAV_LINKS!r}")
```

- [ ] **Step 3: Add red and green self-check fixtures**

Add near the start of `_self_check` after the existing `meta` assertion:

```python
    valid_shell = """
    <a class="skip-link" href="#main">Skip to content</a>
    <header><nav aria-label="Primary">
      <a href="/about/">About</a><a href="/evidence/">Evidence</a>
      <a href="/tools/australian-tax-ai-agents/">AI agents</a>
      <a href="https://github.com/ryanduguid">GitHub</a>
      <a href="https://github.com/ryanduguid/awesome-australian-accounting-tech">Awesome List</a>
    </nav></header><main id="main"></main>
    """
    shell_failures: list[str] = []
    check_shared_shell(valid_shell, "self-check", shell_failures)
    assert shell_failures == []

    invalid_shell = valid_shell.replace("Awesome List", "Projects").replace(
        'id="main"', 'id="content"'
    )
    invalid_shell_failures: list[str] = []
    check_shared_shell(invalid_shell, "self-check", invalid_shell_failures)
    assert any("main#main" in failure for failure in invalid_shell_failures)
    assert any("primary navigation" in failure for failure in invalid_shell_failures)
```

- [ ] **Step 4: Run the checker and verify the helper tests pass**

Run: `python scripts/check_seo.py`

Expected: `self-check OK` and `all clear`. The live files are not checked for the new shell yet.

- [ ] **Step 5: Commit the tested checker helper**

```powershell
git add scripts/check_seo.py
git commit -m "test: define shared site shell contract"
```

---

### Task 2: Install the shared shell and CSS foundation

**Files:**
- Modify: `scripts/check_seo.py:513-589`
- Modify: `README.md:15-29`
- Replace: `assets/site.css:1-354`
- Modify body shell: `index.html:19-226`
- Modify body shell: `about/index.html:18-121`
- Modify body shell: `evidence/index.html:18-89`
- Modify body shell: all three `rates/*/index.html` files
- Modify body shell: all ten `tools/*/index.html` files
- Modify body shell: `404.html:12-23`

**Interfaces:**
- Consumes: `check_shared_shell` from Task 1
- Produces: `.skip-link`, `.site-shell`, `.site-header`, `.site-header__inner`, `.site-identity`, `.site-nav`, `.site-main`, `.site-footer`, `.site-footer__inner`, `.reading-shell`, `.visually-hidden`
- Later tasks may rely on those class names and must not redefine their responsibilities.

- [ ] **Step 1: Wire the semantic shell check into every indexable page**

In `check_file`, immediately inside `if indexed:` add:

```python
        check_shared_shell(html, rel, failures)
```

- [ ] **Step 2: Run the checker and confirm the current markup fails**

Run: `python scripts/check_seo.py`

Expected: failures for missing `main#main`, skip link and primary navigation on the 16 indexable pages.

- [ ] **Step 3: Replace the CSS foundation and shared shell rules**

Keep the approved tokens and start `assets/site.css` with this contract. Retain the current content rules from lines 24 to 177 and 191 to 354 so pages not yet restyled stay usable. Scope the old `header`, `header h1` and `header p.subtitle` selectors to `.container > header`; remove the old broad `footer` block at lines 178 to 190; and change the 404 centring selector from `body.page-404` to `.page-404 .site-main`. Keep the existing calculator rules scoped beneath `.page-calculator` until Task 7 replaces them.

```css
:root {
  --bg: #04001f;
  --surface: #140e24;
  --surface-2: #1e1236;
  --surface-3: #2d184e;
  --accent: #5c2d91;
  --accent-light: #9f6fd8;
  --text: #ececec;
  --text-muted: #b1afad;
  --border: #4f485e;
  --site-width: 1180px;
  --reading-width: 65ch;
  --control-radius: 8px;
  --frame-radius: 12px;
}

*, *::before, *::after { box-sizing: border-box; }
html { color-scheme: dark; scroll-behavior: smooth; }
body {
  margin: 0;
  color: var(--text);
  background: var(--bg);
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  line-height: 1.65;
}
img { display: block; max-width: 100%; }
a { color: var(--accent-light); text-decoration-thickness: 0.08em; text-underline-offset: 0.18em; }
a:hover { color: var(--text); }
:focus-visible { outline: 2px solid var(--accent-light); outline-offset: 3px; }
.skip-link { position: fixed; z-index: 100; top: 8px; left: 8px; padding: 10px 14px; background: var(--text); color: var(--bg); transform: translateY(-160%); }
.skip-link:focus { transform: translateY(0); }
.site-shell { width: min(var(--site-width), calc(100% - 48px)); margin-inline: auto; }
.reading-shell { width: min(var(--reading-width), 100%); }
.site-header { border-bottom: 1px solid var(--border); }
.site-header__inner { display: flex; min-height: 72px; align-items: center; justify-content: space-between; gap: 24px; }
.site-identity { color: var(--text); font-weight: 750; text-decoration: none; letter-spacing: -0.02em; }
.site-nav { display: flex; align-items: center; gap: 24px; white-space: nowrap; }
.site-nav a { min-height: 44px; display: inline-flex; align-items: center; color: var(--text-muted); }
.site-nav a[aria-current="page"], .site-nav a:hover { color: var(--text); }
.site-main { min-height: 60vh; }
.site-footer { border-top: 1px solid var(--border); color: var(--text-muted); }
.site-footer__inner { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 24px; padding-block: 32px; }
.site-footer__inner p { margin: 0; max-width: 72ch; }
.site-footer__links { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 12px 20px; }
.visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }

@media (max-width: 760px) {
  .site-shell { width: min(100% - 32px, var(--site-width)); }
  .site-header__inner { display: grid; padding-block: 12px; }
  .site-nav { overflow-x: auto; padding-bottom: 4px; }
  .site-footer__inner { grid-template-columns: 1fr; }
  .site-footer__links { justify-content: flex-start; }
}

@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; }
}
```

Use CSS property values `center` and `behavior` in source code even though prose uses Australian English. These are language-defined identifiers.

- [ ] **Step 4: Add the same header before `main` on every HTML page**

Use this exact shared markup. Add `aria-current="page"` only to About, Evidence or AI agents on its own page.

```html
<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
  <div class="site-shell site-header__inner">
    <a class="site-identity" href="/" aria-label="Ryan Duguid home">Ryan Duguid</a>
    <nav class="site-nav" aria-label="Primary">
      <a href="/about/">About</a>
      <a href="/evidence/">Evidence</a>
      <a href="/tools/australian-tax-ai-agents/">AI agents</a>
      <a href="https://github.com/ryanduguid">GitHub</a>
      <a href="https://github.com/ryanduguid/awesome-australian-accounting-tech">Awesome List</a>
    </nav>
  </div>
</header>
```

Replace each outer `<div class="container">` with `<main id="main" class="site-main"><div class="container">`, close the retained container, then close `main`. Do not change page copy, form controls or JSON-LD in this step.

- [ ] **Step 5: Add the shared footer after `main` on every page**

```html
<footer class="site-footer">
  <div class="site-shell site-footer__inner">
    <p>Nothing here is tax, legal or financial advice. Computational outputs are review aids for a qualified professional, not compliance determinations, and lodgement decisions stay with a human.</p>
    <div class="site-footer__links">
      <a href="/about/">About Ryan Duguid</a>
      <a href="https://github.com/ryanduguid">github.com/ryanduguid</a>
    </div>
  </div>
</footer>
```

On the homepage, move the existing footer's advice text and links into this shared footer and remove the duplicate old footer. Keep the existing homepage review date immediately before the end of `main`. On inner pages, keep their page-specific `page-meta` and byline at the end of their content.

- [ ] **Step 6: Update the pages in reviewable cohorts**

Apply Steps 4 and 5 in this order, running `python scripts/check_seo.py` after each cohort to reduce the failure count:

1. `index.html`, `about/index.html`, `evidence/index.html`, `404.html`
2. `rates/super-guarantee/index.html`, `rates/div7a-benchmark-rate/index.html`, `rates/cents-per-kilometre/index.html`
3. all ten `tools/*/index.html` files

Expected after the final cohort: `all clear`.

- [ ] **Step 7: Document the new repository check**

Add this bullet under `README.md` Checks:

```markdown
- every indexable page has one `main#main`, one skip link and the exact shared primary navigation
```

- [ ] **Step 8: Run the complete structural checks**

```powershell
python scripts/check_seo.py
python scripts/check_links.py
```

Expected: both end with `all clear`.

- [ ] **Step 9: Commit the shared shell**

```powershell
git add README.md scripts/check_seo.py assets/site.css index.html 404.html about evidence rates tools
git commit -m "feat: add semantic site shell"
```

---

### Task 3: Rebuild the homepage around the four-layer system

**Files:**
- Modify: `scripts/check_seo.py:137-180`
- Modify: `scripts/check_seo.py:513-589`
- Modify: `scripts/check_seo.py:631-775`
- Replace body content: `index.html:19-226`
- Modify homepage rules: `assets/site.css`
- Create: `assets/coal-lsl-calculator.webp`

**Interfaces:**
- Consumes: Task 2 shell classes and the current homepage JSON-LD
- Produces: `.home`, `.home-hero`, `.home-hero__copy`, `.home-proof-rail`, `.credential-band`, `.system-map`, `.system-layer`, `.install-band`, `.proof-feature`, `.principles-list`, `.more-index`
- Produces stable content checker `check_homepage_contract(html: str, failures: list[str]) -> None`

- [ ] **Step 1: Write the failing homepage content contract**

Add:

```python
HOMEPAGE_REQUIRED_TEXT = [
    "I build accounting systems that can show their work.",
    "Data and Ledgers",
    "Rules and Engines",
    "Agent Workflows",
    "Review Controls",
    "Install in 2 commands",
    "Proof belongs beside the claim",
]
HOMEPAGE_REQUIRED_HREFS = [
    "/evidence/",
    "/tools/australian-tax-ai-agents/",
    "/tools/coal-lsl-levy/",
]


def check_homepage_contract(html: str, failures: list[str]) -> None:
    text = visible_text(html)
    for required in HOMEPAGE_REQUIRED_TEXT:
        if required not in text:
            failures.append(f"index.html: missing approved homepage text {required!r}")
    rendered = visible_html(html)
    hrefs = [tag_attr(tag, "href") for tag in opening_tags(rendered, "a")]
    for href in HOMEPAGE_REQUIRED_HREFS:
        if href not in hrefs:
            failures.append(f"index.html: missing visible homepage route {href}")
```

Call it in `check_file` after the indexed-page checks:

```python
    if rel == "index.html":
        check_homepage_contract(html, failures)
```

Add a `_self_check` fixture containing every required string and link, then assert no failures. Make a second fixture with the hero sentence removed and assert the missing-text failure appears.

- [ ] **Step 2: Run the contract and verify the current homepage fails**

Run: `python scripts/check_seo.py`

Expected: `index.html` fails for the approved hero and proof-section copy.

- [ ] **Step 3: Replace the homepage content hierarchy**

Inside the Task 2 shell, use this order:

```html
<main id="main" class="site-main home">
  <section class="home-hero site-shell" aria-labelledby="home-title"></section>
  <section class="credential-band" aria-label="Credentials"></section>
  <section class="system-section site-shell" aria-labelledby="system-title"></section>
  <section class="install-band site-shell" aria-labelledby="install-title"></section>
  <section class="proof-feature" aria-labelledby="proof-title"></section>
  <section class="principles-section site-shell" aria-labelledby="principles-title"></section>
  <nav class="more-index site-shell" aria-labelledby="more-title"></nav>
  <p class="page-meta site-shell">Last reviewed 26 August 2026.</p>
</main>
```

Hero copy and actions must be exact:

```html
<p class="technical-label">Australian computational accounting</p>
<h1 id="home-title">I build accounting systems that can show their work.</h1>
<p class="home-hero__summary">Open-source tools grounded in Australian rules, exact currency arithmetic and human review.</p>
<div class="home-actions">
  <a class="button" href="/evidence/">Evidence</a>
  <a class="button button--secondary" href="/tools/australian-tax-ai-agents/">AI agents</a>
</div>
```

The adjacent proof rail uses `Primary sources`, `Exact currency arithmetic` and `Human review`. The credentials band uses the current three facts without badge pills.

- [ ] **Step 4: Consolidate the current cards into four system bands**

Move the existing repository names, descriptions and links unchanged into these exact groups:

1. Data and Ledgers: `xero-trial-balance-export`, `accounting-excel-toolkit`
2. Rules and Engines: `Ozzit`, `TheExchequerTally`, `SolomonsSword`, `payday-super-checker`, `ato-benchmark-compare`, `TheWIPTally`
3. Agent Workflows: `au-tax-mcp-server`, `australian-accounting-skills`, `hardhat-ledger`, `DrDebits`, `xero-ai-review-gateway`
4. Review Controls: `review-ready-gate`, `monthly-close-control-plane`

Use one `article.system-layer` per group with a layer label, an unstyled list of project entries and a concise proof label. Use desktop left insets of 0, 24, 48 and 72 pixels; remove all insets below 900 pixels. Remove the old `.tools-list`, `.tool-card`, `.stack`, `.stack-col` and `.repo-card` markup only after every existing route and description is represented in the new structure.

Keep all ten ItemList tool routes visible. The Coal LSL route belongs in the proof feature, not the repository bands.

- [ ] **Step 5: Retain the install, principles and More content in the approved positions**

Move the current two-command block after the system map without changing either command. Present the four current principles as divided columns, not cards. Move all current More links into the `more-index` navigation and retain their exact targets.

- [ ] **Step 6: Capture and optimise the authentic calculator artefact**

Serve the current working tree, open the local Coal LSL calculator, choose base rate, enter the synthetic values `10000` base rate, `2500` overtime, `500` allowances and `0` salary sacrifice, then calculate. Capture a focused PNG of the form and explained result outside the repository at `../coal-lsl-calculator-source.png`.

Convert it without adding a dependency:

```powershell
python -c "from PIL import Image; im=Image.open('../coal-lsl-calculator-source.png'); im.thumbnail((1600, 1200)); im.save('assets/coal-lsl-calculator.webp', 'WEBP', quality=82, method=6)"
python -c "from pathlib import Path; p=Path('assets/coal-lsl-calculator.webp'); assert p.stat().st_size <= 300000, p.stat().st_size; print(p.stat().st_size)"
python -c "from PIL import Image; im=Image.open('assets/coal-lsl-calculator.webp'); print(f'width={im.width} height={im.height}')"
```

Use this text with the image:

```html
<figure>
  <img src="/assets/coal-lsl-calculator.webp" alt="Coal LSL levy calculator showing synthetic monthly inputs and an explained levy result" />
  <figcaption>Synthetic example. The calculator shows the applied branch and formula before professional review.</figcaption>
</figure>
```

Add `width` and `height` attributes from the dimension command before committing.

- [ ] **Step 7: Add homepage CSS without recreating the card catalogue**

Implement the approved 1180-pixel shell, two-column hero, divided credential band, four system bands, two-column proof feature, four divided principles and compact More index. Use only the approved radii and palette. The hero top padding must be no more than 96 pixels, and the design must show the hero and credentials within 900 CSS pixels of height.

- [ ] **Step 8: Run homepage contracts and full repository checks**

```powershell
python scripts/check_seo.py
python scripts/check_links.py
node --test scripts/levy.test.mjs
```

Expected: all checks pass and the engine still reports 20 passing tests.

- [ ] **Step 9: Commit the homepage and authentic artefact**

```powershell
git add index.html assets/site.css assets/coal-lsl-calculator.webp scripts/check_seo.py
git commit -m "feat: rebuild homepage around accountable system layers"
```

---

### Task 4: Apply the article pattern to About and Evidence

**Files:**
- Modify: `scripts/check_seo.py`
- Modify: `about/index.html:18-121`
- Modify: `evidence/index.html:18-89`
- Modify: `assets/site.css`

**Interfaces:**
- Consumes: shared shell from Task 2
- Produces: `.article`, `.article-header`, `.article-layout`, `.article-toc`, `.article-body`, `.lead-note`, `.facts`, `.evidence-list`, `.evidence-row`, `.provenance-row`
- Produces: `check_article_pattern(html: str, rel: str, failures: list[str]) -> None` and initial `ARTICLE_PATTERN_PAGES`

- [ ] **Step 1: Write the failing article-pattern contract**

Add:

```python
ARTICLE_PATTERN_PAGES = {"about/index.html", "evidence/index.html"}


def check_article_pattern(html: str, rel: str, failures: list[str]) -> None:
    rendered = visible_html(html)
    if len(opening_tags(rendered, "article")) != 1:
        failures.append(f"{rel}: expected exactly one article element")
    toc_blocks = re.findall(
        r"<nav\\b(?=[^>]*\\baria-label\\s*=\\s*([\"'])On this page\\1)[^>]*>(.*?)</nav>",
        rendered,
        re.I | re.S,
    )
    if len(toc_blocks) != 1:
        failures.append(f"{rel}: expected exactly one On this page navigation")
        return
    ids = set(re.findall(r"\\bid\\s*=\\s*([\"'])(.*?)\\1", rendered, re.I | re.S))
    target_ids = {value for _, value in ids}
    for tag in opening_tags(toc_blocks[0][1], "a"):
        href = tag_attr(tag, "href") or ""
        if not href.startswith("#") or href[1:] not in target_ids:
            failures.append(f"{rel}: local contents target does not exist: {href}")
```

Call it from `check_file` when `rel in ARTICLE_PATTERN_PAGES`. Add a valid self-check fixture with one article and an `On this page` navigation targeting two heading IDs.

- [ ] **Step 2: Run the checker and confirm both pages fail**

Run: `python scripts/check_seo.py`

Expected: About and Evidence fail for missing article and local contents structures.

- [ ] **Step 3: Recompose About without changing facts or first-person copy**

Use:

```html
<main id="main" class="site-main">
  <article class="article">
    <header class="article-header site-shell"></header>
    <div class="article-layout site-shell">
      <nav class="article-toc" aria-label="On this page"></nav>
      <div class="article-body"></div>
    </div>
  </article>
</main>
```

Keep the current short answer in the header. Add IDs and contents links for `facts`, `what-i-build`, `authored-software`, `grounding`, `not-client-work` and `citing`. Keep the existing facts as a semantic table. Preserve the current single Person JSON-LD record and every fact, source, no-client-work statement, page meta and byline.

- [ ] **Step 4: Recompose Evidence around inspectable proof rows**

Use the same article shell. Add IDs and contents links for `evidence-model`, `public-proof`, `limits` and `sources`. Keep every current proof link and limitation. Present public proof entries as divided rows with factual type and date metadata; do not turn them into equal cards or decorative badges.

- [ ] **Step 5: Add the shared article CSS**

Use a 65-character article body, a narrow local-contents rail on wide screens and a one-column layout below 860 pixels. The local contents must sit above the article on mobile. Body links remain underlined. The facts table and evidence rows use dividers, not rounded containers.

- [ ] **Step 6: Run semantic, identity and link checks**

```powershell
python scripts/check_seo.py
python scripts/check_links.py
```

Expected: `all clear`, including the exact Person and evidence invariants.

- [ ] **Step 7: Commit About and Evidence**

```powershell
git add about/index.html evidence/index.html assets/site.css scripts/check_seo.py
git commit -m "feat: add proof-led article pages"
```

---

### Task 5: Restyle the three rate-reference pages

**Files:**
- Modify: `scripts/check_seo.py`
- Modify: `rates/super-guarantee/index.html:18-209`
- Modify: `rates/div7a-benchmark-rate/index.html:18-230`
- Modify: `rates/cents-per-kilometre/index.html:18-222`
- Modify: `assets/site.css`

**Interfaces:**
- Consumes: article pattern from Task 4
- Extends: `ARTICLE_PATTERN_PAGES` with all three rate paths
- Produces accessible table regions with `role="region"`, an accurate `aria-label` and `tabindex="0"`

- [ ] **Step 1: Extend the failing article and table-region contracts**

Add all rate paths to `ARTICLE_PATTERN_PAGES`. Add:

```python
RATE_PAGES = {
    "rates/super-guarantee/index.html",
    "rates/div7a-benchmark-rate/index.html",
    "rates/cents-per-kilometre/index.html",
}


def check_rate_table_region(html: str, rel: str, failures: list[str]) -> None:
    rendered = visible_html(html)
    regions = re.findall(
        r"<div\\b(?=[^>]*\\brole\\s*=\\s*([\"'])region\\1)"
        r"(?=[^>]*\\baria-label\\s*=\\s*([\"']).+?\\2)"
        r"(?=[^>]*\\btabindex\\s*=\\s*([\"'])0\\3)[^>]*>.*?<table\\b",
        rendered,
        re.I | re.S,
    )
    if not regions:
        failures.append(f"{rel}: reference table is not inside a labelled keyboard-scroll region")
```

Call it when `rel in RATE_PAGES`.

- [ ] **Step 2: Run the checker and verify all three rate pages fail**

Run: `python scripts/check_seo.py`

Expected: article-pattern and table-region failures for the three rate pages.

- [ ] **Step 3: Apply the article shell and local contents to each rate page**

Keep each short answer first, keep every rate row and CSV link, and add useful IDs to the existing major headings. Use the same `article-header`, `article-layout`, `article-toc` and `article-body` contract as Task 4.

- [ ] **Step 4: Wrap each reference table in a labelled scroll region**

Use page-specific labels:

```html
<div class="table-scroll" role="region" aria-label="Super guarantee rate history" tabindex="0">
  <table></table>
</div>
```

Use `Division 7A benchmark rate history` and `Cents per kilometre rate history` on the other two pages. Do not change table headers, values or row order.

- [ ] **Step 5: Add responsive table CSS**

`.table-scroll` uses `overflow-x: auto`, a visible focus ring and a minimum table width only where columns need it. It must not cause body overflow at 390 CSS pixels.

- [ ] **Step 6: Run the repository checks**

```powershell
python scripts/check_seo.py
python scripts/check_links.py
```

Expected: both finish with `all clear`.

- [ ] **Step 7: Commit the reference-page cohort**

```powershell
git add rates assets/site.css scripts/check_seo.py
git commit -m "feat: add accessible rate reference pages"
```

---

### Task 6: Restyle the nine non-calculator tool pages

**Files:**
- Modify: `scripts/check_seo.py`
- Modify: `tools/ato-benchmarks/index.html:18-209`
- Modify: `tools/australian-tax-ai-agents/index.html:18-289`
- Modify: `tools/company-tax-franking/index.html:18-199`
- Modify: `tools/payday-super/index.html:18-260`
- Modify: `tools/review-ready-gate/index.html:18-180`
- Modify: `tools/subcontractor-ledgers/index.html:18-207`
- Modify: `tools/trust-distributions/index.html:18-209`
- Modify: `tools/wip-schedule/index.html:18-219`
- Modify: `tools/xero-trial-balance/index.html:18-240`
- Modify: `assets/site.css`

**Interfaces:**
- Consumes: article pattern, table regions, shared code and source styles
- Extends: `ARTICLE_PATTERN_PAGES` with the nine listed tool paths
- Preserves: direct PyPI and GitHub install routes, worked examples, FAQ visibility, sources, related links, review dates and JSON-LD

- [ ] **Step 1: Extend the article contract to the nine tool pages**

Add the nine exact paths above to `ARTICLE_PATTERN_PAGES`.

- [ ] **Step 2: Run the checker and confirm only this cohort fails its new contract**

Run: `python scripts/check_seo.py`

Expected: article-pattern failures on the nine non-calculator tool pages; existing PyPI, worked-example and identity checks remain green.

- [ ] **Step 3: Apply the article shell without rewriting the domain content**

For each page:

1. Keep the current short answer in `article-header`.
2. Add local contents links for its existing major headings.
3. Move the existing sections into `article-body` in their current order.
4. Keep install commands in semantic `pre > code` blocks.
5. Keep tables as tables and wrap only wide tables in a labelled keyboard-scroll region.
6. Keep FAQ, sources, related links, page meta and byline visible.
7. Leave JSON-LD text and IDs unchanged except for no-op indentation caused by moving the script.

- [ ] **Step 4: Protect the current aus-accounting-mcp publication facts**

On `tools/australian-tax-ai-agents/index.html`, retain both visible commands:

```text
claude mcp add aus-accounting -- uvx --from \
  git+https://github.com/ryanduguid/au-tax-mcp-server aus-accounting-mcp
claude mcp add aus-accounting -- uvx aus-accounting-mcp
```

Retain the visible `https://pypi.org/project/aus-accounting-mcp/` link, version `0.1.5`, the current direct-PyPI FAQ answer and the existing checker self-tests.

- [ ] **Step 5: Finish shared article component CSS**

Style answer blocks, install panels, blockquotes, FAQ groups, sources, related links and provenance with typography and dividers. Do not create a repeated rounded card around each section. Keep code horizontally scrollable and readable at 390 CSS pixels.

- [ ] **Step 6: Run all content contracts**

```powershell
python scripts/check_seo.py
python scripts/check_links.py
```

Expected: `all clear`, including direct PyPI, FAQ visibility and worked-example checks.

- [ ] **Step 7: Commit the tool-article cohort**

```powershell
git add tools/ato-benchmarks tools/australian-tax-ai-agents tools/company-tax-franking tools/payday-super tools/review-ready-gate tools/subcontractor-ledgers tools/trust-distributions tools/wip-schedule tools/xero-trial-balance assets/site.css scripts/check_seo.py
git commit -m "feat: unify tool article presentation"
```

---

### Task 7: Recompose the Coal LSL calculator workspace

**Files:**
- Modify: `scripts/check_seo.py`
- Modify markup: `tools/coal-lsl-levy/index.html:18-260`
- Modify controller: `tools/coal-lsl-levy/index.html:263-484`
- Preserve JSON-LD: `tools/coal-lsl-levy/index.html:486-617`
- Modify calculator rules: `assets/site.css`
- Test without modification: `assets/levy.mjs`, `scripts/levy.test.mjs`

**Interfaces:**
- Consumes: protected imports from `/assets/levy.mjs` and shared shell classes
- Produces: `.calculator-header`, `.calculator-workspace`, `.calculator-form`, `.calculator-result`, `.calculator-empty`, `.field-error`, `.employee-section`, `.legal-content`
- Produces: `check_calculator_contract(html: str, failures: list[str]) -> None`
- Preserves: all field IDs and names, branch values, computation inputs and outputs, employee insertion order and CSV columns

- [ ] **Step 1: Write the failing calculator markup contract**

Add:

```python
CALCULATOR_REL = "tools/coal-lsl-levy/index.html"
CALCULATOR_MARKERS = [
    'name="branch"',
    'id="branch-fields"',
    'id="sacrificed"',
    'id="bonus-rows"',
    'type="submit"',
]
CALCULATOR_REQUIRED_IDS = {
    "calc-form",
    "branch-fields",
    "sacrificed",
    "bonus-rows",
    "add-bonus",
    "result",
    "employeeLabel",
    "add-employee",
    "employee-table",
    "employee-rows",
    "employee-total-wages",
    "employee-total-levy",
    "export-csv",
    "fields-baseRate",
    "baseRate",
    "overtime",
    "allowances",
    "fields-annual",
    "annualSalary",
    "fields-casual",
    "reportingMonth",
    "instrumentSpecifiesLoading",
    "loadingQuantifiable",
    "casualBasePay",
    "casualLoading",
    "ordinaryPay",
    "bonus-row-template",
}


def check_calculator_contract(html: str, failures: list[str]) -> None:
    positions = [html.find(marker) for marker in CALCULATOR_MARKERS]
    if any(position < 0 for position in positions) or positions != sorted(positions):
        failures.append(
            f"{CALCULATOR_REL}: calculator markers missing or out of order: {positions}"
        )

    ids = {
        value
        for _, value in re.findall(r"\\bid\\s*=\\s*([\"'])(.*?)\\1", html, re.I | re.S)
    }
    missing_ids = sorted(CALCULATOR_REQUIRED_IDS - ids)
    if missing_ids:
        failures.append(f"{CALCULATOR_REL}: missing protected field IDs: {missing_ids}")
    for value in ("baseRate", "annual", "casual"):
        if not re.search(
            rf'<input\\b(?=[^>]*\\bname="branch")(?=[^>]*\\bvalue="{value}")',
            html,
            re.I,
        ):
            failures.append(f"{CALCULATOR_REL}: missing protected branch value {value}")

    result_tags = [tag for tag in opening_tags(html, "div") if tag_attr(tag, "id") == "result"]
    if len(result_tags) != 1:
        failures.append(f"{CALCULATOR_REL}: expected one #result region")
    else:
        result_tag = result_tags[0]
        if tag_attr(result_tag, "role") != "status" or tag_attr(result_tag, "aria-live") != "polite":
            failures.append(f"{CALCULATOR_REL}: #result must be a polite status region")

    result_position = html.find('id="result"')
    employee_position = html.find('id="employeeLabel"')
    disclaimer_position = html.find('id="disclaimer"')
    if not 0 <= result_position < employee_position < disclaimer_position:
        failures.append(
            f"{CALCULATOR_REL}: result, employee workflow and disclaimer are out of order"
        )

    if "from '/assets/levy.mjs'" not in html:
        failures.append(f"{CALCULATOR_REL}: protected levy engine import changed")
```

Call it when `rel == CALCULATOR_REL`. Add a compact green self-check fixture with markers in order, a polite result region, employee input before disclaimer and the exact engine import.

- [ ] **Step 2: Run the checker and confirm the current page fails**

Run: `python scripts/check_seo.py`

Expected: failures because `#result` is not a polite status region and Employees currently follows the disclaimer.

- [ ] **Step 3: Recompose calculator markup without changing field contracts**

Use:

```html
<main id="main" class="site-main">
  <header class="calculator-header site-shell"></header>
  <div class="calculator-workspace site-shell">
    <form id="calc-form" class="calculator-form" novalidate></form>
    <section class="calculator-result" aria-labelledby="result-title">
      <h2 id="result-title">Result</h2>
      <div id="result" role="status" aria-live="polite" aria-atomic="false">
        <div class="calculator-empty">
          <strong>Ready to calculate</strong>
          <p>Enter this month's figures. The applied branch, formula and explanation will appear here.</p>
        </div>
      </div>
    </section>
  </div>
  <section class="employee-section site-shell" aria-labelledby="employees-title"></section>
  <article id="disclaimer" class="legal-content site-shell"></article>
</main>
```

Keep the current payment-branch, dynamic branch fields, salary sacrifice and bonus sequence. Keep all current `id`, `name`, `value`, `min`, `step` and `required` attributes. Move the existing employee section before the existing disclaimer content without changing table column order.

- [ ] **Step 4: Add deterministic inline validation helpers**

Add these helpers after the DOM element constants. They affect presentation only:

```javascript
      let generatedFieldId = 0;

      function ensureControlId(control) {
        if (!control.id) {
          generatedFieldId += 1;
          control.id = `calculator-field-${generatedFieldId}`;
        }
        return control.id;
      }

      function describedByTokens(control) {
        return new Set((control.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
      }

      function clearFieldError(control) {
        const id = `${ensureControlId(control)}-error`;
        document.getElementById(id)?.remove();
        control.removeAttribute('aria-invalid');
        const tokens = describedByTokens(control);
        tokens.delete(id);
        if (tokens.size) control.setAttribute('aria-describedby', [...tokens].join(' '));
        else control.removeAttribute('aria-describedby');
      }

      function showFieldError(control) {
        clearFieldError(control);
        const id = `${ensureControlId(control)}-error`;
        const message = document.createElement('p');
        message.id = id;
        message.className = 'field-error';
        message.setAttribute('role', 'alert');
        message.textContent = control.validationMessage;
        const anchor = control.closest('label') || control;
        anchor.insertAdjacentElement('afterend', message);
        control.setAttribute('aria-invalid', 'true');
        const tokens = describedByTokens(control);
        tokens.add(id);
        control.setAttribute('aria-describedby', [...tokens].join(' '));
      }

      function validateForm() {
        const invalid = [...calcForm.elements].find(
          (control) => control.willValidate && !control.validity.valid
        );
        if (!invalid) return true;
        showFieldError(invalid);
        invalid.focus();
        return false;
      }

      calcForm.addEventListener('input', (event) => {
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) {
          clearFieldError(event.target);
        }
      });
```

Change both calculation entry points to call `validateForm()` before `compute(calcForm)`. Remove the current result-area error message from `add-employee`; invalid input now receives an inline field message and focus. Do not catch or reinterpret engine errors.

- [ ] **Step 5: Reorder result presentation without changing computed values**

Keep the existing `compute`, `explain`, `renderEmployees`, `escapeHtml`, `csvField` and export calculations. In `render`, keep every current label and value but replace the `rows` array so eligible wages lead, followed by levy, optional unrounded value, branch and formula comparison:

```javascript
        const rows = [
          ['Eligible wages', money(cents)],
          [`Levy at 2.7 per cent, as at ${LEVY_RATE_AS_AT}`, money(rounded)],
          ...(exact !== rounded ? [['Before rounding', `${(exact / 100).toFixed(4)} dollars`]] : []),
          ['Branch applied', `section ${result.branch}`],
          ...(result.branch === 's 3B(1)'
            ? [['Formula A', money(result.formulaA)], ['Formula B', money(result.formulaB)]]
            : []),
        ];
```

Keep the employee CSV columns unchanged. The submit path becomes:

```javascript
      calcForm.addEventListener('submit', (event) => {
        event.preventDefault();
        if (!validateForm()) return;
        render(compute(calcForm), resultEl);
      });
```

The add-employee path starts with:

```javascript
      document.getElementById('add-employee').addEventListener('click', () => {
        if (!validateForm()) return;
        const result = compute(calcForm);
```

Keep the remainder of that handler unchanged.

- [ ] **Step 6: Add calculator workspace and state CSS**

At widths above 900 pixels, use a two-column grid for form and result with a divider between them. Below 900 pixels, use one column in DOM order. Give every input, select and button a visible focus state and at least a 44-pixel control height. Use inline `.field-error` text, not a toast. The employee table scrolls inside a labelled region on narrow screens. No controls are sticky.

- [ ] **Step 7: Run logic and markup tests**

```powershell
node --test scripts/levy.test.mjs
python scripts/check_seo.py
python scripts/check_links.py
```

Expected: 20 engine tests pass and both site checkers end with `all clear`.

- [ ] **Step 8: Exercise calculator states with keyboard only**

Serve locally and verify:

1. Tab reaches branch radios, dynamic fields, bonus action, Calculate, employee input and export in DOM order.
2. Casual plus an empty reporting month shows an inline message and focuses the month field.
3. Base rate values `10000`, `2500`, `500`, `0` produce the same result rows as before.
4. Add two employees, remove the first, and confirm the second remains first in insertion order.
5. Export CSV and confirm columns remain `Label,Branch,Eligible wages,Levy`.
6. The browser console has no error.

- [ ] **Step 9: Commit the calculator presentation**

```powershell
git add tools/coal-lsl-levy/index.html assets/site.css scripts/check_seo.py
git commit -m "feat: add accessible calculator workspace"
```

Verify `git diff 825b5f601f814cfc30c64e6af796fe681e44852d -- assets/levy.mjs` prints nothing.

---

### Task 8: Run the release-quality verification gate

**Files:**
- No planned repository edits
- If a check fails, return to the task that owns the requirement, repeat its test cycle and make a focused fix commit before restarting this gate.
- Save QA screenshots outside the repository for the user handoff.

**Interfaces:**
- Consumes: all previous task deliverables
- Produces: evidence that the local branch satisfies logic, content, search, accessibility, responsive and taste contracts

- [ ] **Step 1: Run all automated checks from a clean tree**

```powershell
git status --short
node --test scripts/levy.test.mjs
python scripts/check_links.py
python scripts/check_seo.py
python -m py_compile scripts/check_links.py scripts/check_seo.py
```

Expected: clean tree, 20 tests pass, both checkers report `all clear`, and Python compilation produces no output.

- [ ] **Step 2: Verify protected files and route inventories**

```powershell
git diff 825b5f601f814cfc30c64e6af796fe681e44852d -- assets/levy.mjs robots.txt sitemap.xml llms.txt rates/*/*.csv
git diff --check 825b5f601f814cfc30c64e6af796fe681e44852d..HEAD
```

Expected: the protected-file diff prints nothing and `git diff --check` exits 0.

- [ ] **Step 3: Serve the final branch locally**

Run in a persistent terminal:

```powershell
python -m http.server 8000
```

Open `http://localhost:8000/` and keep the server running for the remaining visual checks.

- [ ] **Step 4: Capture the required review widths**

Save screenshots outside the repository for:

- homepage at 1440 by 900, 768 by 1024 and 390 by 844
- About and Evidence at 1440 by 900 and 390 by 844
- Super guarantee rate page at 390 by 844
- Australian tax AI agents page at 390 by 844
- Coal LSL calculator empty, invalid and valid states at 1440 by 900 and 390 by 844
- 404 page at 390 by 844

For every capture, verify `document.documentElement.scrollWidth === document.documentElement.clientWidth` unless the active element is an intentionally labelled table-scroll region.

- [ ] **Step 5: Complete the accessibility pass**

Verify the skip link, all five primary navigation links, article contents links, rate-table regions, calculator controls, result announcement, employee table and export without a mouse. At 200 per cent zoom, verify no content is obscured and all controls remain reachable. Confirm body links are underlined and focus never depends on colour alone.

- [ ] **Step 6: Complete the taste preflight**

Confirm each item explicitly:

- no gradient or second accent colour
- no automatic or scroll-triggered motion
- no repeated equal-card catalogue
- no pill treatment for credentials or factual metadata
- only 8-pixel control and 12-pixel framed-artefact radii
- authentic calculator image with a synthetic-example caption
- hero and credentials fit within the first 900-pixel desktop viewport
- four system layers use 0, 24, 48 and 72-pixel desktop insets and zero mobile inset
- one dark theme from header through footer
- all five navigation labels remain visible or horizontally reachable on mobile

- [ ] **Step 7: Inspect the final branch history and stop before remote effects**

```powershell
git status --short
git log --oneline --decorate 825b5f601f814cfc30c64e6af796fe681e44852d..HEAD
```

Expected: clean tree and a readable sequence of focused local commits. Report the screenshots, automated results, protected-file proof and commit list. Do not push or publish.
