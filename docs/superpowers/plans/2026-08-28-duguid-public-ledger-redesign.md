# Duguid Public Ledger Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user required one agent to complete the work, so do not use subagents.

**Goal:** Make duguid.com.au feel like a serious public accounting register rather than a default AI or SaaS landing page, while preserving every protected rate page, JSON-LD object, disclaimer and `llms.txt` fact.

**Architecture:** Keep the dependency-free static-site architecture. Add a small design-contract checker beside the existing SEO and link checks, load one semantic token sheet before the site stylesheet, and replace only the homepage's visible HTML while leaving its JSON-LD script semantically unchanged. The shared stylesheet will give every page the same paper-ledger shell, while homepage-specific rules create four deliberate viewports: orientation, Engage, Adopt and Verify.

**Tech Stack:** HTML5, CSS custom properties, self-hosted WOFF2 fonts, Python standard-library contract tests, Node's built-in test runner, GitHub Pages.

**Spec:** `DESIGN.md`

## Global Constraints

- Use Australian English in original copy and do not use em dashes.
- Preserve `llms.txt` byte-for-byte.
- Preserve the three rate-table HTML files byte-for-byte.
- Preserve every `application/ld+json` object semantically across all HTML files.
- Preserve the existing shared navigation labels and all existing disclaimers verbatim.
- Keep `Engage`, `Adopt` and `Verify` as visible route labels and section headings.
- Keep both supported install commands only inside `#adopt`.
- Keep all three scoped enquiry subjects inside `#engage`.
- Do not add gradients, floating rounded cards, glow, glass, fake dashboard chrome, scroll-jacking, carousel controls, or generated imagery.
- Use IBM Plex only from the official IBM repository under the SIL Open Font License 1.1.
- Use `python scripts/check_site.py` as the complete repository-defined check.
- Do not touch `assets/og-card.png`; PR #40 owns that asset.

## File Map

- `scripts/design_baseline.json`: immutable SHA-256 values for protected text files and a semantic digest for every JSON-LD block.
- `scripts/check_design.py`: standard-library checker for protected content, font provenance, visible design contracts and banned presentation patterns.
- `scripts/test_check_design.py`: mutation tests proving each checker branch catches the intended regression.
- `scripts/check_site.py`: invokes the two new design checks before the existing suite.
- `assets/fonts/*`: six IBM Plex WOFF2 files plus the upstream OFL licence.
- `assets/tokens.css`: semantic colour, type, spacing, radius, motion and layer tokens already defined by the design-first commit.
- `assets/site.css`: shared ledger shell, article, tool, table, calculator and homepage presentation.
- `index.html`: new visible homepage; JSON-LD remains semantically identical.
- `about/index.html`: shorter, more factual presentation copy; JSON-LD remains semantically identical.
- `scripts/site_contracts.py`: approved homepage heading and catalogue wording.
- `scripts/test_check_seo.py`: characterisation fixtures for the new approved homepage wording.

---

### Task 1: Freeze the Protected Surface

**Files:**
- Create: `scripts/design_baseline.json`
- Create: `scripts/check_design.py`
- Create: `scripts/test_check_design.py`
- Modify: `scripts/check_site.py`

**Interfaces:**
- Consumes: repository root from `Path(__file__).resolve().parents[1]`.
- Produces: `check_design.check_repository(root: Path) -> list[str]` and a command that exits non-zero with one line per failure.

- [ ] **Step 1: Write a failing semantic-protection test**

  Create `scripts/test_check_design.py` with a temporary repository fixture containing one JSON-LD page and protected files. Assert that `check_repository()` reports a changed `llms.txt`, changed rate table, changed disclaimer, and changed JSON-LD value, but ignores JSON key ordering and indentation.

- [ ] **Step 2: Verify the test fails for the missing checker**

  Run: `python scripts/test_check_design.py`

  Expected: FAIL because `check_design` cannot be imported.

- [ ] **Step 3: Add the minimal checker and frozen baseline**

  Implement:

  ```python
  def canonical_json_ld(path: Path) -> list[str]:
      blocks = re.findall(
          r'<script type="application/ld\+json">(.*?)</script>',
          path.read_text(encoding="utf-8"),
          re.S,
      )
      return [
          json.dumps(json.loads(block), ensure_ascii=False, sort_keys=True, separators=(",", ":"))
          for block in blocks
      ]

  def check_repository(root: Path = ROOT) -> list[str]:
      baseline = json.loads((root / "scripts/design_baseline.json").read_text(encoding="utf-8"))
      # Compare protected SHA-256 values, canonical JSON-LD digests,
      # disclaimer counts, font files and visible design contracts.
  ```

  Generate literal baseline values from the current `origin/main` content for `llms.txt`, the three rate pages, every HTML JSON-LD block and all current disclaimer strings. Baseline generation is a one-time maintenance action, not runtime checker logic.

