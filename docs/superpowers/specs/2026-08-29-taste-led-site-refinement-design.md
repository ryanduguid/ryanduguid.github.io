# Taste-led site refinement design

**Status:** approved design
**Date:** 29 August 2026
**Branch:** `codex/duguid-site-agent-tooling`

## Purpose

Improve the visual hierarchy, scanability and evidence presentation of
duguid.com.au without replacing its established accounting-register identity.
The work is a targeted evolution of the existing static site, not another
brand overhaul.

The audience is accounting managers, technical adopters and reviewers who
need to understand what a tool does, what evidence supports it and where human
judgement remains mandatory. The site must continue to feel like an
inspectable public register rather than a tax-agent practice, a SaaS funnel or
an AI product launch.

## Design read

- Page kind: preservation-led redesign of a public accounting tool register.
- Audience: Australian accounting practitioners, managers and technical
  reviewers.
- Visual language: OLED ledger, statutory note and developer evidence record.
- Foundation: existing dependency-free HTML and native CSS token system.
- `DESIGN_VARIANCE`: 6. Use strong changes of scale and an asymmetric evidence
  layout, with explicit single-column mobile fallbacks.
- `MOTION_INTENSITY`: 2. Keep feedback transitions and sticky positioning;
  add no decorative animation.
- `VISUAL_DENSITY`: 5. Keep compact records, but give decisions, results and
  section changes clearer breathing room.

The true-black canvas, forced dark theme, IBM Plex Serif display face, mono
evidence labels and sharp ruled geometry are deliberate brand decisions. They
remain explicit exceptions to generic dual-theme, off-black and sans-display
defaults. The public-register context justifies the serif. No generated or
stock imagery is appropriate; the visual proof remains a real local
calculator artefact produced with fabricated inputs.

## Current-state audit

The current site is coherent and distinctive, but six issues materially
reduce its effectiveness:

1. The homepage offers three hero buttons and immediately repeats the same
   Engage, Adopt and Verify decisions in another path grid.
2. The hero contains too many simultaneous text layers: register label,
   masthead, summary, legal boundary, three actions and a three-part scope
   rail.
3. The monumental `Engage` route word breaks after five letters on desktop
   because global defensive wrapping also applies to the narrow display rail.
4. Calculator result elements have semantic `.result-row` and `.result-why`
   classes but no row presentation, causing labels and values to concatenate
   visually in the mobile baseline.
5. The calculator repeats a long statutory and task explanation before the
   form, leaving the actual task below the first mobile viewport.
6. Repeated ordinal mono labels and the long mobile catalogue weaken scan
   hierarchy. The five equal principle cells also repeat a generic rhythm.

The existing strengths remain protected: accessible focus, skip navigation,
semantic landmarks, visible boundaries, real source links, low motion,
responsive article contents, strong contrast, source-adjacent claims and the
explicitly local and human-reviewed operating model.

## Approaches considered

### 1. Targeted evolution - selected

Keep the identity, information architecture, routes and factual surface. Fix
decision duplication, result legibility, route typography, proof presentation
and mobile scanability with scoped HTML and CSS changes. This produces the
largest improvement for the least factual, SEO and accessibility risk.

### 2. Homepage recomposition

Replace the ceremonial masthead with a split-screen hero and put calculator
media above the fold. This would satisfy conventional landing-page structure,
but it would make the site feel more like product marketing and weaken its
public-register premise.

### 3. Full visual reset

Replace the OLED palette, typography and ruled layout. This was rejected
because the current system is already differentiated, legible and aligned
with the site's audience. A reset would create broad regression risk without
solving the concrete usability issues.

## Detailed design

### Homepage hero and route register

The hero becomes one ceremonial statement followed by one route register.
Its text stack contains four parts:

1. the existing public-register context label;
2. the unchanged visible masthead, split into two natural phrase spans for
   dependable two-line desktop composition;
3. the concise existing identity summary;
4. a single Engage, Adopt and Verify route register.

The separate `.home-actions` button group and `.path-grid` are replaced by one
semantic navigation block. Each destination appears once and retains its
existing anchor:

- Engage: bring a workflow problem;
- Adopt: test with fabricated data;
- Verify: inspect source, release and boundary.

The three routes keep equal semantic weight. Their visual treatment remains a
ruled register rather than rounded marketing cards. They form three columns on
wide screens and one column below 640 CSS pixels. Each link remains at least
44 CSS pixels high and exposes its heading and explanation to assistive
technology.

The exact legal boundary and the existing scope, method and calculation
boundary records move into a separate `.trust-band` immediately after the
hero. This preserves their prominence while keeping them out of the hero text
stack. The trust band is not another card or CTA.

