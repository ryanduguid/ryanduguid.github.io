# Proof-led portfolio redesign

**Status:** Approved by Ryan Duguid on 26 August 2026
**Date:** 26 August 2026
**Source baseline:** `825b5f601f814cfc30c64e6af796fe681e44852d`

## Objective

Redesign `ryanduguid.github.io` as a proof-led technical portfolio. The site
must establish Ryan Duguid as a technical authority in Australian
computational accounting for two equally important audiences:

- Australian accounting practitioners and finance leaders assessing whether
  the work is trustworthy and useful
- open-source developers and AI builders assessing the system design,
  boundaries and inspectable evidence

The site remains a static GitHub Pages project built with native HTML, CSS and
the existing browser-side calculator JavaScript. The work does not introduce a
framework, build pipeline, third-party font, analytics service or new runtime
dependency.

## Reconciliation with current main

The live audit and early wireframes used commit `aff3d80`. While the design was
being reviewed, main advanced first to `a4b235c`, then to `825b5f6`. The first
commit introduced first-person home and About copy, a two-command install
panel, a fourth architecture layer for review controls and stricter ItemList
validation. The second published the direct aus-accounting-mcp PyPI route and
added SEO self-checks that prevent the stale pre-release claim from returning.

This specification treats `825b5f6` as the source baseline and retains that
newer work. It makes two small reconciliations to the approved wireframe:

1. The layered system map has four layers, not the three shown in the first
   wireframe. Review Controls remains distinct from Agent Workflows.
2. The hero claim uses first person: "I build accounting systems that can show
   their work." Ryan's name remains visible in the site identity and metadata.

The approved proof-led direction, page hierarchy, calculator pattern and
verification boundary are otherwise unchanged. Before implementation, fetch
main again and stop for reconciliation if the remote source has advanced.

## Success criteria

The implementation is successful when all of the following are true:

- The first desktop viewport identifies Ryan, states what he builds, gives an
  evidence route and shows the three trust signals: primary sources, exact
  currency arithmetic and human review.
- The homepage presents the full system as four connected layers. It does not
  return to a catalogue of repeated bordered cards.
- Every current public tool, rate, source, repository and navigation route
  remains reachable through visible HTML.
- The first-person positioning, two install commands and current four-layer
  content from `a4b235c` remain.
- About, Evidence, tool and rate pages share a clear reading system without
  losing page-specific copy, disclaimers, sources or review dates.
- The Coal LSL calculator is easier to scan with a keyboard or at a narrow
  viewport, while its calculation contract and output remain unchanged.
- All existing logic, link and search checks pass. New structural checks for
  landmarks and skip navigation also pass.
- There is no horizontal page overflow at 390, 768 or 1440 CSS pixels.
- Focus is always visible, navigation links are not hidden on mobile and the
  design respects `prefers-reduced-motion`.
- No remote branch, pull request or Pages deployment is created without a
  separate approval.

## Design read and dials

This is a preserve-mode professional portfolio with a dark, trust-first
technical language. It should feel editorial and deliberate, not like a SaaS
landing page or an application dashboard.

- `DESIGN_VARIANCE`: 6
- `MOTION_INTENSITY`: 3
- `VISUAL_DENSITY`: 4
- Theme: dark only

The approved direction is proof-led editorial. Proof appears beside claims,
real project material replaces decorative interface mockups and the system map
does the main explanatory work.

## Visual system

### Colour

Retain the established palette:

| Token | Value | Use |
| --- | --- | --- |
| Background | `#04001F` | Page background |
| Surface 1 | `#140E24` | Quiet panels and code areas |
| Surface 2 | `#1E1236` | Layer distinction |
| Surface 3 | `#2D184E` | Strongest layer distinction |
| Accent | `#5C2D91` | Primary actions and selected states |
| Accent light | `#9F6FD8` | Links, focus and technical labels |
| Text | `#ECECEC` | Primary text |
| Muted text | `#B1AFAD` | Supporting text |
| Border | `#4F485E` | Dividers and control boundaries |

Purple is the existing brand accent and is therefore retained. No second accent
colour, gradient, section-specific theme or light mode is added. Colour must
not be the only indication of a link, focus state, error or selection.

### Typography

Use the local system sans stack for all reading text and a local system mono
stack for small technical labels, dates and status text. Do not download fonts.

