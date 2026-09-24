# duguid.com.au design system

**Status:** current refinement
**Date:** 31 August 2026
**Source baseline:** `adb31c63f17e608545197a703d3823c2cb3ca7f3`

## Design read

The canonical routes, the dark-only token palette and the rate main text are frozen; this refinement changes only the surfaces around them. The readers are accounting managers, technical adopters and reviewers of an Australian computational accounting index. It needs the authority of a public register, the legibility of a statute note and the inspectability of a developer tool. It must not read as a tax-agent practice, a SaaS funnel or an AI product launch.

- `DESIGN_VARIANCE`: 6. Asymmetric document layouts and large changes of scale, with strict mobile collapse.
- `MOTION_INTENSITY`: 2. Sticky positioning and brief colour, underline and control feedback only.
- `VISUAL_DENSITY`: 5. Spacious route viewports followed by compact evidence, rate and catalogue surfaces.
- Redesign mode: preserve the established visual language and refine only the surfaces that need clearer hierarchy or evidence.
- Theme: OLED dark only.

## Current refinement record

The 24 September homepage pass removes the Workpaper Review Gate worked
example, which repeated the third task row and the first adoption link, so
the proof band keeps the one Coal LSL artefact under the heading 'Worked
example'. The route sections drop their empty label column, which no page
used after the route labels were removed, so every homepage heading starts on
the shell edge with the hero heading and the task titles. The view switch
moves from the bottom-right corner into the sticky header at every width,
where it no longer covers page text while scrolling; above the 56rem collapse
the header reserves its width beside the navigation. The hero boundary note
stays in the first viewport and says the same thing in fewer words.

The 22 September landing-page refinement retains pure dark mode at Ryan's
request. The headline is 'Open source tools for Australian accountants'.
It caps at 60px at the default text size; mobile
keeps its 32px heading and enlarged text remains supported. Homepage labels
use sentence case with normal spacing. Supporting copy uses brighter neutral
tokens on the homepage only, including the footer and view switch. Fixed
captures and other routes retain their existing palette.

Homepage action groups use thin rules, and notes lose their left border.
The applied formula keeps its background tint, green text and explicit
formula announcement without the green edge. Structural section dividers
remain. The detector also counts neutral dividers as card stripes and applies
a penalty to dark pages regardless of text contrast, so its score is not an
accessibility verdict.

The accompanying copy pass removes unnecessary hyphens from familiar phrases
such as open source, cash flow, trial balance and financial year across the
site. Titles, structured descriptions and generated text follow the visible
copy. URLs, identifiers, commands, figures, release pins and legal meaning
remain unchanged. Necessary compounds such as GST-free, gross-up and read-only
retain their hyphens.

The subsequent social-preview refresh brings all 5 cards into the same visual
style: sentence-case labels, brighter supporting text and thin neutral rules
without a decorative left stripe. The site card uses the exact homepage
headline, and every card names Ryan Duguid. Dated image URLs and matching
descriptions are used across the site; previous undated images remain available
for existing links.

The 22 September friend-feedback pass names concrete accounting tasks in the
homepage summary and the 4 starting routes shared with Tools and the machine
index. The fourth route opens Ozzit; the installation guide remains in Adopt.
Worked proof begins with a plain-language summary of the published fabricated
BAS pack findings, its source link, and its human-review boundary. It reuses
the existing proof and register components. The headline, OLED palette,
calculator behaviour, and fixed evaluation releases remain unchanged.

The mobile pass gives standalone homepage, catalogue and article navigation
links at least 44px of target height. Stacked label and description gaps
tighten, and the BAS preview keeps short finding statuses beside their labels.
The four starting routes remain visible on Tools; its longer task chooser uses
a native disclosure on every screen size so the catalogue follows sooner.
It needs no JavaScript and supports keyboard and touch input.
At enlarged text sizes, the 320px page minimum stays fixed and the navigation
can scroll within its own row without widening the document. The site name
wraps within half the header, reserving space for the fixed-size view switch.
Its heading line height and content-sized row keep enlarged text clear of
the navigation. The proof calculator's grid can shrink below its usual
field width on narrow screens with enlarged text.
Printing includes the extra task list even when its disclosure is closed.

