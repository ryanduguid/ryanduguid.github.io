# OLED, GEO and performance refinement

**Status:** Approved by Ryan Duguid on 28 August 2026  
**Date:** 28 August 2026  
**Source baseline:** `adb31c63f17e608545197a703d3823c2cb3ca7f3`  
**Approved approach:** Evidence-led surgical rebuild

## Objective

Refine `duguid.com.au` into an OLED-first, fast and generative-engine-friendly
public accounting register. The work must preserve the existing Engage, Adopt
and Verify information architecture, licensed self-hosted IBM Plex typography,
machine-readable facts, rate JSON-LD, disclaimers and factual boundaries.

The visual treatment takes principles from `https://pliny.gg/`: near-black
contrast, confident serif display type, compact monospaced labels, fine ruled
geometry and a single luminous green signal. It must not copy Pliny's identity,
hidden content, scanlines, noise, gradients, novelty motion, hacker language or
decorative spectacle. The result remains an accounting evidence register.

The site stays a static GitHub Pages project built with native HTML and CSS.
The homepage remains script-free. The existing calculator retains only the
JavaScript required for its current calculation and interaction contract.

## Approved design read

This is a preserve-mode refinement of a public accounting register for both
human practitioners and machine answer systems. It should feel dark,
authoritative, inspectable and unusually direct, not like a SaaS landing page,
generic AI portfolio or application dashboard.

- `DESIGN_VARIANCE`: 6
- `MOTION_INTENSITY`: 2
- `VISUAL_DENSITY`: 5
- Theme: OLED dark only

## Source state and baseline evidence

The approved source baseline is the squash merge from PR 41. The isolated
worktree was refreshed to `origin/main` before this specification was written.
The baseline passes the repository's full defined check:

```text
python scripts/check_site.py
```

A production mobile measurement at 390 by 844 CSS pixels, device scale factor
2, four-times CPU throttling and emulated 4G recorded:

| Measure | Baseline |
| --- | ---: |
| Homepage transferred bytes | about 303 KB |
| Font transfer | about 250 KB across four faces |
| Below-fold image transfer | about 46 KB |
| First contentful paint | about 1.40 s |
| Largest contentful paint | about 1.40 s |
| Cumulative layout shift | 0 |

The font files account for about 82.6 per cent of the measured homepage
transfer. The image accounts for about 15.2 per cent. HTML and CSS are already
small after GitHub Pages compression, so the implementation must address the
font and image paths before considering source minification or infrastructure.

The baseline measurement is comparative evidence, not a universal loading
promise. Before and after runs must use the same browser, viewport, throttling
and cache conditions.

## Success criteria

The refinement succeeds when all of the following are true:

- The default and only branded palette uses a true-black OLED canvas.
- The visual language clearly reflects the approved Pliny principles without
  copying its identity or adding decorative rendering cost.
- Engage, Adopt and Verify remain one-thought homepage viewports.
- All current public routes, visible facts, evidence links and actions remain.
- `llms.txt`, rate values, JSON-LD, disclaimers and refusal boundaries remain
  factually and textually unchanged unless a failed parity check proves a
  source defect and Ryan approves a design revision.
- Search and answer crawlers remain allowed while training crawlers remain
  blocked according to the current `robots.txt` policy.
- No Google-specific ranking work or `noindex` directive is added to indexable
  pages. Ordinary crawlability remains intact.
- The homepage stays JavaScript-free.
- The initial homepage transfer is meaningfully lower than the production
  baseline. The design target is about 130 to 180 KB, subject to licensed font
  subset availability and measured rendering quality.
- Comparable median mobile LCP does not regress, CLS remains zero and no page
  gains horizontal overflow at 320 CSS pixels or wider.
- The repository's complete defined check, local browser matrix, factual parity
  checks and hosted checks all pass before production is declared complete.
- A focused pull request is merged only after its required checks pass, then
  the custom production domain is verified against the merged source.

## Visual system

### Colour

The OLED palette is the brand experience. Do not add a light theme or a theme
switcher. Set `color-scheme: dark` so native controls match the page and no
theme flash occurs.