- [ ] **Step 4: Verify green and prove the mutations are caught**

  Run: `python scripts/test_check_design.py`

  Expected: PASS and a zero exit status.

- [ ] **Step 5: Add the checker to the repository command**

  Add these entries first in `CHECKS`:

  ```python
  (sys.executable, "scripts/test_check_design.py"),
  (sys.executable, "scripts/check_design.py"),
  ```

- [ ] **Step 6: Run the full baseline suite**

  Run: `python scripts/check_site.py`

  Expected: `site checks passed`.

- [ ] **Step 7: Commit**

  ```powershell
  git add scripts/design_baseline.json scripts/check_design.py scripts/test_check_design.py scripts/check_site.py
  git commit -m "test: protect public site facts"
  ```

---

### Task 2: Ship Licensed, Self-hosted Type

**Files:**
- Create: `assets/fonts/IBMPlexSerif-Regular.woff2`
- Create: `assets/fonts/IBMPlexSerif-SemiBold.woff2`
- Create: `assets/fonts/IBMPlexSans-Regular.woff2`
- Create: `assets/fonts/IBMPlexSans-Italic.woff2`
- Create: `assets/fonts/IBMPlexSans-SemiBold.woff2`
- Create: `assets/fonts/IBMPlexMono-Regular.woff2`
- Create: `assets/fonts/OFL.txt`
- Modify: `scripts/design_baseline.json`

**Interfaces:**
- Consumes: official IBM Plex release files from `IBM/plex` tag `v6.4.2`.
- Produces: six locally served font assets matching the `@font-face` rules already in `assets/tokens.css`.

- [ ] **Step 1: Extend the failing test for font integrity**

  Add table-driven mutation cases for a missing font, a font with the wrong SHA-256 digest, and a missing OFL licence.

- [ ] **Step 2: Verify the font test fails**

  Run: `python scripts/test_check_design.py`

  Expected: FAIL because the font directory does not exist.

- [ ] **Step 3: Download the pinned official files**

  Fetch the six `complete/woff2` assets and `LICENSE.txt` from `https://raw.githubusercontent.com/IBM/plex/v6.4.2/`. Save the licence as `assets/fonts/OFL.txt`. Do not use a font mirror or CDN.

- [ ] **Step 4: Record literal font digests and verify green**

  Add each downloaded file's SHA-256 value to `scripts/design_baseline.json`, then run:

  ```powershell
  python scripts/test_check_design.py
  python scripts/check_design.py
  ```

  Expected: both commands pass.

- [ ] **Step 5: Commit**

  ```powershell
  git add assets/fonts scripts/design_baseline.json scripts/test_check_design.py
  git commit -m "feat: self-host IBM Plex fonts"
  ```

---

### Task 3: Implement the Shared Ledger Shell

**Files:**
- Modify: `assets/site.css`
- Modify: `scripts/check_design.py`
- Modify: `scripts/test_check_design.py`

**Interfaces:**
- Consumes: semantic custom properties from `assets/tokens.css` and existing HTML classes.
- Produces: a responsive light/dark shared shell with keyboard focus, reduced motion and horizontally safe tables/code.

- [ ] **Step 1: Write failing presentation-contract mutations**

  Add controlled CSS fixture cases that reject `linear-gradient`, `radial-gradient`, `backdrop-filter`, `box-shadow`, raw purple palette values and card radii above the design token ceiling. Add HTML cases that require a skip link, one primary navigation and a main landmark.

- [ ] **Step 2: Verify the test fails on the current stylesheet**

  Run: `python scripts/test_check_design.py`

  Expected: FAIL with banned gradient, shadow, blur, purple and excessive-radius diagnostics.

- [ ] **Step 3: Replace shared base rules**

  Begin `assets/site.css` with:

  ```css
  @import url("/assets/tokens.css");

  *, *::before, *::after { box-sizing: border-box; }
  html { scroll-behavior: smooth; scroll-padding-top: var(--header-height); }
  body {
    margin: 0;
    color: var(--text-primary);
    background: var(--surface-canvas);
    font-family: var(--font-sans);
  }
  ```

  Rebuild the header, navigation, footer, article grid, contents rail, headings, links, buttons, tables, callouts, code blocks, calculator controls and evidence layout with rules and whitespace instead of panels.

- [ ] **Step 4: Add accessibility variants**

  Keep a two-pixel visible focus ring, allow navigation to wrap or scroll on narrow screens, use `overflow-x: auto` for tables and code, and disable non-essential transitions under `prefers-reduced-motion: reduce`.