At Ryan's request, external-review invitations, pending notices and the
response template are removed. The sample pack retains its scenario exercise,
with no reviewer recruitment or reporting requirement. Its workbook and
calculated outputs are unchanged.

The later 21 September discovery pass adds Ozzit to the existing task chooser
and distinguishes the Coal LSL calculator from the 9 planning calculators.
The homepage links to the integration guide instead of carrying installation
tabs and version caveats. The guide now owns all 4 installation routes and
the no-install option. Old homepage links to individual tabs still select
the corresponding option in the guide. The current design, calculation
behaviour and review boundaries remain in force.

Installation panels use a single shrinkable grid column so long commands
scroll within their code block and the Copy button stays on screen.

The 21 September improvement pass preserves saved question searches at the
topic hub and removes the redundant single-topic selector. Search labels name
the current topic. Calculator copy distinguishes automatic storage from local
scenario downloads, and the machine index qualifies loan precision. Primary
navigation uses 14px labels and 44px minimum targets on mobile, wrapping below
480px with a 132px header so all six links remain visible. The Coal LSL
opening spacing and Payday example's top inset tighten on narrow screens to
keep their existing first-viewport actions. The palette, calculation code
and professional boundaries are unchanged.

The 20 September evaluation pass splits the two long tool pages: the 100
questions now live on 10 topic pages of 10, each with the search box and
checklist download, and the 9 business calculators each have their own page.
The old addresses stay as indexes; each keeps the old fragment ids on its
links, and `hub-routes.mjs` follows the link when a page opens on one. Rates gains the maximum super contribution base, the
car limit and the FBT rate, on the existing rates template. The homepage
scope strip is removed because its four lines repeated the hero note and the
footer; the Tools category jump links are removed because the accounting-area
finder and the catalogue headings already cover them. Six titles drop the
site-name suffix so every title reads the same way. Every page now has a
breadcrumb. Caption text grows from 12 to 13 px on a phone and radio and
checkbox controls to 20 px. A secondary button inside a route-actions grid
centres its label instead of sitting on the grid baseline. An Atom feed of
the changelog is built from the changelog tables. The palette and tokens
other than the caption size are unchanged.

The 18 September review follow-up adds workbook actions to the opening of the
Lumbridge and Ozzit pages. Tools now gives one starting instruction, with the
question library and planning calculators as secondary shortcuts. Ozzit shows
complete function names and a formula that can be copied into its workbook.
Its lambda character uses the native maths-font fallback described below.
Ryan then requested removal of the notices about an outstanding independent
accountant trial. The public pages, FAQ data and text indexes omit those
notices, including the sample pack's supporting notes; the reproduction
instructions and recorded verification remain.

The 18 September 2026 task-route pass replaces the homepage's 4-category
preview. The homepage now leads with 'Open-source accounting tools for
Australian accountants.', a one-line proposition, the non-practice boundary and
two actions: the cash-flow example and the tools page. Where the preview listed
Extract, Calculate, Control and Inspect, 4 starting routes now name what a
reader came to do: understand an accounting problem, try a browser calculator,
evaluate an accounting workflow, inspect or integrate the software. The same 4
appear above the chooser on Tools, which keeps Extract, Calculate, Control and
Inspect as the catalogue index below. Each route states its delivery
requirement before the reader follows it. The header wordmark reads 'tool library'
rather than 'register'. The palette, type, tokens and restraint rules are
unchanged.