| Token | Value | Use | Contrast on canvas |
| --- | --- | --- | ---: |
| Canvas | `#000000` | Page and viewport background | n/a |
| Paper | `#050806` | Quiet grouped surfaces | n/a |
| Raised paper | `#09100D` | Stronger hierarchy where needed | n/a |
| Ink | `#EEF4F0` | Primary reading text | 18.83:1 |
| Soft ink | `#9AA89F` | Supporting text and metadata | 8.48:1 |
| Register green | `#4DFF88` | Links, focus, labels and live signals | 15.98:1 |
| Alert | `#FF9C91` | Errors and warnings | 10.42:1 |

Rules use restrained green-grey values between the paper and text colours.
Raised surfaces must be rare. Large areas remain true black so the design is
genuinely OLED-friendly rather than merely dark grey.

Colour never carries meaning alone. Reading links remain underlined, focus has
a visible outline and status text includes a textual label.

### Typography

Retain the existing IBM Plex family and SIL Open Font License 1.1:

- IBM Plex Serif for the principal statements and selected evidence headings
- IBM Plex Mono for folios, technical labels, dates and machine-readable cues
- IBM Plex Sans for body copy and practical controls

Typography remains self-hosted. Replace full webfont files with reputable,
licence-compatible Latin subsets only when their source, upstream version,
licence and SHA-256 digests are recorded. Do not create locally renamed or
modified font binaries if doing so would make the IBM Plex reserved-name
licence position ambiguous.

Audit real glyph usage across all HTML and JavaScript-rendered interface text.
The subset must cover Australian English punctuation, currency symbols,
percentages, arrows, mathematical marks and all visible names. Browser tests
must detect missing glyphs. Keep robust serif, sans-serif and monospace fallback
stacks.

Aim to reduce the homepage from four requested faces to three where the
approved hierarchy survives. Do not synthesise a bold face if it harms
legibility or produces inconsistent rendering. Keep `font-display: optional`
unless controlled testing proves another value improves both initial rendering
and the branded result.

### Composition

Retain the current public-register information architecture and one-thought
viewports. Refine its presentation with:

- a true-black continuous field
- large but bounded serif statements
- small, tracked mono folios and route labels
- deliberate ruled geometry rather than repeated cards
- controlled asymmetry on wide screens
- one-column semantic flow on narrow screens

Engage, Adopt and Verify remain the three principal homepage thoughts. Each
starts with one concise answer statement and then exposes only the evidence,
source or action needed for that thought.

Do not add gradients, glow, scanlines, fixed texture, background video,
parallax, canvas rendering, decorative SVG constellations or stock imagery.
The existing Coal LSL screenshot remains a proof artefact, not decoration.

### Motion and interaction

Nothing animates on load or scroll. Motion is limited to brief colour,
underline and border transitions on interactive elements. Respect
`prefers-reduced-motion: reduce` by removing non-essential transitions.

Keep visible keyboard focus, underlined body links, semantic source order and
standalone tap targets of at least 44 CSS pixels where practical. The design
must remain usable at 200 per cent zoom without fixed elements covering text.

## GEO and content architecture

GEO means making truthful answers easy to identify, extract and verify. It does
not mean adding search keywords, promising citations or manufacturing machine
signals.

### Human answer layer

- Preserve Engage, Adopt and Verify as the canonical mental model.
- Keep each viewport's answer statement concise and close to its evidence.
- Retain visible source, review and limitation labels where they qualify a
  claim.
- Preserve the five working principles and their Australian accounting
  context.
- Keep all important facts in visible semantic HTML. No claim may exist only
  in an image, CSS pseudo-element or script-generated decoration.

### Machine contract layer

- Preserve the canonical Ryan Duguid Person ID and existing entity
  relationships.
- Preserve the current WebSite, WebPage, ItemList and SoftwareSourceCode
  JSON-LD blocks exactly unless verification finds an existing contradiction.
- Add a plain HTML discovery link for `/llms.txt` and, where suitable, a
  document-head alternate link with `type="text/plain"`. The visible label
  should describe it as a machine-readable or LLM index, not as an SEO device.
