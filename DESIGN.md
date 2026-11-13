# duguid.com.au design system

**Status:** current refinement
**Date:** 31 August 2026, revised 4 November 2026
**Source baseline:** `adb31c63f17e608545197a703d3823c2cb3ca7f3`

## Design read

The canonical routes, the dark-only token palette and the rate main text are frozen; this refinement changes only the surfaces around them. The readers are accounting managers, technical adopters and reviewers of an Australian computational accounting index. It needs the authority of a public register, the legibility of a statute note and the inspectability of a developer tool. It must not read as a tax-agent practice, a SaaS funnel or an AI product launch.

- `DESIGN_VARIANCE`: 6. Asymmetric document layouts and large changes of scale, with strict mobile collapse.
- `MOTION_INTENSITY`: 2. Sticky positioning and brief colour, underline and control feedback only.
- `VISUAL_DENSITY`: 5. Spacious route viewports followed by compact evidence, rate and catalogue surfaces.
- Redesign mode: preserve the established visual language and refine only the surfaces that need clearer hierarchy or evidence.
- Theme: OLED dark only.

## Design history

The dated refinement record, from 31 August to 4 November 2026, is in
[docs/design-history.md](docs/design-history.md). Where an entry there and a
section below disagree, the section below is current.

## 4 November 2026 redesign pass

On 4 November 2026 Ryan asked for this pass: 'The website can be significantly
improved'; 'Use the best UI/UX skills etc. that you can find to assist you in
significantly improving the website too please'; and 'Please consider the colour
palate and aesthetics of your work as applicable too'.

The pass treats each page as a reviewer's working file: content first, one
metadata line per item, the answer before its explanation and crimson only
where something needs action. Its rules:

- The homepage routes readers and demonstrates no tool. After the hero and the
  cash case, one router offers 3 routes, then one register lists the 3 latest
  tool releases. The Coal LSL calculator and its scripts stay on the calculator page.
- A tool page opens with a one-sentence lead and one metadata line from
  `_includes/tool-meta.html`: the current release and its date (or, for the
  Coal LSL calculator, its source revision), the repository and the page's
  published and reviewed dates. `site-tools check_design` allows at most one
  release statement before the first `h2`; pins and release history sit under
  the section they describe.
- Each Rates entry leads with its current value, in Spline Sans Mono at the
  small heading size, above the table name. The byline, source check note,
  Excel steps and feed link follow the register. Each rate page repeats that
  value above its `h1`, then its short answer, then its dates: Published,
  Last reviewed for the page's editorial check and Source checked for the CSV's
  `checked_at`, each in `<time>`. `_layouts/rate.html` renders all 7.
- Actions and wayfinding leave mono: navigation, breadcrumbs, contents, notes,
  links and buttons use Public Sans, and buttons set at body size. Spline Sans
  Mono keeps values, commands and the short labels of fact lists and stamps.
- The Human and Machine view switch is square, with the control radius, a thin
  strong rule on the canvas, soft-ink labels and the selected option on the
  stamp wash in full ink. Its labels stay at a fixed 12px, so enlarged text
  does not push it over the navigation. It has no shadow, blur or pill shape,
  and the Machine option tells screen readers what it shows.
- A link's red underline becomes a crimson fill with ivory text on hover.
  Buttons keep the deep purple hover.
- Reader copy writes 'fictional' for invented data. IDs, anchors, fixture names
  and code keep 'synthetic' or 'fabricated', so `#synthetic-worked-example`
  and `#fabricated-inputs` still resolve. `check_fictional_wording` enforces
  this, including the social-card alt text, now that the evaluations card
  reads 'Fictional inputs'.
- The 5 social cards (the `-20261104b` set) match the social previews of
  Ryan's GitHub repositories: a double dark gold (`#9B7735`) frame whose
  tabs carry the page address and Ryan Duguid between crimson brackets, the
  laptop emblem of the README banner, the context label in `#DADADA`, a gold
  rule, and the ivory Besley heading after a gold `>` prompt and before a
  gold block cursor. The emblem keeps the banner's colours, so dark gold and
  platinum (`#E5E4E2`) join the card palette. Ryan approved dark gold on
  4 November 2026 because it is in his diagram palette, where it draws
  subgraph frames (5.08:1 on black); it stays off the pages.
- The cash case's captions and plotted-value note write negative amounts
  in parentheses, as the chart labels do: '($25,160)'. Tables and
  calculator results keep the minus sign.
- The primary navigation has 5 links: Tools, Questions
  (`/tools/accounting-questions/`), Rates, Evidence and About. Ryan
  decided this on 4 November 2026. Evaluations and Contact leave the header
  but keep their pages, URLs and footer links; the About lead links
  Contact, and evaluation pages mark Tools as their location.