The same pass was then reviewed again and finished. The Formula B answer on the
Coal LSL page names the branch it applies to and excludes expense
reimbursements, in the visible copy and in the FAQPage data, which a contract
now holds identical. The privacy notice drops the claim that neither Cloudflare
addition reports anything to the site owner, and separates delivery and
security processing from what the calculators do with entered figures; the
route copy says the calculators work the figures out in the browser rather than
that nothing is sent anywhere. The machine index routes the same 4 tasks to the
same destinations as the homepage and Tools, and gives the business calculators
and Monthly Close Controls their own links. Every tool feedback line now reaches
the written-out address through the contact page. The site social card carries
the tool-library label; it was re-rendered with the pinned Chromium and its
checksum refreshed, and the other 4 cards rendered byte for byte identical. No
CSS, token, palette, runtime dependency or calculation changes.

The 14 September 2026 pass applies the full interface audit of the same
date. A bare `button` is now a helper action in the secondary register, and
the one primary action per view opts into the fill with `class="button"`
(Calculate on the Coal LSL page and on each business calculator, Download
selected checklist on the questions page). Both calculator pages share
`assets/field-errors.mjs`: the first invalid field gets an inline
`role="alert"` message in the page's own words (Enter $0.00 or more; Use no
more than two decimal places) and takes focus, replacing the browser's
validation bubble and its locale-dependent text. Repeated link texts on the
Evidence and Rates pages carry a visually hidden suffix naming their package
or rate, as the Tools register already did. Tools and Evaluations entry
titles keep their underline at rest. The view switch sits at the trailing
gutter on wide screens, matching its narrow-screen corner, so it no longer
covers the reading column. The pending accountant trial sentence on the
homepage and the Evaluations page now links to the Contact invitation. The
404 title uses the shared separator.

The 13 September 2026 layout and typography pass applies the review of the
same date. Heading sizes now descend: an `h3` under a 32px `h2` takes the
lead step on the homepage preview, the worked proof, the install band and
the Tools register, and the lead principle cell no longer matches its section
heading. The route notes, install intro, proof note, capture summary and
capture caption take the 68ch reading measure, as do the article body and
the footer disclaimer. The caption token is fluid from 12 to 13px, matching
the scale table below. The 2 accounting pages keep their review stamp to
one line and carry their boundary sentences as a small-text note; their
forms share the reading measure, so inputs, button and result box close on
one edge; their cash table uses the shared scroll region. The Verify button
keeps its button geometry inside the action register; the calculator's
rendered branch fields share the form rhythm; the work chooser, action rows
and adoption rows align on the baseline; the hero's boundary note and review
stamp read as one group; principle cells sit on the shell edge; Tools entry
titles underline only on hover and focus. The business calculator result
sentences stay in IBM Plex Sans with tabular figures, a recorded exception to
the mono rule for figures because each result is a sentence, not a ledger
row.

Ryan then asked for a true-black OLED register in place of the green-tinted
dark surfaces. The token palette in the Colour section records the new
values; component CSS is unchanged because it consumes tokens only. The cash
chart is re-exported against the black canvas and the fixed calculator proof
images are recaptured so the artefacts match the page. The favicon rasters
and the 5 social cards follow the neutral ink and soft ink.

The closing pass of the same day puts the cash chart in the first desktop
viewport: above the 56rem collapse the hero is 2 columns, the masthead
spans both, the proposition, actions and case text stack on the left and
the chart sits on the right from the summary line down. Mobile and tablet
keep the stacked order. The chart export lives in
`scripts/export-cash-chart.ps1`, which reads its colours from the tokens.

The same day's surface pass lets the worked-proof band bleed to the viewport
edges like the trust band above it, with one shared rule between them; sets
the homepage cash chart in IBM Plex Sans by installing the family for Excel
and re-exporting from the pinned workbook; centres the lead principle cell's
statement in its 2-row height; keeps Calculate as the calculator's one
full-width filled action while its helper buttons take their own width;
removes the hover wash from static table rows and the accent colour from a
targeted heading, so the accent keeps one meaning; hides native spin buttons
on number inputs; and runs the More index rule the full width of its last
row.