- Keep semantic headings, lists, tables, source links and dates independent of
  CSS and JavaScript.
- Keep the sitemap and canonical routes unchanged.

Do not add invisible text, duplicated machine-only prose, FAQ schema without a
visible FAQ, ratings, testimonials, unsupported `sameAs` links or invented
authority claims.

### Crawler stance

Retain the current separation in `robots.txt`:

- allow answer and search agents such as OAI-SearchBot, Claude search crawlers
  and PerplexityBot
- allow user-triggered retrieval agents where already configured
- block model-training crawlers such as GPTBot, ClaudeBot and
  Google-Extended where already configured

Do not add a Google-specific `noindex`. Ryan approved ordinary crawlability
without Google-focused SEO work.

### Factual invariants

The following surfaces are protected from semantic or textual change:

- `llms.txt`
- the three rate values and their visible source material
- rate-page JSON-LD
- all other current JSON-LD blocks
- advice, registration and human-review disclaimers
- refusal boundaries and the absence of client-service claims

Existing digest and mutation checks must remain. Extend them only where needed
to cover new discovery links and delivery contracts.

## Performance architecture

### Stylesheet discovery

Remove the `@import` from `assets/site.css`. Link `assets/tokens.css` directly
before `assets/site.css` in every HTML document so both resources are
discovered from the initial HTML rather than serially. Keep `tokens.css` as the
design-system source of truth.

Do not introduce a bundler merely to combine these two small files. GitHub
Pages already compresses text responses, and source minification would create
maintenance cost for negligible transfer savings.

### Fonts

- Load only the faces a page actually uses.
- Use licence-compatible Latin subsets with recorded provenance and hashes.
- Test whether the homepage can use three faces without losing the approved
  serif, sans and mono hierarchy.
- Test a preload only for the LCP-critical face. Keep it only when the median
  controlled result improves and other resources are not delayed.
- Keep fallbacks metric-compatible enough to avoid visible shift.

### Images

The below-fold Coal LSL image keeps explicit width, height and useful alt text.
Add `loading="lazy"`, `decoding="async"` and `fetchpriority="low"`.

Create a smaller responsive source or more efficient local format only when it
reduces transferred bytes at equivalent visible quality. Use a plain `img` or
`picture` with a WebP fallback. Do not add an image runtime or JavaScript lazy
loader.

### Rendering and runtime

- Keep the homepage free of JavaScript.
- Do not add a service worker, analytics, third-party embeds or remote fonts.
- Use fluid type and spacing rather than device-specific layouts.
- Test `content-visibility` or containment only on genuinely expensive
  below-fold sections. Retain it only if measurement improves and anchor,
  accessibility and layout behaviour remain correct.
- Preserve explicit media dimensions and zero layout shift.
- Accept GitHub Pages' cache policy rather than migrating hosting for this
  refinement.

### Failure behaviour

If a webfont fails, fallback typography remains readable and the page does not
shift enough to obscure or reorder content. If the proof image fails, its alt
text still communicates the evidence route. If CSS enhancements fail, semantic
HTML, links and sources remain usable. Existing calculator validation and
calculation error behaviour remain unchanged.

## Responsive behaviour

The site must work from 320 CSS pixels upward without a JavaScript navigation
menu. All navigation labels remain available. Wide layouts may use editorial
asymmetry, but narrow layouts follow DOM order in one column.

Primary review sizes are:

- 320 by 720 CSS pixels
- 390 by 844 CSS pixels
- 768 by 1024 CSS pixels
- 1440 by 1000 CSS pixels

At each size, verify no horizontal page overflow, readable measure, visible
focus, complete navigation, stable media and no content hidden by viewport
units. Prefer `svh` where viewport-relative block sizing is needed, and allow a
section to grow beyond one viewport when its content requires it.

## Test-first implementation contract

Before production edits, add or change focused tests that fail for the missing
behaviour. Required contracts include:

- the default canvas token is `#000000` and `color-scheme` is dark
- no stylesheet contains the old `@import` chain
- every styled site page links tokens before site CSS
- the proof image carries the approved loading, decoding, priority and sizing
  attributes
