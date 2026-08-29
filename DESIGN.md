# duguid.com.au design system

**Status:** current refinement
**Date:** 29 August 2026
**Source baseline:** `adb31c63f17e608545197a703d3823c2cb3ca7f3`

## Design read

This is a targeted, preservation-led evolution of an Australian computational accounting index for accounting managers, technical adopters and reviewers. It needs the authority of a public register, the legibility of a statute note and the inspectability of a developer tool. It must not read as a tax-agent practice, a SaaS funnel or an AI product launch.

- `DESIGN_VARIANCE`: 6. Asymmetric document layouts and large changes of scale, with strict mobile collapse.
- `MOTION_INTENSITY`: 2. Sticky positioning and brief colour, underline and control feedback only.
- `VISUAL_DENSITY`: 5. Spacious route viewports followed by compact evidence, rate and catalogue surfaces.
- Redesign mode: preserve the established visual language and refine only the surfaces that need clearer hierarchy or evidence.
- Theme: OLED dark only.

## Current refinement record

The 29 August 2026 refinement keeps the design read at
`DESIGN_VARIANCE: 6`, `MOTION_INTENSITY: 2` and `VISUAL_DENSITY: 5`.

- The homepage hero contains one Engage, Adopt and Verify route register. A
  separate trust band follows it, and the route words do not wrap on wide
  screens.
- The current Coal LSL proof is a deterministic, fabricated Formula B
  result-only screenshot. `npm run capture:coal-lsl-proof` captures it at 868
  by 580 pixels and caps the WebP output at 80 KB.
- Calculator orientation uses one concise task sentence followed by a compact
  rate, method and boundary register. Its output is a label and value result
  ledger.
- The catalogue has a category index. The principles use an asymmetric
  five-cell composition with one lead cell, and mobile primary navigation is
  one horizontal scroll row.

The deliberate brand exceptions remain: a true-black, dark-only canvas; IBM
Plex Serif as the display face; stamp green as the only accent; square register
surfaces; 2px control radius; and no generated or stock imagery.

## Current-state audit

The live audit covered the homepage, Workpaper Review Gate, Super guarantee rate history and Evidence and Assurance at 1440 by 900 and 390 by 844 CSS pixels.

The existing content is strong. The repeated visual grammar weakens it:

- the system sans stack is anonymous and gives headings, body copy and navigation the same texture
- the dark indigo and violet palette resembles an AI product interface
- the first route choice is three equal rounded cards
- Engage, Adopt and Verify repeat the same rounded panel
- four system layers repeat the same panel geometry and internal rhythm
- ten tools repeat the same ruled row without useful grouping
- the homepage is 6,232 CSS pixels tall on desktop and 9,559 CSS pixels tall on mobile
- the mobile page turns the four system layers and ten tools into a long undifferentiated column
- evidence, warning, source and legal material depend mostly on a purple left border
- code, tables and citations inherit the same product-panel treatment rather than looking like inspectable records

The redesign keeps the real Coal LSL screenshot as the main visual artefact. It does not add generated imagery, stock photography, a mascot or an abstract AI illustration. For this evidence site, a real project artefact is stronger proof than decorative imagery.

## Reference sweep

Ten Refero styles and their live sites were fetched on 28 August 2026.

| Refero style | Live site | Decision |
| --- | --- | --- |
| Steep | <https://steep.app> | Useful editorial data hierarchy, but its warm paper and soft cards are too close to a current AI design fashion. |
| Linear | <https://linear.app> | Selected for one-thought viewport pacing and restrained sticky navigation. |
| Ui | <https://ui.shadcn.com> | Selected for documentation rails, code blocks and dense component indexing. |
| Notion | <https://notion.so> | Rejected because the friendly workspace register is too broad for evidence and statutory rates. |
| Dub | <https://dub.co> | Rejected because attribution-product cards and pill controls read as SaaS. |
| Slash | <https://www.slash.com> | Useful banking register cues, but its sales-led product framing is too strong. |
| Awesomic | <https://www.awesomic.io> | Rejected because the talent-marketplace register is promotional. |
| AI for Business | <https://www.dayos.com> | Rejected because its AI positioning is the category this site must avoid. |
| Mercury | <https://mercury.com> | Selected for serious financial tone, visible boundary copy and decisive section scale. |
| General Intelligence Company | <https://www.generalintelligencecompany.com> | Rejected because its literary AI identity does not fit public-practice review tools. |