- Wide display headings use tight line-height and modest negative tracking.
- Body copy uses a comfortable line-height and a maximum reading width of
  about 65 characters.
- Technical labels are small but remain at least 12 CSS pixels in the shipped
  interface.
- Body links are underlined. Navigation and action links gain an underline or
  border change on hover and focus.

### Spacing and shape

Use an 8-pixel base rhythm with the main sequence `8, 12, 16, 24, 32, 48, 72`.
The wide site shell is at most 1180 pixels with responsive side gutters. The
reading shell is at most 65 characters.

Structural sections normally use square edges and dividers. Controls use an
8-pixel radius. Major framed artefacts may use a 12-pixel radius. Do not create
pill-shaped text containers or give every content block a rounded border.

### Motion

Motion is limited to short colour, underline and border transitions on
interactive controls. Nothing animates automatically and no scroll-triggered
reveal is added. `prefers-reduced-motion: reduce` removes non-essential
transitions.

## Static-site architecture

There is no component runtime, so the component contract is expressed through
consistent semantic markup and CSS classes.

Every indexable page receives:

1. a skip link targeting `#main`
2. a `site-header` containing the Ryan Duguid identity and a labelled `nav`
3. the exact navigation labels `About`, `Evidence`, `AI agents`, `GitHub` and
   `Awesome List`
4. one `main` element with `id="main"`
5. one page-specific `h1`
6. a shared footer containing the current advice boundary and review metadata

The navigation remains plain HTML. At narrow widths it wraps or scrolls
horizontally with all five labels visible. It does not use a JavaScript menu and
does not hide GitHub or Awesome List.

`assets/site.css` remains the single stylesheet. Organise it into clear source
sections for tokens, reset and base styles, shared shell, homepage, article
pages, tables and code, calculator, utilities, responsive rules and reduced
motion. Use scoped classes such as `home-*`, `article-*` and `calculator-*`
rather than adding more broad descendant selectors.

The 404 page uses the shared header, main and footer shell. It keeps `noindex`
and its current structured-data exemption, and it must not gain a canonical or
enter the sitemap.

## Homepage

### Global header

The header contains the Ryan Duguid identity and the five existing navigation
links. The identity links home on inner pages. The active section uses
`aria-current="page"` where applicable.

### Hero

The hero uses a two-column desktop layout and becomes one column on narrow
screens. Its primary copy is fixed as:

- Kicker: `Australian computational accounting`
- Heading: `I build accounting systems that can show their work.`
- Supporting line: `Open-source tools grounded in Australian rules, exact
  currency arithmetic and human review.`
- Actions: `Evidence` and `AI agents`

The adjacent proof rail contains three short items:

- Primary sources
- Exact currency arithmetic
- Human review

The hero does not contain a dashboard mockup, decorative chart, rotating copy
or a third call to action.

### Credentials

A divided band immediately below the hero retains the three current facts:

- Provisional Member CA ANZ
- SAP S/4HANA FI and CO
- Xero L3 Specialist

These are plain text facts, not pill badges.

### Four-layer system map

The system map replaces both the repeated tool-card catalogue and the separate
stack of repository cards. It keeps the content and links, but groups them into
four full-width editorial bands:

1. Data and Ledgers
2. Rules and Engines
3. Agent Workflows
4. Review Controls

Each band contains its current repositories, current descriptions and relevant
tool-page route. The desktop bands use progressive left insets of 0, 24, 48 and
72 pixels to show the flow. At widths below 900 pixels, all four become full
width.

The map must retain these current groupings from `a4b235c`:

- Data and Ledgers: `xero-trial-balance-export`,
  `accounting-excel-toolkit`
- Rules and Engines: `Ozzit`, `TheExchequerTally`, `SolomonsSword`,
  `payday-super-checker`, `ato-benchmark-compare`, `TheWIPTally`
- Agent Workflows: `au-tax-mcp-server`, `australian-accounting-skills`,
  `hardhat-ledger`, `DrDebits`, `xero-ai-review-gateway`
- Review Controls: `review-ready-gate`, `monthly-close-control-plane`

The ten public tool routes represented by the homepage ItemList remain visible.
The Coal LSL calculator leads the proof-artefact section and does not appear as
a repository in the map.

### Install band

