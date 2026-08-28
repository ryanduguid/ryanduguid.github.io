# duguid.com.au design system

**Status:** implementation baseline
**Date:** 28 August 2026
**Source baseline:** `2ae414da852dd9d3e3c022282845e5838138c5c7`

## Design read

This is a redesign-overhaul of an Australian computational accounting index for accounting managers, technical adopters and reviewers. It needs the authority of a public register, the legibility of a statute note and the inspectability of a developer tool. It must not read as a tax-agent practice, a SaaS funnel or an AI product launch.

- `DESIGN_VARIANCE`: 6. Asymmetric document layouts and large changes of scale, with strict mobile collapse.
- `MOTION_INTENSITY`: 3. Sticky positioning and short interaction feedback only.
- `VISUAL_DENSITY`: 5. Spacious route viewports followed by compact evidence, rate and catalogue surfaces.
- Redesign mode: overhaul the visual language while preserving routes, facts, legal boundaries and structured data.
- Theme: one coherent ledger palette in light and dark system modes.

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

### Light system mode

| Token role | Value | Use |
| --- | --- | --- |
| Canvas | `#E9EEEB` | Browser edge and quiet section ground |
| Paper | `#F8FAF8` | Main reading surface |
| Paper raised | `#FFFFFF` | Tables and artefacts that need separation |
| Ink | `#14211E` | Main text and solid controls |
| Ink soft | `#45534F` | Supporting copy |
| Rule | `#BCC7C2` | Hairlines and table rows |
| Rule strong | `#74857F` | Structural boundaries |
| Stamp | `#006B59` | Links, focus, route state and evidence mark |
| Stamp strong | `#005246` | Hover and filled controls |
| Stamp wash | `#D7E9E3` | Rare evidence emphasis |
| Alert | `#833E36` | Refusal and warning semantics only |
| Masthead | `#006671` | Homepage identity statement only |
| Code | `#101B18` | Code and install background |
| Code ink | `#EFF7F3` | Code text |
| Code comment | `#A9B8B3` | Secondary annotation inside code blocks |

### Dark system mode

The dark mode uses the same hierarchy and never introduces another section theme. Paper becomes deep green-charcoal, the stamp becomes pale harbour green and all text meets WCAG AA.

No gradient, glow, indigo, violet or pure black is permitted.

## Typography and licence

The site uses IBM Plex from the official [IBM Plex repository](https://github.com/IBM/plex).

- IBM Plex Serif Regular and SemiBold: display and section headings. The serif is justified by the statute, ledger and public-record context.
- IBM Plex Sans Regular, Italic and SemiBold: navigation, body copy, controls and explanatory text.
- IBM Plex Mono Regular: rates, commands, versions, dates, evidence labels and tabular figures.

IBM Plex is licensed under the SIL Open Font License 1.1. The licence permits use, embedding, modification and redistribution, including bundling with commercial software, provided the font is not sold by itself and the licence and copyright notice travel with it. The repository self-hosts WOFF2 files and includes `assets/fonts/OFL.txt`.

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
| Display | 48 to 96px | Homepage hero |
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

The existing advice disclaimer remains exact. It sits above About and GitHub links with a strong top rule. Footer type remains readable at 200 per cent zoom.

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

- code uses one dark ink slab in both system modes
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

Pain first: a tool that has not been tested on fabricated data does not belong in a firm workflow. The two supported install commands and three evaluation packs are the proof. There is no trial funnel or signup language.

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

On mobile, the contents rail becomes a compact in-flow index. No body copy falls below 16px. Lines do not exceed the viewport. Inner-page HTML changes are limited to homepage and About copy plus any shared class needed for semantics; rate and evidence facts remain untouched.

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

The following source baseline values are frozen after normalising only platform line endings:

- `llms.txt`: SHA-256 `4133A06AEEF0CDF1D014D49C61051A80365A1F2680DBBB874A1C5C658376C3A5`
- `rates/super-guarantee/index.html`: SHA-256 `599D554FB2BC1A1B1D171297AFA62C5AD743BA056C90DFE7DB9B383EC26D0C5C`
- `rates/div7a-benchmark-rate/index.html`: SHA-256 `E89020E290F4CF374F41B40092BEB53B93F551C00FF9365264B0B9DF83C9E162`
- `rates/cents-per-kilometre/index.html`: SHA-256 `FEDF9165A492C614A447D1F7FA55809B8917BB1DDB4802BCECA01039299552D7`

Every JSON-LD block across all 21 HTML pages remains semantically unchanged. Existing footer disclaimers, owner-assertion language, engagement boundary, calculator disclaimer, human review statements and Division 7A refusal remain exact.

Routes, canonical URLs, `#engage`, `#adopt`, `/evidence/`, sitemap coverage, robots policy, calculator arithmetic, evaluation fixtures and supported install commands remain unchanged.

## Accessibility and performance

- one skip link, one labelled primary navigation and one `main#main` on every indexable page
- logical heading order and one `h1` per page
- visible focus with at least 3:1 contrast against adjacent colours
- body text and controls meet WCAG AA contrast
- touch targets are at least 44px where they are standalone actions
- no horizontal page overflow at 390, 768 or 1440 CSS pixels
- no layout jump from unsized media or late decorative content
- WOFF2 only, no remote font request and no new JavaScript dependency
- system dark mode and light mode are both inspected
- reduced-motion mode is inspected

## Verification

Automated checks cover the design system, font assets, homepage structure, copy ban list, protected hashes, JSON-LD parity, disclaimer parity, routes and all existing repository contracts.

Browser review covers homepage, About, Evidence, a tool guide and a rate table at desktop and mobile sizes. It also checks 200 per cent zoom, keyboard focus, overflow, computed fonts, console errors, reduced motion and both colour schemes.

The pull request must name the three selected gold-standard references, the supplementary Pliny influence, IBM Plex licence, copy changes and the deliberate refusals: no sales funnel, no intake form, no mascot, no purple or Pliny-style gradient, no generic CTA and no altered rates or advice boundaries.