### Gold-standard references

1. [Linear on Refero](https://styles.refero.design/style/90ce5883-bb24-4466-93f7-801cd617b0d1) and [Linear](https://linear.app)
   - Borrow: one proposition per viewport, quiet sticky navigation and strong changes in scale.
   - Do not borrow: black product theatre, blurred launch motion or product screenshots.
2. [Mercury on Refero](https://styles.refero.design/style/3172cd4d-118a-4a16-a259-6b634d32322e) and [Mercury](https://mercury.com)
   - Borrow: financial authority, clear disclaimer placement and a section that resolves in one screen.
   - Do not borrow: lifestyle imagery, email capture, pills or banking-sales language.
3. [Ui on Refero](https://styles.refero.design/style/0fd67ec5-7e9c-4ca9-b368-5d9c7388477a) and [shadcn/ui documentation](https://ui.shadcn.com/docs)
   - Borrow: sticky local contents, direct code presentation, narrow reading measure and compact index density.
   - Do not borrow: its monochrome component-library appearance or default card styling.

### Supplementary reference requested during implementation

[Pliny](https://pliny.gg/) adds one useful aesthetic layer without replacing the three gold-standard references.

- Borrow: the centred ceremonial masthead, near-black green field, cold luminous title colour, compact mono index labels and fine ruled geometry.
- Translate: the project index becomes a public accounting register, and the display serif stays IBM Plex rather than copying Pliny's typeface.
- Refuse: gradient lettering, scanlines, constellation ornament, hacker glyph substitutions, novelty motion and its three-column project-card grid.

The resulting system is unique to duguid.com.au: a cold ledger surface, harbour-green review stamp, IBM Plex type family, tabular evidence chrome and route viewports built around Engage, Adopt and Verify.

## Visual premise

The page behaves like a public workpaper register.

- large serif statements carry the judgement or pain
- sans body copy explains the action in one reading pass
- mono labels carry source, date, version, rate and status
- rules organise records; rounded containers do not organise the page
- green is a review stamp, not a glow or decorative gradient
- every evidence claim keeps its source beside it
- every refusal says what the tool will not do in plain language

## Colour

All colour values live in `assets/tokens.css`. Component CSS consumes semantic tokens only.

The palette is deliberately dark-only. Native controls use `color-scheme: dark`
and no system preference creates a second branded state.

| Token role | Value | Use | Contrast on canvas |
| --- | --- | --- | ---: |
| Canvas | `#000000` | Browser edge and dominant page ground | n/a |
| Paper | `#050806` | Quiet grouped surfaces | n/a |
| Paper raised | `#09100D` | Rare stronger hierarchy | n/a |
| Ink | `#EEF4F0` | Main reading text | 18.83:1 |
| Ink soft | `#9AA89F` | Supporting copy and metadata | 8.48:1 |
| Rule | `#26332D` | Hairlines and table rows | n/a |
| Rule strong | `#5C7166` | Structural boundaries | n/a |
| Stamp | `#4DFF88` | Links, focus, route state and live evidence | 15.98:1 |
| Stamp strong | `#78FFA3` | Hover and filled controls | n/a |
| Stamp wash | `#082619` | Rare evidence emphasis | n/a |
| Alert | `#FF9C91` | Refusal and warning semantics only | 10.42:1 |
| Masthead | `#EEF4F0` | Homepage identity statement only | n/a |
| Code | `#020403` | Code and install background | n/a |
| Code ink | `#EEF4F0` | Code text | n/a |
| Code comment | `#9AA89F` | Secondary annotation inside code blocks | n/a |

True black is intentional: large canvas areas let OLED pixels switch off. This
overrides the earlier pure-black prohibition. No gradient, glow, indigo,
violet, texture or alternate theme is permitted.

## Typography and licence

The site uses IBM Plex from the official [IBM Plex repository](https://github.com/IBM/plex).

- IBM Plex Serif Regular and SemiBold: display and section headings. The serif is justified by the statute, ledger and public-record context.
- IBM Plex Sans Regular, Italic and SemiBold: navigation, body copy, controls and explanatory text.
- IBM Plex Mono Regular: rates, commands, versions, dates, evidence labels and tabular figures.

IBM Plex is licensed under the SIL Open Font License 1.1. The licence permits use, embedding, modification and redistribution, including bundling with commercial software, provided the font is not sold by itself and the licence and copyright notice travel with it. The repository self-hosts WOFF2 files and includes `assets/fonts/OFL.txt`.

The six files are IBM's unmodified Latin1 subsets from tag `v6.4.2`, peeled
commit `242c4cccd37e87985a5337815c99b960ef13c65c`. Exact upstream paths, byte
counts and SHA-256 values are recorded in `assets/fonts/SOURCES.md`. The
declared set is 129,872 bytes, down from 384,756 bytes. The four faces used by
the homepage total 84,268 source bytes before HTTP overhead, down from about
250 KB transferred. Four faces remain deliberate: Serif, Sans and Mono each
carry a distinct information role, while regular and semi-bold Sans preserve
the practical control and reading hierarchy without synthesised weight.

Font rules:

- no Inter, Roboto, Arial or generic system stack as the primary face
- one display family and one body superfamily, not mixed novelty emphasis
- headings stay at regular or semi-bold weight
- rates and numerical table columns use tabular numbers
- body measure is at most 68 characters
- body text is at least 16 CSS pixels
- font files use `font-display: optional` to prevent a late typeface swap

## Type scale

The token scale uses fluid clamps rather than one-off page values.

| Role | Range | Use |
| --- | --- | --- |
| Caption | 12 to 13px | Source type, review date, status |
| Body small | 14 to 15px | Table notes and secondary metadata |
| Body | 16 to 18px | Main reading copy |
| Lead | 19 to 23px | One-sentence explanation |
| Heading small | 24 to 32px | Article subsections |
| Heading | 36 to 56px | Section statement |
| Display | 36 to 88px | Global display token; the homepage masthead caps it at 80px, then at 32px for viewports up to 640px |
| Route | 64 to 132px | Engage, Adopt and Verify route word |

Display tracking is modestly negative except for the uppercase homepage masthead, which uses open tracking as a deliberate Pliny-influenced register mark. Body and mono tracking stay neutral. No all-caps eyebrow appears above every section.

## Spacing, shape and layers

- Base unit: 4px.
- Main sequence: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128px.
- Wide shell: at most 1360px with fluid gutters.
- Reading shell: at most 68ch.
- Header: at most 72px on desktop.
- Route section: at least the visible viewport minus the sticky header.
- Default radius: 0.
- Controls: 2px.
- Media and code: 4px.
- Pills: prohibited.
- Shadows: none for normal content. A one-pixel rule supplies hierarchy.
- Layer order: base, sticky header, sticky route rail, focused skip link.

## Motion

Motion communicates feedback and location only.

- links and controls use 160ms colour and underline transitions
- buttons move by one pixel on press
- the route rail stays sticky while its section scrolls
- no entry reveal, marquee, parallax, scroll hijack or perpetual animation
- `prefers-reduced-motion: reduce` removes smooth scrolling and non-essential transitions

## Shared chrome

### Header

The header is sticky, one line and at most 72px tall. Ryan Duguid appears as a text identity at left. Existing navigation labels and destinations remain exact. The header uses paper transparency only if contrast remains solid; no blur or glass treatment is allowed.

### Footer

The existing advice disclaimer remains exact. It sits above About, GitHub and Machine-readable index links with a strong top rule. Footer type remains readable at 200 per cent zoom.

### Buttons and links

- primary actions are dark ink or stamp green rectangles with 2px radius
- secondary actions are underlined text with a directional phrase
- labels describe the destination or action; no `Get started`
- one label maps to one intent across a page
- controls are at least 44px in the smaller dimension

### Tables

- captions or nearby headings state what the numbers mean
- headers use IBM Plex Sans SemiBold
- numerical columns use IBM Plex Mono and tabular numbers
- rules appear between rows, not around every cell
- the first and current rates receive typographic emphasis, not a coloured progress bar
- wide tables use labelled horizontal scroll regions at narrow widths
- no statutory value, date, source or citation changes in this redesign

### Code and install blocks

- code uses one near-black ink slab in the OLED theme
- a mono caption names the tool or command purpose
- there is no fake terminal title bar, traffic-light decoration or version footer
- commands remain selectable and horizontally scrollable
- install commands remain exact

### Warning and refusal callouts

- a 4px alert rule and an explicit `Refusal`, `Boundary` or `Review required` label carry meaning together
- no icon-only warning
- legal and professional boundaries remain exact
- Division 7A refusal remains visible on the Australian tax AI agents page

### Evidence and citation chrome

An evidence record has four ordered parts:

1. claim
2. primary source or released artefact
3. reviewed date or version
4. human decision boundary

Mono labels and rules bind those parts without turning them into rounded cards. Proof sits beside the claim on wide screens and immediately after it on mobile.

## Homepage architecture

The homepage uses stacked one-thought viewports and does not use scroll snapping.

### Hero viewport: who and what

The first viewport centres one ceremonial masthead above a ruled three-part register and answers three questions within five seconds:

- Ryan Duguid is a Newcastle accountant.
- He builds open-source accounting review tools.
- The site is not a lodgment or tax-agent service.

The only route choices are Engage, Adopt and Verify. The real Coal LSL artefact may appear as a cropped proof fragment, never as a fake dashboard.

### Engage viewport

Pain first: incomplete workpapers, review loops and unclear ownership. The action is to discuss the workflow without sending taxpayer information or client files. Existing enquiry categories and the exact engagement boundary remain.

### Adopt viewport

Pain first: a tool that has not been tested on fabricated data does not belong in a firm workflow. The three supported install commands and three evaluation packs are the proof. There is no trial funnel or signup language.

### Verify viewport

Pain first: a rate or AI answer without a source and review boundary cannot be relied on. Evidence and Assurance is the main destination. The viewport previews source, exact arithmetic, released artefact and human decision boundary.

### Catalogue

The tools remain visible but become a compact catalogue grouped by the work they stop or check:

- stop incomplete review packs
- catch late payment and rate errors
- reconcile ledgers and schedules
- ground and constrain AI workflows

The catalogue is not a second homepage essay. Each blurb names the pain or observable control in one sentence.

### Reference and principles

Rates and further references become one compact index. The five engineering principles read as working rules, not a marketing feature row.

## Inner-page system

About, Evidence, tool guides, evaluation packs and rate pages share one article frame:

- large page statement followed by one short answer
- sticky local contents on wide screens when it has at least three useful destinations
- 68ch reading column
- source and date metadata beside the relevant claim
- full-width table or code artefact where the content needs it
- footer boundary in the same position on every page

On mobile, the contents rail becomes a compact in-flow index. No body copy falls below 16px. Lines do not exceed the viewport. Shared head and footer delivery chrome may evolve across styled pages; rate main text, evidence facts and structured data remain untouched.

## Copy standard

Every changed visible sentence must pass these five principles:

1. One reading pass. A visitor can finish the claim without rereading it.
2. Pain first. Name the incomplete pack, late contribution, unbalanced trial balance or unsupported AI answer before the solution.
3. One ask per screen. Homepage route asks are Engage, Adopt or Verify only.
4. One viewport, one thought. Hero identifies; each route explains one action; catalogue indexes.
5. Visualise in the line. Prefer `READY is not sign-off` and `fund receipt within seven business days` to abstract quality claims.

Banned visible language includes: revolutionise, seamless, cutting-edge, leverage, unlock, delves, landscape, tapestry, in today's fast-paced, decorative AI-powered language, generic `Get started`, emojis, em dashes and en dashes.

Australian spelling is mandatory. Do not invent credentials, rates, endorsements, customers or outcomes.

## Protected contracts

The following whole-file values are frozen after normalising only platform line endings:

- `llms.txt`: SHA-256 `4133A06AEEF0CDF1D014D49C61051A80365A1F2680DBBB874A1C5C658376C3A5`
- `robots.txt`: SHA-256 `55445C95D41B8C8B1B386BFB1B1279B879954D66715747CDC0B10BFF3B5DD7EA`
- `sitemap.xml`: SHA-256 `2DD5D7F737A88E28136117706923FC070BC659FA2D34239820E6FD2AF633A51B`

Rate main text is protected by a semantic visible-text digest so shared head and
footer delivery chrome can improve without changing a rate, date, source or
explanation. Every JSON-LD block across the 19 indexable pages remains
semantically unchanged. Existing footer disclaimers, owner-assertion language,
engagement boundary, calculator disclaimer, human review statements and
Division 7A refusal remain exact.

Routes, canonical URLs, `#engage`, `#adopt`, `/evidence/`, sitemap coverage, robots policy, calculator arithmetic, evaluation fixtures and supported install commands remain unchanged.

## GEO and crawler policy

GEO here means truthful answerability, explicit entity context and nearby
evidence. It does not mean keyword stuffing or a Google ranking campaign.

- every indexable page exposes the unchanged `llms.txt` through a text/plain
  alternate link and every styled page exposes one visible Machine-readable
  index link
- no Google-specific ranking work or `noindex` is added to an indexable page
- ordinary crawlability remains available to people, search systems and answer
  systems
- search and user-retrieval crawlers remain allowed while GPTBot, ClaudeBot,
  Google-Extended, Applebot-Extended, CCBot and Bytespider remain blocked from
  training use
- `llms.txt`, JSON-LD, rates, disclaimers and refusal boundaries remain the
  factual source of truth

## Accessibility and performance

- one skip link, one labelled primary navigation and one `main#main` on every indexable page
- logical heading order and one `h1` per page
- visible focus with at least 3:1 contrast against adjacent colours
- body text and controls meet WCAG AA contrast
- touch targets are at least 44px where they are standalone actions
- no horizontal page overflow at 390, 768 or 1440 CSS pixels
- no layout jump from unsized media or late decorative content
- WOFF2 only, no remote font request and no new JavaScript dependency
- the continuous true-black OLED theme and forced-colours behaviour are inspected
- reduced-motion mode is inspected

The measured production baseline before this refinement is about 303 KB of
initial transfer: about 250 KB of fonts and about 46 KB from the below-fold
proof image. Under the recorded 390 by 844, four-times CPU and emulated 4G
profile, LCP is about 1.40 seconds and CLS is 0. The implementation must reduce
initial transfer materially without regressing the matched median LCP or CLS.

## Verification

Automated checks cover the OLED token contract, contrast, font assets, delivery
order, homepage image priority, machine-index discovery, copy ban list,
protected hashes, rate-main snapshots, JSON-LD parity, disclaimer parity,
routes and all existing repository contracts.

Browser review covers the homepage at 320, 390, 768 and 1440 CSS pixels plus
About, Evidence, a tool guide, calculator, rate table and 404 page at desktop
and mobile sizes. It also checks keyboard focus, overflow, computed fonts,
console errors, reduced motion, forced colours, font/image failure and the one
OLED colour scheme.

The pull request must name the three selected gold-standard references, the supplementary Pliny influence, IBM Plex licence, copy changes and the deliberate refusals: no sales funnel, no intake form, no mascot, no purple or Pliny-style gradient, no generic CTA and no altered rates or advice boundaries.