- declared local fonts exist, retain the OFL and match recorded digests
- responsive font sources cover every visible site glyph
- crawler allow and block policy is unchanged
- `llms.txt`, rates, JSON-LD and disclaimers retain their protected digests or
  semantic snapshots
- every indexable page exposes the machine-readable index discovery route

Tests should assert user-visible or public delivery contracts, not incidental
selector organisation. Follow the repository's existing self-test pattern and
keep test fixtures deterministic.

## Verification and release contract

### Automated verification

Run from the repository root:

```text
python scripts/check_site.py
git diff --check
```

Confirm the full check still invokes design, metadata, link and calculator
tests. Run any new focused test directly once in red and again in green before
relying on the aggregate result.

### Factual parity

Before release, compare the branch against the protected source baseline and
the current production pages. Confirm:

- `llms.txt` is unchanged
- each visible rate matches its rate-page JSON-LD and machine index entry
- disclaimers and refusal boundaries are unchanged
- crawler rules still implement the approved search-versus-training split
- all canonical routes and source links remain reachable

Re-run the same checks after production deployment with cache bypasses.

### Browser, accessibility and responsive verification

Serve the repository over local HTTP. Inspect the homepage at all four primary
review sizes, plus About, Evidence, one rate page, one ordinary tool page, the
calculator and the 404 page at desktop and mobile widths.

Verify:

- OLED colour tokens and continuous true-black canvas
- IBM Plex faces load with no missing glyphs
- logical heading and landmark order
- keyboard focus and underlined reading links
- reduced-motion behaviour
- no console errors
- no horizontal overflow
- calculator interaction remains correct
- image loading is deferred until appropriate
- rendering remains usable with fonts or the image blocked

### Performance comparison

Run at least three cold-cache local or production measurements before and
after with the same browser, 390 by 844 viewport, four-times CPU throttling and
emulated 4G. Compare medians for:

- transferred bytes before the first viewport settles
- request count and dependency order
- FCP
- LCP
- CLS

Passing requires a meaningful transfer reduction, no LCP regression beyond
normal run variance and CLS of zero. Record both the raw runs and the median.
If a preload, containment rule or format variant regresses the median, remove
it.

### Pull request and production

Ryan has explicitly approved publishing this refinement to the live site.
After local verification:

1. commit the focused implementation on its branch
2. push the branch and open a pull request containing the design summary,
   check evidence, before and after performance results, risks and unverified
   items
3. wait for required hosted checks
4. merge only when the exact reviewed head is still current and green
5. wait for GitHub Pages deployment
6. verify `https://duguid.com.au/` matches the merged source visually and
   mechanically
7. repeat production factual parity and performance checks

If hosted output differs from the reviewed branch or a protected fact changes,
stop and diagnose. Do not call the release complete merely because the pull
request merged.

## Planned file boundary

Expected edits are:

- `DESIGN.md`
- `assets/tokens.css`
- `assets/site.css`
- `assets/fonts/*` and font provenance or digest records
- the 20 styled site pages for stylesheet discovery and the 19 indexable pages
  for machine-index discovery; leave the no-index redirect and Google
  verification file untouched
- `index.html` for proof-image delivery attributes and any approved homepage
  composition refinements
- focused files under `scripts/` for delivery and factual contracts
- `README.md` only if its check or architecture documentation needs updating

Protected from content change:

- `llms.txt`
- `robots.txt`
- `sitemap.xml`
- all rate values and rate-page explanatory copy
- JSON-LD scripts
- disclaimers and refusal boundaries
- `assets/levy.mjs` and calculator formula behaviour

If implementation evidence shows that a protected file must change, revise
this design with Ryan before editing it.

## Out of scope

- Google ranking or keyword optimisation
- active exclusion from Google
- analytics, tracking, advertising or conversion funnels
- a framework, static-site generator, component runtime or service worker
- a light theme or JavaScript theme switcher
- remote fonts or third-party runtime assets
- new accounting advice, rates, calculations or legal interpretations
- fabricated citations, testimonials, ratings or adoption claims
- a hosting or CDN migration
- unrelated repository or profile changes