The masthead remains centred because the public-register identity is the
visual artefact. It is not converted to a generic split-screen layout. Above
the existing 56rem route breakpoint, two block-level phrase spans yield two
lines. Below that breakpoint the phrases wrap naturally. Mobile may use three
lines, but no word may be forced into an orphaned fragment.

### Route sections and micro-labels

Wide route labels remain sticky. They receive a protected display measure:
`white-space: nowrap`, normal word wrapping and a grid rail wide enough for
`Engage` at the route type scale. At the existing single-column breakpoint,
the label becomes static and can scale down normally.

Homepage ordinal labels that only number sections are removed from the visual
surface. The route sections do not need `01`, `02` and `03`; their headings
already identify them. Catalogue group letters and the `05` principles count
also disappear. Labels remain where they carry evidence-bearing information:
public-register context, worked proof, tool-register scope, dates, sources and
boundaries.

No route ID, navigation label or anchor destination changes.

### Coal LSL proof artefact

The existing purple proof image is replaced with a fresh screenshot of the
current local calculator result. `npm run capture:coal-lsl-proof` invokes
`scripts/capture-coal-lsl-proof.mjs`, which serves the local static source on a
loopback ephemeral port, launches isolated Chromium and writes only
`assets/coal-lsl-calculator.webp`. It uses a viewport of 868 by 1106 CSS pixels
at device scale factor 1 and waits for the protected IBM Plex fonts. Pure input
and expectation data lives in `scripts/coal-lsl-proof-fixture.mjs`; both the
capture script and focused browser test import that module.

The script uses the same deterministic Formula B fixture as the browser test:

- base-rate branch under section 3B(1);
- base rate of pay: $6,000;
- overtime and penalty rates: $3,000;
- allowances excluding expense reimbursements: $500;
- salary sacrifice: $0;
- no bonuses.

Before capture, it asserts Formula A of $6,000.00, Formula B and eligible wages
of $7,125.00, levy of $192.38, the section 3B(1) branch and the Formula B
explanation. It screenshots the populated `.calculator-result` element rather
than the full form, converts the browser screenshot to WebP and fails without
writing when any expected value differs. It contains no profile, cookie,
storage state or external account data. The focused browser fixture imports
the same input and expected-output constants so the capture and test cannot
silently diverge.

The output is converted to a compressed WebP no larger than 80 KB, with
explicit intrinsic dimensions. The homepage renders a readable
branch-and-result crop rather than a miniature of the full form. The image
keeps a descriptive alt text and the synthetic-example caption. It remains
lazy-loaded with low fetch priority because it is below the first viewport.
Browser evidence must scroll the lazy image into view, assert `complete` and a
positive `naturalWidth`, await `decode()`, and only then take the visual
baseline. This makes the image eligible to load without changing its lazy and
low-priority delivery, and prevents mobile snapshots from recording an empty
proof frame.

### Calculator orientation and result ledger

The calculator header is shortened so the task begins in the first mobile
viewport. It contains:

- the existing page title;
- one concise sentence explaining that the calculator applies the section 3B
  branch test and leaves the formula visible;
- a compact method register that keeps the 2.7 per cent rate, checked date,
  section 3B method and estimate-only boundary visible before the form.

All existing disclaimer text, source links, rate facts and statutory limits
remain on the page. Repetition is removed, not the legal or review boundary.
JSON-LD remains semantically unchanged.

The result panel becomes a compact ledger:

- `.result-row` is a two-column grid with label left and value right;
- values use IBM Plex Mono, tabular numerals and no wrapping;
- rows use a single bottom rule, not boxed cells;
- eligible wages and the final levy receive hierarchy through weight and
  spacing, not a glow, progress bar or unrelated colour;
- `.result-why` sits below a strong rule and retains normal readable prose;
- the empty state remains visible before calculation;
- `role="status"` and `aria-live="polite"` remain unchanged.

Below 640 CSS pixels, labels and values stay in two columns. Long labels may
wrap in the label column; the numeric value remains aligned and unbroken. At
22rem and below, each row becomes a stacked label/value pair to avoid clipping
at the 320 CSS pixel acceptance width.

### Tool catalogue and principles

A compact catalogue index appears above the existing ten-tool register. It
links to the four existing category heading IDs. The index is a single ruled
row on wide screens and a horizontally scrollable, keyboard-accessible row on
mobile. All tools remain present in normal document flow and structured data;
there is no disclosure, filtering or JavaScript state.