- [ ] **Step 5: Verify design and repository checks**

  Run:

  ```powershell
  python scripts/test_check_design.py
  python scripts/check_design.py
  python scripts/check_site.py
  ```

  Expected: all pass.

- [ ] **Step 6: Commit**

  ```powershell
  git add assets/site.css scripts/check_design.py scripts/test_check_design.py
  git commit -m "feat: apply public ledger site shell"
  ```

---

### Task 4: Rebuild the Homepage as One-thought Viewports

**Files:**
- Modify: `index.html`
- Modify: `assets/site.css`
- Modify: `scripts/site_contracts.py`
- Modify: `scripts/test_check_seo.py`
- Modify: `scripts/check_design.py`
- Modify: `scripts/test_check_design.py`

**Interfaces:**
- Consumes: existing route IDs, mail subjects, install commands, tool URLs, evidence URLs and real Coal LSL screenshot.
- Produces: orientation, Engage, Adopt and Verify sections with one primary thought each and a grouped compact tool register.

- [ ] **Step 1: Change the homepage characterisation fixture first**

  Update the expected visible heading to `Accounting tools that show their working.` and the catalogue heading to `Tools for work that still needs checking`. Add assertions that each authority section has exactly one `h2` route label, one statement heading, one action group and a visible boundary or verification note.

- [ ] **Step 2: Verify red**

  Run: `python scripts/test_check_seo.py`

  Expected: FAIL because `index.html` still contains the former hero and catalogue wording.

- [ ] **Step 3: Replace only the visible homepage**

  Keep the document head and JSON-LD script semantically unchanged. Replace visible content with:

  - orientation: `Accounting tools that show their working.` and a short Newcastle accountant descriptor;
  - route index: `.path-card` anchors labelled Engage, Adopt and Verify, styled as a ruled register rather than cards;
  - Engage: `Fix the workflow before another review round.` plus the three exact mail subjects and existing enquiry boundary;
  - Adopt: `Test it with fabricated data first.` plus the two exact install commands and three evaluation packs;
  - Verify: `Check the source before the result.` plus credentials, evidence, the real Coal LSL screenshot and all four proof links;
  - compact catalogue grouped under `Extract`, `Calculate`, `Control` and `Inspect`, retaining all ten tool links;
  - the five principles: useful first, sources visible, calculation inspectable, uncertainty explicit, human sign-off.

- [ ] **Step 4: Add viewport CSS without scroll-jacking**

  Give `.route-section` a desktop `min-block-size` that leaves the next route visible below the sticky header. Use a two-column statement/detail composition above 900px and a single linear flow below it. Do not use `scroll-snap-type` or JavaScript.

- [ ] **Step 5: Verify protected and visible contracts**

  Run:

  ```powershell
  python scripts/test_check_seo.py
  python scripts/test_check_design.py
  python scripts/check_design.py
  ```

  Expected: all pass; `llms.txt`, rate-table and JSON-LD digests remain unchanged.

- [ ] **Step 6: Commit**

  ```powershell
  git add index.html assets/site.css scripts/site_contracts.py scripts/test_check_seo.py scripts/check_design.py scripts/test_check_design.py
  git commit -m "feat: rebuild homepage around three decisions"
  ```

---

### Task 5: Tighten the About Page Copy

**Files:**
- Modify: `about/index.html`

**Interfaces:**
- Consumes: existing facts, qualifications, boundaries, authored software and JSON-LD.
- Produces: shorter factual prose that follows the five copy principles without changing any underlying claim.

- [ ] **Step 1: Capture the current JSON-LD digest**

  Run: `python scripts/check_design.py`

  Expected: PASS before editing.

- [ ] **Step 2: Rewrite visible prose only**

  Shorten the opening, replace abstract phrases with the reader's practical problem, make primary-source and human-review limits visible beside claims, retain the exact CA ANZ owner-assertion caveat, and retain every existing contact and advice boundary.

- [ ] **Step 3: Verify protected content and copy lint**

  Run:

  ```powershell
  python scripts/check_design.py
  rg -n "\b(leverage|seamless|cutting-edge|revolutionary|empower|unlock)\b|—" index.html about/index.html
  ```

  Expected: checker passes and `rg` returns no matches.

- [ ] **Step 4: Commit**

  ```powershell
  git add about/index.html
  git commit -m "docs: make public claims easier to verify"
  ```

---

### Task 6: Verify the Local Site in a Browser

**Files:**
- Modify as defects require: `assets/site.css`, `index.html`, `about/index.html`
- Save audit artefacts outside the repository under `work/local-preview/`.