Retain the current `Install in 2 commands` content after the system map. Keep
the exact MCP and skills commands, with one explanatory label for each. This is
the main adoption action for the developer audience, but it does not displace
the Evidence action in the hero.

### Proof artefact

Use one authentic Coal LSL calculator image, captured from the existing public
tool with clearly labelled synthetic inputs and output. Store an optimised WebP at
`assets/coal-lsl-calculator.webp`, keep it below 300 KB and include useful alt
text. The image is evidence of the real project, not a fabricated interface.
No information needed to understand a claim may exist only inside the image.

Pair the image with the heading `Proof belongs beside the claim`, a short
explanation and direct links to the Coal LSL calculator, Evidence index and
relevant public records.

### Principles, more index and footer

Retain the four current principles with the newer `Exact Currency Arithmetic`
wording:

- Primary Source Grounding
- Exact Currency Arithmetic
- Local Privacy Boundaries
- Human-in-the-Loop Signoff

Present them as four columns separated by rules, not four cards. Retain the
current More links in a compact text index. Retain the advice boundary, About
link, GitHub link and last-reviewed text in the footer.

The homepage JSON-LD remains semantically equivalent. Its ItemList continues to
contain ten sequential items whose visible routes remain on the page.

## Inner-page reading system

About, Evidence, rate notes and non-calculator tool pages use one shared article
pattern:

- a compact page header with an optional technical kicker, one `h1`, the
  existing short answer and review or status metadata
- a reading column of about 65 characters
- an optional local contents rail only when the page has at least three useful
  destinations
- quiet dividers between major sections rather than bordered cards around each
  block
- sources, related links, publication date, review date and byline kept close
  to the content they qualify

On mobile, local contents move above the article. Nothing is sticky.

### About

Preserve the first-person copy from `a4b235c`, the disambiguation statement,
credentials, authored software, grounding principles, no-client-work boundary,
citation text and the single canonical Person record. Keep the facts as a
semantic table and restyle its rows without removing a fact.

### Evidence

Preserve every current evidence row, source, limitation and structured-data
invariant. Use evidence rows with clear labels and direct inspect links. Dates
and proof type are factual metadata, not decorative badges.

### Tool and rate pages

Preserve the exact public answers, sources, worked examples, disclaimers,
related links and review text. Reference rates remain semantic tables and CSV
links remain visible. At narrow widths, wide tables sit in labelled scroll
regions rather than forcing page overflow.

No page gains a contact form, engagement offer or advice claim as part of this
redesign.

## Coal LSL calculator

### Presentation

The calculator header keeps its existing `h1`, short answer, explanation, rate,
review date and estimate-only status. On desktop, the form and result occupy two
columns inside one task workspace. In DOM order, the form comes first and the
result second. On mobile they become one column in the same order.

The form keeps the current sequence:

1. payment branch
2. branch-specific fields
3. salary sacrificed amount
4. bonuses
5. calculate action

Every current field `id`, `name`, label, radio value, template, bonus control
and explanatory note remains. Labels sit above inputs except for radios and
checkboxes, where the label wraps the control and text.

### States

- Initial: the result region says what will appear after calculation. It does
  not invent sample output.
- Invalid: an inline message appears beside or below the invalid field,
  `aria-invalid` and `aria-describedby` are set, and focus moves to the first
  invalid field. Do not use a toast.
- Valid: eligible wages lead, followed by levy, branch applied, Formula A and B
  where relevant, and the existing plain-language reason.
- Loading: none. The calculation is synchronous.

The result region uses an appropriate live-region setting so a submitted result
is announced without repeatedly announcing ordinary form edits.

### Employee workflow and long-form material

Place `Employees this month` after the form and result workspace. Preserve
insertion order, add, remove, totals and CSV export. At narrow widths, the table
scrolls inside a labelled region. Do not introduce sorting or persistence.

The disclaimer, unresolved questions, rounding explanation, FAQ, sources,
related links, dates and byline follow the employee workflow in a normal reading
column. Their text and legal meaning remain unchanged.

### Engine boundary

`assets/levy.mjs` remains unchanged. The redesign may edit only the inline UI
controller needed to render the approved empty, invalid and result states. It
must continue passing the same form data into the existing engine and rendering
the same computed values.

No formula, rate, rounding rule, branch treatment or unresolved legal question
is changed or inferred.

## Search, identity and content contracts

The implementation must preserve:

- every current public route and canonical
- `https://duguid.com.au/about/#person` as the canonical Person ID
- exactly one Person record on About
- homepage Website, WebPage and ten-entry ItemList relationships
- evidence-page invariants enforced by `scripts/check_seo.py`
- the visible aus-accounting-mcp PyPI route, direct install command, version
  `0.1.5` metadata and stale-release-claim self-checks
- FAQ visibility, worked-example and source checks
- sitemap and `llms.txt` coverage
- the current robots allow and block policy
- `404.html` as non-indexable
- all current disclaimers and the absence of a contact form
- Australian English and the repository ban on em and en dashes

Structured-data scripts may move with their containing page but should not be
rewritten merely for formatting. Update a visible review date and its matching
`dateModified` only when the page content has materially changed.

Extend `scripts/check_seo.py` with stable structural assertions for one
`main#main`, one labelled navigation landmark and a skip link targeting `#main`
on each indexable page. Update the checks list in `README.md` to match. Do not
turn CSS class names or visual layout details into test contracts.

## Accessibility and responsive behaviour

- Use semantic `header`, `nav`, `main`, `article`, `section`, `aside` and
  `footer` elements where their meanings apply.
- Preserve one `h1` per page and a logical heading sequence.
- Show the skip link when focused.
- Use a visible 2-pixel accent-light focus ring with clear separation from the
  control edge.
- Keep controls and standalone navigation actions at least 44 CSS pixels tall
  or wide. Inline reading links are exempt and instead use sufficient line
  height and spacing.
- Keep form labels programmatically associated and errors linked to their
  fields.
- Underline reading links and never depend on colour alone.
- Give informative images useful alt text and decorative images empty alt text.
- Keep all navigation labels available without JavaScript.
- Avoid fixed positioning that can cover content at zoomed or mobile sizes.
- Ensure all content remains usable at 200 per cent browser zoom.

The primary inspection widths are 1440 by 900, 768 by 1024 and 390 by 844 CSS
pixels. These are review sizes, not device-specific layout targets.

## Planned file boundary

Expected implementation edits are:

- `assets/site.css`
- `index.html`
- `about/index.html`
- `evidence/index.html`
- all three `rates/*/index.html` files
- all ten `tools/*/index.html` files
- `404.html`
- `tools/coal-lsl-levy/index.html` inline presentation controller
- `scripts/check_seo.py`
- `README.md`
- new `assets/coal-lsl-calculator.webp`

`assets/levy.mjs`, the CSV data files, `robots.txt`, `sitemap.xml` and
`llms.txt` are protected from change unless verification proves that a required
contract cannot otherwise be preserved. Such a finding requires a design
revision before editing those files.

## Verification

### Automated

Run from the repository root:

```text
node --test scripts/levy.test.mjs
python scripts/check_links.py
python scripts/check_seo.py
```

The source baseline passes all 20 levy tests plus the complete link and SEO
checks. The redesigned source must do the same, with the new landmark checks
included.

### Browser and keyboard

Serve the repository locally and inspect at least:

- homepage at all three review widths
- About and Evidence at desktop and mobile widths
- one ordinary tool page and one rate table at desktop and mobile widths
- Coal LSL calculator empty, invalid and valid states at desktop and mobile
- employee add, remove, total and CSV workflow
- 404 page

For each page, check layout overflow, focus visibility, heading order, link
underlines, readable measure, console errors and reduced-motion behaviour.
Complete the header, calculator and employee workflow with a keyboard only.

### Taste preflight

Before handoff, inspect the result against the approved design constraints:

- no gradients or extra accent colours
- no automatic motion
- no large display type inside every section
- no return to repeated equal cards
- no excessive pills or arbitrary radius changes
- no fake interface image
- hero stays within the approved content limit and first-viewport height
- all four system layers collapse cleanly on mobile
- dark theme stays consistent from header to footer

### Handoff

Provide a precise file summary, automated check output and desktop and mobile
screenshots. Keep changes local until Ryan separately approves any GitHub push,
pull request or Pages publication.

## Out of scope

- New accounting calculations or legal interpretations
- A framework, static-site generator or component build step
- A light theme or theme switcher
- A contact form, client intake flow or engagement offer
- Search, analytics or third-party tracking
- New case studies, testimonials or adoption claims
- Repository, package or GitHub profile changes outside this site
- Remote publication without a separate approval