- Every page title is the page's own name, with no site suffix.
- The About lead states 'Provisional CA ANZ Member', 'Xero Certified
  Specialist, Level 3', the LinkedIn profile and the CA ANZ non-endorsement
  statement within the first screen at 1440 by 900.
- The cash chart's closing-cash line is platinum (`#E5E4E2`), 16.53:1 against
  black; the green line it replaces measured 2.07:1.
- Red `#E7162F` is no longer reserved for diagrams. Ryan decided on
  4 November 2026 that the site may use it, limited to link and rule
  strokes: `--colour-stroke` draws link underlines and the accent rules
  above the contents, evaluation summaries and calculator results, at
  4.55:1 on black against the 3:1 non-text minimum. Crimson `#990024`
  measured 2.38:1 in those roles. The changelog target underline and the
  checked setup tab border are strokes too, so they draw in red; fills stay
  crimson and link text stays ivory at 20.81:1.
- Dark gold and lavender stay out of the site.

The brand exceptions stand: a true-black, dark-only canvas; Besley as the
display face; crimson and deep purple accents; square register surfaces; 2px
control radius; and no generated or stock imagery, shadows, pills, blur or
entry animation.

## Current-state audit

The live audit covered the homepage, Workpaper Review Gate, Super guarantee rate history and Evidence and Assurance at 1440 by 900 and 390 by 844 CSS pixels.

The existing content is strong. The repeated visual grammar weakens it:

- the system sans stack is anonymous and gives headings, body copy and navigation the same texture
- the dark indigo and violet palette resembles an AI product interface
- the first route choice is 3 equal rounded cards
- the route sections repeat the same rounded panel
- 4 system layers repeat the same panel geometry and internal rhythm
- 10 tools repeat the same ruled row without useful grouping
- the homepage is 6,232 CSS pixels tall on desktop and 9,559 CSS pixels tall on mobile
- the mobile page turns the 4 system layers and 10 tools into a long undifferentiated column
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