The 12 September 2026 alignment pass fixes text that sat off its neighbours:
the hero link is centred on its button; the 4-task header shares the
entry column template so its heading starts on the description edge; the
trust band's boundary and rail labels share one top inset on desktop and one
left edge on mobile; label and value pairs in the collection entries and the
credential register align on the baseline; the case and calculator headings
gain a small gap before their paragraphs; the calculator chooser's first
item no longer sits above its row; and the rates register drops the empty
band between two strong rules. Loading states end with an ellipsis and the
question filters live in the URL so a filtered view can be shared.

The 12 September 2026 copy trim removes 3 homepage sentences that
repeated the page (a credentials triad, a duplicated boundary, a duplicated
adopt note), drops the decorative digits from the scope strip, and lets the
hero subhead serve its one button. Contact opens with what email is welcome
for before its unchanged boundary sentences; About puts the short facts before
the work samples; the Lumbridge case gains a cite-as line; the Rates index
explains verified against last reviewed. Cross-links join the super guarantee
page to the staff cost calculator, the 2 planning calculators to the
Lumbridge case and Monthly Close Controls, 4 tool pages to their own
refusal sections. Rates, CSVs,
calculator arithmetic, install commands and every legal boundary are
unchanged; the affected JSON-LD, super guarantee main-text and sitemap
baselines record the editorial dates.

The 12 September 2026 loading and mobile placement follow-up defers the
view-switch script so a slow request cannot hold up page content. A saved
Machine preference applies when the script loads; Human content remains
readable while waiting. At widths up to 640px, the pill sits beside the site
name in the sticky header, with 44px targets and a separate navigation row.
The header remains 88px tall. Desktop keeps the bottom-centred placement. The
switch's colours, saved preference and Machine content remain unchanged.

The 12 September 2026 Human/Machine switch follows Ryan's Cloudflare Connect
reference. Its fixed bottom-centred pill, neutral surface, and blur are explicit
exceptions to the register shapes below. The selected dot and keyboard focus
outline use the existing green stamp accent, as Ryan requested in the follow-up.
The control uses the existing IBM Plex Mono font, native keyboard controls,
44px touch targets, and a saved view preference. Machine displays the current
page's existing generated text and source links. The unindexed 404 page uses
its existing text without a download. Page content and review boundaries
remain unchanged.

The approved 11 September 2026 portfolio follow-up leads the homepage with
'Australian accounting tools, with the working explained.' The first action
opens the fictional cash-flow case and remains visible at 390 by 844 pixels.
An export from the supplied workbook sits in the hero before the 4-category
preview. Its capture record identifies the Excel version, scenario and hashes.
Tools adds the same cash-flow entry; About connects 3 capabilities to public
samples; Evaluations shows a source-linked month-end exception excerpt.
The independent accountant trial remains pending. Existing calculator behaviour,
rates, disclosures and the non-practice boundary remain in force. On mobile,
chooser rows use smaller gaps while retaining 44px links and the page-height cap.
This updates the homepage ordering in the earlier refinement record below.

The approved refinement puts the workbook download immediately after the case
introduction. The chart links to its full-size image and states the cash trough
and assumed buffer in text. About states traceability and fabricated-data scope
once near its work samples, with the existing review boundaries retained.

The 31 August 2026 refinement keeps the design read at
`DESIGN_VARIANCE: 6`, `MOTION_INTENSITY: 2` and `VISUAL_DENSITY: 5`.

- The homepage leads with browsing the tools, then a 4-task preview, worked
  proof and the Adopt and Verify sections. It is explicitly a personal
  open-source index, not a practice.
- The task preview immediately follows the hero; the unchanged scope strip
  follows the preview. At 390 by 844 pixels, mobile hero spacing keeps the
  first named tool link in the first viewport. The live proof requires explicit
  non-negative amounts and hides its result while input is invalid. Its defaults match the captured
  example, which is labelled as a fixed screenshot in a native disclosure.