The five principles become an asymmetric ruled composition with exactly five
cells. `Useful before impressive` receives the larger lead position, with the
remaining four arranged as a two-by-two supporting set. The layout collapses
to one column on mobile. No rounded cards, numbering, icons or invented metrics
are added.

### Mobile primary navigation

All existing navigation labels and destinations remain. Below 640 CSS pixels,
the links stay on one horizontally scrollable line under the identity instead
of wrapping into two rows. Focused links must scroll into view, the browser
scrollbar remains available, and no custom menu JavaScript is introduced. The
header token is reduced only as far as the identity and 44 CSS pixel navigation
targets allow.

### CSS and dependency boundaries

The implementation extends the existing semantic tokens and shared selectors.
It introduces no framework, component package, icon package, animation library
or runtime dependency. Component CSS continues to consume variables from
`assets/tokens.css`; raw colours remain prohibited in `assets/site.css`.

The theme stays dark-only and true black by explicit brand decision. The stamp
green remains the single accent. Controls keep the existing 2px radius while
content and register surfaces remain square. Motion stays limited to the
existing 160ms feedback transitions and one-pixel button press.

## Protected contracts

The refinement must not change:

- `llms.txt`, `robots.txt`, `sitemap.xml` or the Google verification file;
- URL structure, canonical URLs, route IDs or primary navigation labels;
- JSON-LD semantics;
- published rates, dates, source claims or statutory explanations;
- shared disclaimer counts and exact protected boundary text;
- the levy engine in `assets/levy.mjs` or any calculator arithmetic;
- supported install commands;
- the no-client-data, no-lodgement and mandatory-human-review boundaries.

Only fabricated calculator inputs may be used for screenshots and browser
tests.

## Accessibility and failure states

- Preserve one skip link, one labelled primary navigation, one `main#main` and
  one `h1` on every indexable page.
- Preserve at least 3:1 focus-indicator contrast and WCAG AA text/control
  contrast.
- Keep interactive targets at least 44 CSS pixels where they stand alone.
- Do not hide any route or tool behind hover, animation or client-side state.
- Keep the calculator's existing inline validation, error announcements,
  ready-to-calculate empty state and polite result announcement.
- Confirm no horizontal page overflow at 320, 390, 768 and 1440 CSS pixels.
- Confirm keyboard access to the mobile navigation and catalogue index.
- Retain reduced-motion and forced-colours behaviour.

## Test-first implementation

Before production changes, focused tests must fail for the missing behaviours:

1. source-contract tests for one homepage route link per destination, the trust
   band, reduced ordinal-label cadence, the catalogue index and unchanged
   protected content;
2. calculator source/style tests for result rows, tabular values and the compact
   method register;
3. Playwright assertions that route words do not wrap, all route links remain
   reachable, result labels and values are visually separated, the proof image
   loads through the explicit scroll/complete/natural-width/decode sequence,
   mobile navigation can be traversed by keyboard and no tested page overflows
   horizontally;
4. updated desktop and mobile visual baselines after the focused assertions
   pass.

At the recorded 390 by 844 mobile viewport, the first calculator branch
fieldset must begin inside the initial viewport before any scroll. Playwright
checks its bounding-box top is less than 844 CSS pixels after fonts settle.

`DESIGN.md`, the design-contract checks and their focused tests are updated to
encode the accepted hero, proof-asset and result-ledger contracts. Protected
factual baselines are not regenerated merely to make a changed value pass.

The completed implementation must pass:

```text
python scripts/check_site.py
npm run test:browser
npm run test:lighthouse
python scripts/verify_protected_files.py a2b4ab715044c3656edc1619379c37ea66a969a4
git diff --check
```

Browser health checks continue to reject page errors, error-level console
messages, failed requests and HTTP responses of 400 or higher. Lighthouse must
continue to pass every configured assertion, with LCP below 2.5 seconds and no
material CLS or blocking-time regression.

## Acceptance criteria

The refinement is complete when:

- the homepage exposes one, and only one, Engage/Adopt/Verify route register;
- the legal boundary and evidence scope remain immediately adjacent to the
  hero without competing with its statement;
- the desktop masthead has two deliberate lines and no route word breaks;
- the Coal LSL proof is a current, decoded, readable and fabricated-data-only
  artefact;
- the calculator task begins earlier and its result reads as an inspectable
  ledger at 320 through 1440 CSS pixels;
- catalogue categories and primary navigation are keyboard reachable without
  creating page overflow;
- the principles have a differentiated five-cell composition;
- decorative ordinal labels are removed while evidence-bearing labels remain;
- every protected contract and relevant automated gate passes;
- no unrelated file, external account, live site or publication state changes.