[Pliny](https://pliny.gg/) adds one useful aesthetic layer without replacing the 3 gold-standard references.

- Borrow: the centred ceremonial masthead, near-black green field, cold luminous title colour, compact mono index labels and fine ruled geometry.
- Translate: the project index becomes a public accounting register, and the display serif (IBM Plex at this pass, Besley since 24 September 2026) is the site's own rather than Pliny's typeface.
- Refuse: gradient lettering, scanlines, constellation ornament, hacker glyph substitutions, novelty motion and its 3-column project-card grid.

The resulting system combines a cold ledger surface, a crimson action mark, one serif, sans and mono type system (IBM Plex at this pass; Besley, Public Sans and Spline Sans Mono since 24 September 2026), tabular evidence chrome and route viewports built around Adopt and Verify.

## Visual premise

The page behaves like a public workpaper register.

- large serif statements carry the judgement or pain
- sans body copy explains the action in one reading pass
- mono labels carry source, date, version, rate and status
- rules organise records; rounded containers do not organise the page
- crimson marks what needs action; no colour is a glow or decorative gradient
- every evidence claim keeps its source beside it
- every refusal says what the tool will not do in plain language

## Colour

All colour values live in `assets/tokens.css`. Component CSS consumes semantic tokens only.

The palette is deliberately dark-only. Native controls use `color-scheme: dark`
and no system preference creates a second branded state.

| Token role | Value | Use | Contrast on canvas |
| --- | --- | --- | ---: |
| Canvas | `#000000` | Browser edge and dominant page ground | n/a |
| Paper | `#000000` | Grouped surfaces, separated by rules alone | n/a |
| Paper raised | `#0A0A0A` | Fields and the proof panel | n/a |
| Ink | `#FFFFF0` (ivory) | Main reading text | 20.81:1 |
| Ink mid | `#C8C8C8` | Lead and route paragraphs | 12.55:1 |
| Ink soft | `#9A9A9A` | Supporting copy and metadata | 7.46:1 |
| Rule | `#262626` | Hairlines and table rows | n/a |
| Rule strong | `#606060` | Structural boundaries and field borders | 3.34:1 |
| Stamp | `#990024` | Fills and link hover fills | 2.38:1 (8.74:1 ivory on stamp) |
| Stamp strong | `#66023C` | Button hover fills and secondary emphasis with ivory text | 12.70:1 (ivory on stamp) |
| Stroke | `#E7162F` (red) | Link underlines, accent rules and selection marks only, from 4 November 2026 | 4.55:1 |
| Stamp wash | `#161616` | Applied formula and interactive emphasis | n/a |
| Pass | `#0F4B32` (Rhodesian green) | Passed-result labels with ivory text | 2.07:1 |
| Machine ink | `#E5E4E2` (platinum) | Machine view text and the cash chart line | 16.53:1 |
| Alert | `#FF9C91` | Refusal and warning semantics only | 10.42:1 |
| Masthead | `#FFFFF0` (ivory) | Homepage identity statement only | n/a |
| Code | `#000000` | Code and install background, bounded by its rule | n/a |
| Code ink | `#FFFFF0` (ivory) | Code text | n/a |
| Code comment | `#9A9A9A` | Secondary annotation inside code blocks | n/a |

True black is intentional: large canvas areas let OLED pixels switch off. This
overrides the earlier pure-black prohibition. From 13 September 2026 the
surfaces are true black rather than green-tinted near-black and the greys
carry no hue. Crimson and deep purple are the requested accents beside the
alert. From 1 October 2026 the main ink is ivory (`#FFFFF0`) rather than
near-white, which raises its contrast on canvas from 18.76:1 to 20.81:1. Rules, not fills, separate the header, footer, bands and code blocks.
No gradient, glow, texture or alternate theme is permitted.
The Machine view canvas is also true black so its text sits on switched-off
OLED pixels; its ink is platinum (`#E5E4E2`).
On the homepage, mid ink is platinum (`#E5E4E2`), soft ink and the inactive view-switch
label are `#DADADA`. Increased-contrast and print styles retain their overrides.
Printers drop background colours, so print maps the page's ink tokens, mid ink,
masthead and code ink included, to black on white, and a test holds every
visible text colour on every page to 4.5:1 against white paper.
The favicon seal and the social-card template draw lines in gold (`#FFD32A`),
the social-card frame in dark gold (`#9B7735`) and social-card text in ivory,
so their rasters are re-rendered whenever those values change.

## Typography and licence

On 24 September 2026 Ryan replaced IBM Plex with three families chosen after
a measured comparison: Plex had come to read as a generic AI-built site. The
comparison gated each candidate on the weights below, body tabular figures,
the `unicode-range` characters and command-safe mono shapes, then tested
the passing pairings on the live pages at 1440, 1280, 390 and 320 pixels.

- Besley Regular and SemiBold: display and section headings. Its Clarendon
  letterforms suit the statute, ledger and public-record context.
- Public Sans Regular, Italic and SemiBold: navigation, breadcrumbs, contents,
  links, buttons, body copy, controls, tables and explanatory text. Its `tnum` feature gives the body-font tables
  and calculator results aligned figures.
- Spline Sans Mono Regular: rates, commands, versions, dates, evidence labels
  and tabular figures. It sets at the width IBM Plex Mono did, and it has no
  ligatures that would rewrite `--` or `==` in a command.
- Ozzit's lambda symbol uses Cambria Math, STIX Two Math or DejaVu Serif, with
  the browser's serif fallback last. These native fonts need no download.
  Mark only the symbol with `function-symbol`; keep identifiers as selectable
  text. The font check still rejects unsupported characters outside that
  exact markup and requires its fallback styling and font stack.

All three families are licensed under the SIL Open Font License 1.1. The
licence permits use, embedding, modification and redistribution, including
bundling with commercial software, provided the font is not sold by itself and
the licence and copyright notice travel with it. The repository self-hosts
WOFF2 files beside one licence file per family (`assets/fonts/OFL-*.txt`).
None of the three declares a Reserved Font Name, so the site ships its own
subsets under the original family names; IBM Plex reserved "Plex", which is why
its files were never cut.

The 6 files are `pyftsubset` cuts of the upstream static TTFs, limited to the
characters the pages use. The upstream revisions, the exact command, byte
counts and SHA-256 values are recorded in `assets/fonts/SOURCES.md`; each face
declares the same characters as its `unicode-range`, which `site-tools check_design`
tests against every page. The declared set is 102,928 bytes, down from 129,872
for the Plex Latin1 splits. The 4 faces used by the homepage total 68,732
source bytes before HTTP overhead, down from 84,268, and all 4 are preloaded
so `font-display: optional` has every face by first paint. Four faces remain
deliberate: display, body and mono each carry a distinct information role,
while regular and semi-bold body weights preserve the practical control and
reading hierarchy without synthesised weight.

Besley sets about 8 per cent wider than Plex Serif. The homepage H1 keeps two
lines at 1280 pixels but wraps to three at 390, and some long page titles gain
a line on phones. The homepage cash chart was re-exported from Excel in
Public Sans on 28 September 2026; the wide variant's title drops to 21 points
so it stays on one line.

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

Display tracking is modestly negative. Body and mono tracking stay neutral. Labels never combine `text-transform: uppercase` with positive letter spacing; `site-tools check_design` fails any rule that does, except the footer motto. No all-caps eyebrow appears above every section.

## Spacing, shape and layers

- Base unit: 4px.
- Main sequence: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128px.
- Wide shell: at most 1360px with fluid gutters.
- Reading shell: at most 56ch (about 74 characters of body text).
- Header: at most 72px on desktop.
- Default radius: 0.
- Controls and code blocks: 2px.
- Media: 0.
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

At the default desktop text size, the header is sticky, one line and at most 72px tall. It reflows when enlarged text or a narrow viewport needs more room. Up to 40rem it is not sticky, so its 2 or 3 rows scroll away with the page. Ryan Duguid appears as a text identity at left. The primary navigation is Tools, Questions, Rates, Evidence and About, exactly. The Human and Machine view switch sits at the right end of the header at every width; it is a square control with a thin strong rule, and its selected option sits on the stamp wash. The header uses paper transparency only if contrast remains solid; no blur or glass treatment is allowed.

### Footer

The footer holds the site's one advice disclaimer: a single small line, `.site-footer__legal`, in the caption size, that links to the advice and review boundary at the end of About. No page repeats it; About keeps the full statement and tool pages keep only their specific limits. It sits above About, GitHub and Machine-readable index links with a strong top rule. Footer type remains readable at 200% zoom. An ABN line, `Ryan Duguid, ABN 59 834 031 764`, closes the footer below the disclaimer. Directly above it sits the motto, Ex fide fiducia, set in tracked mono capitals. The visible copy is hidden from assistive technology and carries the English meaning (from faith comes confidence) as a native `title` tooltip, which keyboard and touch users cannot open; a visually hidden copy gives screen readers the Latin, marked `lang="la"` and in mixed case so it is spoken as words, followed by that meaning. Machine view leaves the motto out of the footer notes it appends. Print does the same: paper keeps the disclaimer and the ABN line and drops the footer's links and motto. Printed calculator working ends with blank Reviewer and Review date lines, matching those fields in the downloaded question checklist.

### Buttons and links

- primary actions are crimson rectangles with ivory text and 2px radius; they fill deep purple on hover
- links underline in red and fill crimson with ivory text on hover
- secondary actions are underlined text with a directional phrase
- labels describe the destination or action; no `Get started`
- one label maps to one intent across a page
- controls are at least 44px in the smaller dimension

### Tables

- captions or nearby headings state what the numbers mean
- headers use Public Sans SemiBold
- numerical columns use Spline Sans Mono and tabular numbers
- rules appear between rows, not around every cell
- the first and current rates receive typographic emphasis, not a coloured progress bar
- wide tables use labelled horizontal scroll regions at narrow widths
- scroll regions with hidden columns show a caption-style scroll cue in browsers that support scroll timelines
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

An evidence record has 4 ordered parts:

1. claim
2. primary source or released artefact
3. reviewed date or version
4. human decision boundary

Mono labels and rules bind those parts without turning them into rounded cards. Proof sits beside the claim on wide screens and immediately after it on mobile.

## Homepage architecture

The homepage routes readers to the work; it demonstrates no tool and does not
use scroll snapping.

### Hero and cash case

The hero states 'Open source tools for Australian accountants' with one
supporting line, one action ('Explore the cash flow example'), the byline and
the review date. The cash case follows: 'Compare profit with cash flow' with the
Lumbridge workbook chart, which sits beside it on wide screens and below it on
mobile. About states that the site is a personal open source index, not a
practice, and does not accept professional engagements; the hero does not
repeat it.

### Choose a route

One router offers 3 reader routes, each a heading, one sentence and its links:

- 'Check a pack or calculate': Ozzit, Monthly Close Controls, the Coal LSL
  calculator, the manager review gate evaluation and all tools by task.
- 'Answer a tax or payroll question': the 100 accounting questions and the rate
  tables.
- 'Review my work': About and Evidence.

One label maps to one intent.

### Fictional data first

'Try each tool with fictional data first' links the reproducible evaluations
and the AI tools setup guide, beside the 3 latest tool releases with their
dates.

### Collection registers

The full `/tools/` register groups the 12 controls by the work they stop or check:

- Extract records into reviewable shape.
- Calculate without hiding the branch, formula or rounding.
- Control incomplete work before manager review.
- Inspect sources, evidence and AI boundaries.

`/evaluate/` groups the 3 reproducible evaluation packs and `/rates/` groups the 7 maintained reference tables, each led by its current value. These registers are not second homepage essays. Each entry names the observable control, delivery form, source and human boundary.

## Inner-page system

About, Evidence, tool guides, evaluation packs and rate pages share one article frame:

- large page statement followed by one short answer
- sticky local contents on wide screens when it has at least 3 useful destinations
- 56ch reading column
- source and date metadata beside the relevant claim
- full-width table or code artefact where the content needs it
- one small footer disclaimer line on every page, with no page-level copies

On mobile, the contents rail becomes a compact in-flow index. No body copy falls below 16px, except the footer disclaimer line, which uses `--text-caption` (13 to 14px) as a dated exception of 4 November 2026. Lines do not exceed the viewport. Shared head and footer delivery chrome may evolve across styled pages; rate main text, evidence facts and structured data remain untouched.

## Copy standard

Every changed visible sentence must pass these 5 principles:

1. One reading pass. A visitor can finish the claim without rereading it.
2. Pain first. Name the incomplete pack, late contribution, unbalanced trial balance or unsupported AI answer before the solution.
3. One ask per screen. The hero opens the cash flow case; the 3 routes and the release register follow.
4. One viewport, one thought. Hero identifies; each route explains one action; catalogue indexes.
5. Visualise in the line. Prefer `READY is not sign-off` and `fund receipt within seven business days` to abstract quality claims.

Banned visible language includes: revolutionise, seamless, cutting-edge, leverage, unlock, delves, landscape, tapestry, in today's fast-paced, decorative AI-powered language, generic `Get started`, emojis, em dashes and en dashes.

When a published figure proves wrong, correct it on its own page with a dated
note saying what changed, and record the correction in the changelog.

Use Australian English in original prose, with no serial (Oxford) comma unless
it prevents ambiguity, as the Australian Government Style Manual advises. Preserve exact
quotations, command output, identifiers, and official titles. Keep the About
page in the first person. Use Ryan's supplied credential labels exactly:
'Provisional CA ANZ Member' and 'Xero Certified Specialist, Level 3'. State them
directly and retain the CA ANZ non-endorsement statement. Never append bare
'CA' to Ryan's name or invent credentials, rates, endorsements, customers,
or outcomes.

The 10 September 2026 copy pass updates grammar and credential wording in
visible text, metadata, social cards, and machine-readable indexes. The
corresponding prose baselines record these authorised changes; numerical
facts, dates, links, quotations, and calculator behaviour remain unchanged.

## Protected contracts

The 24 September 2026 copy and GEO pass removes serial commas where they end a simple list, writes 'fictional' for invented data (the old `#fabricated-inputs` anchors stay), abbreviates New South Wales to NSW, puts Evidence in the first person, writes negative amounts with a minus sign and splits the longest sentences. Each accounting question is an `h3` inside its summary, 28 answers open with a figure checked on 24 September 2026 against the ATO, Revenue NSW or Coal LSL (`fact`, `fact_sources` and `facts_checked` in `_data/accounting_questions.json`), and each topic page publishes an FAQPage whose items `check_faq_visible` pairs with the visible `details.question` headings and first answer paragraphs. Question 10 covers the 1 July 2026 changes and question 99 the Coal LSL levy. Card titles in `llms-full.txt` end with a colon, and stripped hidden text no longer leaves a space before a word-ending comma or stop. The FAQ values go through `jsonify`, which the local renderer now also provides. Rates, CSVs, calculator arithmetic and evaluation pins are unchanged.

The 24 September 2026 skills inventory update records that the australian-accounting-skills default branch now carries 60 skills, 41 of them additions to release v0.2.1, after nine new workflows merged (working from home deductions, ATO penalties and interest, Division 293, Division 296, super contribution caps, PAYG instalment variations, termination payments, multi-state payroll tax and car expenses). The subcontractor-ledgers FAQ and the AI agents comparison no longer say the skills never hold a rate: some skills now record figures a person reviewed, with effective dates, as a cross-check against the applicable authoritative source; and the evaluation wording now says no fresh model evaluation covers all the additions. The subcontractor-ledgers JSON-LD digest, the llms.txt digest and the generated machine views record these authorised edits. Release pins, rates pages and disclaimers are unchanged.

The 16 September 2026 Xero credential pass publishes the certificate Xero issued
to Ryan, with the individual Level 3 badge taken from that certificate, as one
record under Identity and credentials at `/evidence/#xero-certification`. The
About and homepage entries link to that anchor instead of restating it. The
supplied credential label becomes 'Xero Certified Specialist, Level 3', which is
the title the certificate itself carries, replacing the earlier
'Xero L3 Specialist Certified' in visible text, metadata, JSON-LD and the
machine-readable indexes. Both dates are written out, so no page claims a status
that expires on its own. The SAP records stay described as issuer-verifiable and
the Xero certificate as locally hosted, because Xero publishes no verification
page for it. No partner-tier, Payroll or Migration badge is published: the
Brandfolder collections hold partner-practice artwork, and this site is not a
practice. The JSON-LD digests for `about/index.html` and `evidence/index.html`,
the sitemap and llms.txt digests, and the generated machine views record these
authorised edits. Asset provenance, usage limits and the renewal update
locations are in `assets/credentials/SOURCES.md`.

The 14 September 2026 claim-maintenance pass refreshes the rate verification
and editorial dates after reading the primary sources. The SG and Division 7A
pages distinguish this rate check from their earlier statutory and RBA reviews.
Rate values, CSV data, calculator behaviour, credential wording, and historical
evaluation pins are unchanged. The rate-page text, source-link and JSON-LD
baselines, sitemap dates, and generated machine views record these authorised
edits. The scope and sources are in `docs/claim-maintenance.md`.

The 11 September 2026 B1 update adds the unreleased Payday Super evidence-pack
workflow to Adopt, the Payday Super tool page, its evaluation page and the machine
indexes. The evaluation's editorial date and JSON-LD digest, the sitemap digest
and the llms.txt digest reflect this requested copy change. Existing release and
fixture pins, legal review dates, rates, layout and disclaimer boundaries remain.

The following whole-file values are protected after normalising only platform line endings:

- `llms.txt`: SHA-256 `08AC8CB9805B4139F8B5BCA398F1FCC28C507F5410643F39EB8DC9E7645EE5DC`
- `robots.txt`: SHA-256 `28E5D429F1E7A23010A412ED0B6AB4186391398586558F122937F764E1F78242`
- `sitemap.xml`: SHA-256 `89673A839CFA2F162761A37C417866134B39A7F80C347BD82BC15BB73BE075CB`

Rate main text is protected by a semantic visible-text digest so shared head and
footer delivery chrome can improve without changing a rate, date, source or
explanation. The current baselines preserve footer disclaimers, direct credential wording,
the non-practice boundary, calculator disclaimer, human review statements, and
Division 7A refusal. Grammar edits must preserve their meaning.

Canonical routes, `#adopt`, `/evidence/`, sitemap coverage, robots policy, calculator arithmetic, evaluation fixtures and supported install commands remain unchanged. The retired `/engage/` path and `#engage` hash resolve quietly to the homepage.

## GEO and crawler policy

GEO here means truthful answerability, explicit entity context and nearby
evidence. It does not mean keyword stuffing or a Google ranking campaign.

- every indexable page exposes its own `index.txt` through a text/plain
  alternate link and every styled page exposes one visible Machine-readable
  index link to `llms.txt`
- no Google-specific ranking work or `noindex` is added to an indexable page
- ordinary crawlability remains available to people, search systems and answer
  systems
- search and user-retrieval crawlers remain allowed, including Google-Extended
- every named crawler is allowed, training crawlers included: Common Crawl
  (CCBot), Bytespider, GPTBot, ClaudeBot, Applebot-Extended, Amazonbot,
  cohere-ai, Diffbot, FacebookBot and meta-externalagent
- `llms.txt` is the canonical machine index; `.well-known/llms.txt` is an
  identical generated copy. The existing build script maintains that copy and
  `llms-full.txt`. The XML sitemap contains indexable HTML only
- `llms.txt`, JSON-LD, rates, disclaimers and refusal boundaries remain the
  factual source of truth
- every page's document node names the canonical Person as author and
  publisher, with its published and modified dates, and every visible
  breadcrumb has one matching `BreadcrumbList`
- a tool's software node links the LICENSE file at its current release tag,
  because a release keeps the licence it shipped under; repository nodes
  without a version link the default branch's LICENSE. No node names a licence
  by SPDX URL
- each rate table's `Dataset` is free to access and belongs to the Rates
  `DataCatalog`; each calculator page carries a free `WebApplication`

The 11 September 2026 crawl-policy change authorises these crawler rules,
machine-index copies, and static source and definition improvements. It keeps
rate values, CSVs, engine behaviour, and release source-review dates intact.

On 4 November 2026 Ryan asked for the site to be 'as optimised for GEO as much
as practically possible'. That pass opens the 5 crawlers that were blocked,
which Meta, Amazon, Cohere and Diffbot document as follows on that date:
Amazonbot may train Amazon models; meta-externalagent may train foundation
models; Cohere says it runs no crawler at present; Diffbot says its crawler
serves search and its Knowledge Graph, not AI training; and Meta's crawler page
no longer lists FacebookBot. It also completes the structured data above
without changing visible page dates, except Privacy, whose crawler summary
changed. `tests/browser/geo-metadata.spec.mjs` holds every indexable page to
these rules.
Page review dates record editorial review, not renewed legal certification.

The 11 September 2026 capability pass records MCP 0.2.0's bounded worksheets
and optional local Markdown retrieval in visible copy and machine indexes.
It updates current-release references and adds fabricated first-use examples
verified against trust and company-tax release 0.1.3. The affected JSON-LD
baselines, machine-index hash, and sitemap review dates record those approved
edits. Rate content, evaluation version pins, and calculator formulas stay fixed.
The 6 refusal tables reuse the wide-table class inside their labelled scroll
regions so mobile prose keeps a readable measure.

## Accessibility and performance

The Tools page puts task choices before delivery and evaluation background.
Chooser links have a 44px minimum height and show each tool's delivery format.
The calculator uses tighter header spacing and a wider desktop title measure
while retaining the full rate,
method and boundary text. Its 'Load the fictional example' action precedes the inputs
and fits within the first viewport at 390 by 844 CSS pixels. The adjacent note
states that loading the example replaces the current inputs.

Adding a bonus focuses its amount. Removing a bonus focuses the next amount,
then the previous amount, then Add a bonus when none remain. Monthly-table
removal follows the same order through the remaining Remove buttons and
returns to Employee reference when the table is empty. Calculate and Load
the fictional example focus the Result heading without animated scrolling.
Stacked layouts keep Calculate in view with the result below it; wide layouts
scroll the heading into view, because the sticky result can sit above the
viewport once a reader scrolls down to Calculate (4 November 2026). Invalid
submissions keep focus on the first invalid input.

Once a result exists, edits to amounts, branches or bonuses show
'Inputs changed. Calculate again.' beside that result. The notice clears
only after a successful calculation, including the existing recalculation
before printing or adding an employee. The empty notice remains a live
region so its first update can be announced.

Each business calculator shows a Print working button in its sources panel
once a result exists; an edit hides the panel and the button with it. The
business calculator note and the Coal LSL method list invite readers to
disconnect once the page has loaded and calculate. The browser suite runs
every calculator offline to keep that invitation true.

Each business calculator opens with its first boundary case filled in and its
result already shown, labelled as a fictional example (13 November 2026). The
result is in the served HTML, so it takes its space before any script runs and
the live region announces nothing on load. The first edit replaces it with
'Enter the inputs and calculate.'

Tools uses smaller gaps around its introduction and supporting sections to
keep the task chooser and delivery labels within the existing page-length
limits. Print mode renders warning text in black.

The employee table chooses an unused automatic reference when a reference is
left blank, including after row removal. Its addition and removal confirmation
is visible below the entry controls and remains a live region. A note above
the controls tells visitors to download the CSV before leaving because the
table is not saved and clears on reload or when the page closes. While the
table has rows changed since the last download, a `beforeunload` prompt asks
before the page unloads; the listener is attached only while that is true.
The populated table keeps cells on one line and horizontal scrolling within
its own region at 320 CSS pixels, including the hidden column label.

- one skip link, one labelled primary navigation and one `main#main` on every indexable page
- logical heading order and one `h1` per page
- visible focus with at least 3:1 contrast against adjacent colours
- body text and controls meet WCAG AA contrast
- touch targets are at least 44px where they are standalone actions
- no horizontal page overflow at 320, 390, 768 or 1440 CSS pixels
- no layout jump from unsized media or late decorative content
- WOFF2 only, no remote font request and no new JavaScript dependency
- the continuous true-black OLED theme and forced-colours behaviour are inspected
- reduced-motion mode is inspected

The measured production baseline before this refinement is about 303 KB of
initial transfer: about 250 KB of fonts and about 46 KB from the below-fold
proof image. Under the recorded 390 by 844, 4-times CPU and emulated 4G
profile, LCP is about 1.40 seconds and CLS is 0. The implementation must reduce
initial transfer materially without regressing the matched median LCP or CLS.

## Verification

Automated checks cover the OLED token contract, contrast, font assets, delivery
order, homepage image priority, machine-index discovery, copy ban list,
protected hashes, rate-main snapshots, JSON-LD parity, disclaimer parity,
routes and all existing repository contracts.

Browser review covers the homepage at 320, 390, 768 and 1440 CSS pixels plus
Tools, Evaluations, Rates, About, Evidence, a tool guide, calculator, rate table
and 404 page at desktop and mobile sizes. It checks exact primary-navigation
order and current state, keyboard focus scrolling, all 4 homepage-to-Tools
anchors, overflow, computed fonts, console errors, reduced motion, forced
colours, font/image failure and the one OLED colour scheme.

Lighthouse uses 3-run medians for the homepage, Tools, Evidence and Coal
LSL calculator. Performance stays at or above 0.95; accessibility, best
practices and SEO stay at 1; CLS stays at or below 0.01; LCP stays at or below
2,500 ms; and total blocking time stays at or below 200 ms.

The pull request must name the 3 selected gold-standard references, the supplementary Pliny influence, IBM Plex licence, copy changes and the deliberate refusals: no sales funnel, no intake form, no mascot, no purple or Pliny-style gradient, no generic CTA and no altered rates or advice boundaries.

## Synthetic forecasting presentation, 11 September 2026

The competitor-analysis follow-up adds the existing fictional Newcastle forecast
to Worked proof, Evaluations, and the feedback route. It adds a checked workbook
and source ZIP so a reader can inspect the case without installing development
tools. The profile remains a personal index, and professional engagements remain
closed. The existing site layout, 4 tool categories, calculator, rates, and
fixed-release evaluations are retained. Machine indexes and editorial dates
record these copy changes; they do not assert independent accountant review or
client outcomes.

## Monthly close guide, 11 September 2026

The SEO/GEO audit adds `/tools/monthly-close-controls/` for the monthly close
exception-report query. It reuses the article, table, command and FAQ patterns,
with a fabricated example reproduced at source commit `ae88966`. The Tools
register, nearby guides and evaluation preview link to it. Sitemap and text
indexes include the new page. Only the affected machine-index and sitemap
hashes, Tools JSON-LD, new-page JSON-LD and shared-footer count change in the
protected baseline. No CSS or runtime dependency is added.

## Accounting question guides, 11 September 2026

Ryan authorised implementation of the 100-question research register. Two Tools
subpages add static question guides and 9 browser calculators. They reuse
the shared navigation, tokens and footer. The question data renders through
Jekyll before machine-text extraction. The sitemap and machine-index hashes
above now include these routes; the footer count rises from 27 to 29. Existing
rate text, arithmetic and evaluation pins remain protected. No measured-search
ranking or professional-service claim is added.

The approved improvement pass fixes rounding in the new planning calculators,
searches guide content and accounting aliases, and adds dated cash scenarios
with local input-file save/load. Three fictional worked examples and topic
review dates support the guides. Both new routes join the existing Lighthouse
checks. The earlier levy engine, statutory rate pages, and evaluation pins stay
within their protected contracts.

The question filters occupy their space before JavaScript loads. The shared
script loads calculator arithmetic only on pages with calculator forms. The
preview negotiates gzip for text resources to match verified GitHub Pages
delivery. Lighthouse thresholds remain unchanged.

## Website checklist, 12 September 2026

The Privacy and site use page records browser data handling, cookies, hosting,
feedback and the existing advice and licence boundaries. Its shared footer link
and machine-index entry make the notice discoverable. The 2 index hashes above
include this page. Existing routes, rates, crawler rules and advice boundaries
remain unchanged. Copy controls show pending feedback and prevent repeat clicks
until the clipboard request finishes. Loading a saved cash forecast also shows
status text while the browser reads the file. The footer disclaimer appears on
all 30 styled pages; its wording is unchanged.

## Technical audit actions, 14 September 2026

Ryan asked for the technical audit findings to be applied. The fourth homepage
face is preloaded, so every face renders at first paint. The six webfonts were
also cut to the characters the pages use; the same day's fact check found that
the cut files kept IBM's reserved font names without a recorded permission
basis under the SIL Open Font License, and that the cut had dropped an
OpenType feature the provenance said was kept, so the site returned to IBM's
unmodified Latin1 splits (about 38 KB more on a first visit). The calculator pages and the homepage preload their module
graphs, so the Coal LSL calculator's scripts arrive in one round trip instead
of two. The homepage title and share titles now match the H1 wording; five
tool titles are shortened or qualified. The Payday Super page and the
business-use calculator link the maintained rate tables they depend on. The
homepage case study is a section rather than a labelled div, the nine
calculator outputs drop their redundant status role, and every tool node
carries `operatingSystem`. The hero chart offers a 640-pixel candidate for
narrow viewports, recorded in the capture record. The Machine view fetches a
per-page `index.txt` written by the llms-full builder instead of the whole
text file. `pyproject.toml` and `SECURITY.md` leave the published tree and
the Privacy page links the licence on GitHub. Baselines: fonts, sitemap and
eleven JSON-LD digests.

## CodeRabbit finding corrections, 12 September 2026

Ryan requested fixes to the existing review findings. The Division 7A
explanation now holds the unpaid balance and remaining term constant
when describing the effect of a higher rate. Its FAQ and JSON-LD use
the same wording. Subcontractor skills name either compatible agent.
The 2 evaluated installation examples now select their stated tags,
and case-study links select recorded commits. Only the affected prose
and JSON-LD baselines change; rates, CSVs and crawler rules stay intact.

## First-run examples, 14 September 2026

Ryan approved a shorter first run and clearer reproduction routes. The Tools
register links each control to an existing example or evaluation procedure.
Payday, company tax, trust, and MCP examples use pinned PyPI commands. Benchmark
and WIP examples name their existing release tests. Evaluations distinguishes
package trials, source examples, and agent procedures from its three historical
release evaluations. Editorial dates, affected JSON-LD baselines, the sitemap
digest, and generated text indexes follow these changes. No CSS, runtime
dependency, fixture, legal review date, or historical evaluation pin changes.

Installed-package verification also found stale unreleased wording for Payday
evidence packs. The homepage, tool guide, evaluation introduction, and machine
index now name checker 0.1.4 and MCP 0.2.2. The original development commit,
commands, expected outcomes, and legal review date remain fixed. The evaluation
editorial date and its JSON-LD, sitemap, and llms.txt baselines follow the correction.

The Payday download copies the existing fabricated CSV byte for byte. Its
SHA-256 matches tools/payday-super/example-provenance.json. Serving it from
the site makes the download action work without visiting a source-code host.

Hosted browser verification caught the old homepage screenshots and the Tools
height ceiling. The homepage baselines now show the verified release wording.
Duplicate example destinations were removed from the register, source labels
were shortened, and the mobile height ceiling allows the added introduction
and example links with the existing approximate 234px margin. CSS and screenshot
difference tolerances are unchanged.