- The current Coal LSL proof is a deterministic, fabricated Formula B
  result-only screenshot. `npm run capture:coal-lsl-proof` generates both the
  868 by 580 desktop image and the 780 by 1192 mobile image from the same
  fixture, with an 80 KB limit for each WebP.
- Calculator orientation uses one concise task sentence followed by a compact
  rate, method and boundary register. Its output is a label and value result
  ledger.
- The Tools catalogue has a 4-category index. Evaluations and Rates have
  separate collection registers. The principles use an asymmetric 5-cell
  composition with one lead cell, and mobile primary navigation is one
  horizontal scroll row.
- Five tool-led social contexts use one editable OLED register template for the
  site, tools, evaluations, rates and evidence. The development-only Playwright
  renderer emits static PNGs; the public pages have no renderer dependency and
  the design contains no portrait.

The deliberate brand exceptions remain: a true-black, dark-only canvas; IBM
Plex Serif as the display face; stamp green as the only accent; square register
surfaces; 2px control radius; and no generated or stock imagery.

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
- Translate: the project index becomes a public accounting register, and the display serif stays IBM Plex rather than copying Pliny's typeface.
- Refuse: gradient lettering, scanlines, constellation ornament, hacker glyph substitutions, novelty motion and its 3-column project-card grid.

The resulting system combines a cold ledger surface, a harbour-green review stamp, the IBM Plex type family, tabular evidence chrome and route viewports built around Adopt and Verify.

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
| Paper | `#000000` | Grouped surfaces, separated by rules alone | n/a |
| Paper raised | `#0A0A0A` | Fields and the proof panel | n/a |
| Ink | `#F2F2F2` | Main reading text | 18.76:1 |
| Ink mid | `#C8C8C8` | Lead and route paragraphs | 12.55:1 |
| Ink soft | `#9A9A9A` | Supporting copy and metadata | 7.46:1 |
| Rule | `#262626` | Hairlines and table rows | n/a |
| Rule strong | `#606060` | Structural boundaries and field borders | 3.34:1 |
| Stamp | `#4DFF88` | Links, focus, route state and live evidence | 15.98:1 |
| Stamp strong | `#78FFA3` | Hover and filled controls | n/a |
| Stamp wash | `#161616` | Applied formula and interactive emphasis | n/a |
| Alert | `#FF9C91` | Refusal and warning semantics only | 10.42:1 |
| Masthead | `#F2F2F2` | Homepage identity statement only | n/a |
| Code | `#000000` | Code and install background, bounded by its rule | n/a |
| Code ink | `#F2F2F2` | Code text | n/a |
| Code comment | `#9A9A9A` | Secondary annotation inside code blocks | n/a |

True black is intentional: large canvas areas let OLED pixels switch off. This
overrides the earlier pure-black prohibition. From 13 September 2026 the
surfaces are true black rather than green-tinted near-black and the greys
carry no hue, so stamp green is the only colour on the page besides the
alert. Rules, not fills, separate the header, footer, bands and code blocks.
No gradient, glow, indigo, violet, texture or alternate theme is permitted.
The Machine view canvas is also true black so its text sits on switched-off
OLED pixels; its ink stays on the switch's own neutral palette.
On the homepage, mid ink is `#E6E6E6`, soft ink and the inactive view-switch
label are `#DADADA`. Increased-contrast and print styles retain their overrides.
The favicon seal and the social-card template carry the same ink and soft
ink literals, so their rasters are re-rendered whenever those 2 values
change.

## Typography and licence