**Interfaces:**
- Consumes: local HTTP server at `http://127.0.0.1:8765/`.
- Produces: desktop/mobile screenshots and a written record of interaction, focus, overflow and colour-mode checks.

- [ ] **Step 1: Run the full repository suite**

  Run: `python scripts/check_site.py`

  Expected: `site checks passed`.

- [ ] **Step 2: Start the repository locally**

  Run: `python -m http.server 8765 --bind 127.0.0.1`

  Expected: local pages return HTTP 200.

- [ ] **Step 3: Inspect the key pages at desktop and mobile widths**

  Capture homepage, About, Evidence, AI agents, Coal LSL calculator and all three rate tables at 1440 by 1000 and 390 by 844. Confirm no horizontal page overflow, no clipped focus, no unreadable fixed element and no stacked-card mobile residue.

- [ ] **Step 4: Exercise interaction and accessibility states**

  Tab through the header, route index, install links, proof links and calculator controls. Check the page at 200% zoom, dark colour scheme and reduced motion. Confirm route anchors land below the sticky header and the calculator still computes the documented synthetic result.

- [ ] **Step 5: Fix each observed defect with a failing contract or reproducible browser case**

  For code defects, add a mutation case to `scripts/test_check_design.py`, observe it fail, apply the smallest CSS/HTML fix, then rerun the affected check and browser case.

- [ ] **Step 6: Run final local verification**

  Run:

  ```powershell
  git diff --check origin/main...HEAD
  python scripts/check_site.py
  ```

  Expected: no diff errors and `site checks passed`.

- [ ] **Step 7: Commit any browser refinements**

  ```powershell
  git add assets/site.css index.html about/index.html scripts/test_check_design.py
  git commit -m "fix: refine responsive ledger layout"
  ```

  Skip this commit when the browser pass requires no tracked changes.

---

### Task 7: Verify Live Facts and Open the Pull Request

**Files:**
- Modify outside repository: `work/GATES.md`
- Modify outside repository: `C:\agent-hub\tasks\duguid-com-au-no-ai-slop-redesign.md`

**Interfaces:**
- Consumes: live `https://duguid.com.au/llms.txt`, official ATO, legislation.gov.au and Coal LSL sources, current branch diff and GitHub CLI authentication.
- Produces: evidence-backed fact-parity record and an open pull request with passing hosted checks.

- [ ] **Step 1: Compare live and local machine-readable facts**

  Fetch live `llms.txt`, normalise only line endings for the diagnostic comparison, and compare it with local. Confirm the local file itself still matches the frozen byte digest. Inspect the live three rate pages and compare the visible current values with local.

- [ ] **Step 2: Recheck every current rate against a primary source**

  Verify: SG 12% from 1 July 2025; Payday Super commencement and payment timing from 1 July 2026; Division 7A 2026-27 benchmark rate 8.77%; cents-per-kilometre 2026-27 rate 91 cents; Coal LSL levy 2.7%. Record source URLs and review dates in the gate ledger without changing protected public content.

- [ ] **Step 3: Review the complete diff**

  Run:

  ```powershell
  git status --short
  git diff --stat origin/main...HEAD
  git diff --check origin/main...HEAD
  git log --oneline origin/main..HEAD
  python scripts/check_site.py
  ```

  Confirm no unrelated changes, no protected-content drift and no secret-bearing files.

- [ ] **Step 4: Push the feature branch**

  Run: `git push -u origin codex/duguid-no-ai-slop`

  Expected: branch published without force.

- [ ] **Step 5: Open the pull request**

  Run `gh pr create` with a title describing the public-ledger redesign and a body containing: outcome-first summary, design rationale, protected-content guarantees, font provenance, exact verification commands, local browser matrix, live-fact sources, material risks and unverified checks.

- [ ] **Step 6: Verify hosted checks**

  Run: `gh pr checks --watch --interval 10`

  Expected: every required check passes. Do not merge the PR.

- [ ] **Step 7: Finalise the gate ledger and handoff**

  Mark every acceptance gate with evidence, rerun the ledger's approved commands, update the Agent Hub handoff with branch, commit, PR and checks, then release the Hub claim.

---

## Self-review Record

- Spec coverage: every DESIGN.md section maps to a task; typography, homepage composition, copy, protected content, accessibility, local preview, fact parity and PR delivery are covered.
- Placeholder scan: no deferred implementation markers or unspecified error-handling steps remain.
- Interface consistency: `check_repository(root: Path) -> list[str]`, the baseline file and all named route IDs are consistent across tasks.
- Scope decision: this is one static-site change with a single release boundary, so splitting it into separate projects would make the protected-content and browser verification weaker rather than clearer.