The site uses IBM Plex from the official [IBM Plex repository](https://github.com/IBM/plex).

- IBM Plex Serif Regular and SemiBold: display and section headings. The serif is justified by the statute, ledger and public-record context.
- IBM Plex Sans Regular, Italic and SemiBold: navigation, body copy, controls and explanatory text.
- IBM Plex Mono Regular: rates, commands, versions, dates, evidence labels and tabular figures.
- Ozzit's lambda symbol uses Cambria Math, STIX Two Math or DejaVu Serif, with
  the browser's serif fallback last. These native fonts need no download.
  Mark only the symbol with `function-symbol`; keep identifiers as selectable
  text. The font check still rejects unsupported characters outside that
  exact markup and requires its fallback styling and font stack.

IBM Plex is licensed under the SIL Open Font License 1.1. The licence permits use, embedding, modification and redistribution, including bundling with commercial software, provided the font is not sold by itself and the licence and copyright notice travel with it. The repository self-hosts WOFF2 files and includes `assets/fonts/OFL.txt`.

The 6 files are IBM's unmodified Latin1 splits at tag `v6.4.2`, peeled
commit `242c4cccd37e87985a5337815c99b960ef13c65c`. The upstream paths, byte
counts and SHA-256 values are recorded in `assets/fonts/SOURCES.md`; each face
declares the characters the pages use as its `unicode-range`, which
`check_design.py` tests against every page. The declared set is 129,872 bytes
as shipped by IBM, down from 384,756 before the Latin1 splits. The 4 faces used by the
homepage total 84,268 source bytes before HTTP overhead, down from about
250 KB transferred, and all 4 are preloaded so `font-display: optional` has
every face by first paint. Four faces remain deliberate: Serif, Sans and Mono each
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

Display tracking is modestly negative except for the uppercase homepage masthead, which uses open tracking as a deliberate Pliny-influenced register mark. Body and mono tracking stay neutral. No all-caps eyebrow appears above every section.

## Spacing, shape and layers

- Base unit: 4px.
- Main sequence: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128px.
- Wide shell: at most 1360px with fluid gutters.
- Reading shell: at most 68ch.
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

The header is sticky, one line and at most 72px tall. Ryan Duguid appears as a text identity at left. Existing navigation labels and destinations remain exact. The Human and Machine view switch sits at the right end of the header at every width. The header uses paper transparency only if contrast remains solid; no blur or glass treatment is allowed.

### Footer

The existing advice disclaimer remains exact. It sits above About, GitHub and Machine-readable index links with a strong top rule. Footer type remains readable at 200% zoom.

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

An evidence record has 4 ordered parts:

1. claim
2. primary source or released artefact
3. reviewed date or version
4. human decision boundary

Mono labels and rules bind those parts without turning them into rounded cards. Proof sits beside the claim on wide screens and immediately after it on mobile.

## Homepage architecture

The homepage uses stacked one-thought viewports and does not use scroll snapping.

### Hero viewport: what to adopt

The first viewport centres one tool-led proposition above a ruled 3-part boundary register and answers 3 questions within 5 seconds:

- The site provides open-source accounting review controls.
- Sources and calculation working stay visible.
- The tools are review aids, not judgement or lodgement.

The primary action opens the cash-flow case; the secondary action opens Tools.
The workbook chart sits beside the proposition on desktop widths and directly
below it on mobile; the 4-task preview and real Coal LSL artefact follow. The
site states that it is a personal open-source index, not a practice, and does
not accept professional engagements.

### Adopt viewport

Pain first: a tool that has not been tested on fabricated data does not belong in a firm workflow. The 3 supported install commands and 3 evaluation packs are the proof. There is no trial funnel or signup language.

### Verify viewport

Pain first: a rate or AI answer without a source and review boundary cannot be relied on. Evidence and Assurance is the main destination. The viewport previews source, exact arithmetic, released artefact and human decision boundary.

### Collection registers

The homepage previews 4 review tasks. The full `/tools/` register groups the 11 controls by the work they stop or check:

- Extract records into reviewable shape.
- Calculate without hiding the branch, formula or rounding.
- Control incomplete work before manager review.
- Inspect sources, evidence and AI boundaries.

`/evaluate/` groups the 3 reproducible evaluation packs and `/rates/` groups the 3 maintained reference tables. These registers are not second homepage essays. Each entry names the observable control, delivery form, source and human boundary.

### Reference and principles

Rates and further references become one compact index. The 5 engineering principles read as working rules, not a marketing feature row.

## Inner-page system

About, Evidence, tool guides, evaluation packs and rate pages share one article frame:

- large page statement followed by one short answer
- sticky local contents on wide screens when it has at least 3 useful destinations
- 68ch reading column
- source and date metadata beside the relevant claim
- full-width table or code artefact where the content needs it
- footer boundary in the same position on every page

On mobile, the contents rail becomes a compact in-flow index. No body copy falls below 16px. Lines do not exceed the viewport. Shared head and footer delivery chrome may evolve across styled pages; rate main text, evidence facts and structured data remain untouched.

## Copy standard

Every changed visible sentence must pass these 5 principles:

1. One reading pass. A visitor can finish the claim without rereading it.
2. Pain first. Name the incomplete pack, late contribution, unbalanced trial balance or unsupported AI answer before the solution.
3. One ask per screen. The hero opens Tools; the remaining homepage routes are Adopt and Verify.
4. One viewport, one thought. Hero identifies; each route explains one action; catalogue indexes.
5. Visualise in the line. Prefer `READY is not sign-off` and `fund receipt within seven business days` to abstract quality claims.

Banned visible language includes: revolutionise, seamless, cutting-edge, leverage, unlock, delves, landscape, tapestry, in today's fast-paced, decorative AI-powered language, generic `Get started`, emojis, em dashes and en dashes.

Use Australian English and Oxford commas in original prose. Preserve exact
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

- `llms.txt`: SHA-256 `0E0DF71276D9C683960C968CFDF1FA9FD4F5DFF3A9457A9B1663A03F5DACAB5E`
- `robots.txt`: SHA-256 `8AADC951F1242DEC2EE46153F7F5EAA194AB5E32D88F2C5D416824B921693DAE`
- `sitemap.xml`: SHA-256 `AAB1255582EF87D87B3DFCD8B57AB8DBBCD330EDDCDBFF6C2CCDBC4A87AC9AB9`

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
- Common Crawl (CCBot) and Bytespider are allowed for open-web archival and
  training crawl. GPTBot, ClaudeBot, Applebot-Extended, Amazonbot, cohere-ai,
  Diffbot, FacebookBot, and meta-externalagent remain blocked
- `llms.txt` is the canonical machine index; `.well-known/llms.txt` is an
  identical generated copy. The existing build script maintains that copy and
  `llms-full.txt`. The XML sitemap contains indexable HTML only
- `llms.txt`, JSON-LD, rates, disclaimers and refusal boundaries remain the
  factual source of truth

The 11 September 2026 crawl-policy change authorises these crawler rules,
machine-index copies, and static source and definition improvements. It keeps
rate values, CSVs, engine behaviour, and release source-review dates intact.
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
method and boundary text. Its synthetic-example action precedes the inputs
and fits within the first viewport at 390 by 844 CSS pixels. The adjacent note
states that loading the example replaces the current inputs.

Adding a bonus focuses its amount. Removing a bonus focuses the next amount,
then the previous amount, then Add a bonus when none remain. Monthly-table
removal follows the same order through the remaining Remove buttons and
returns to Employee reference when the table is empty. On stacked layouts,
Calculate and Load the synthetic example focus and reveal the Result heading
without animated scrolling. Invalid submissions keep focus on the first
invalid input.

Once a result exists, edits to amounts, branches or bonuses show
'Inputs changed. Calculate again.' beside that result. The notice clears
only after a successful calculation, including the existing recalculation
before printing or adding an employee. The empty notice remains a live
region so its first update can be announced.

Tools uses smaller gaps around its introduction and supporting sections to
keep the task chooser and delivery labels within the existing page-length
limits. Print mode renders warning text in black.

The employee table chooses an unused automatic reference when a reference is
left blank, including after row removal. Its addition and removal confirmation
is visible below the entry controls and remains a live region. A note above
the controls tells visitors to download the CSV before leaving because the
table is not saved and clears on reload or when the page closes.
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
