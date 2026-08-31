# duguid.com.au refined register design

Status: approved and implemented in the reviewed working tree on 31 August 2026

## Summary

Evolve the complete duguid.com.au site system without changing its public-register identity, information architecture, factual claims, professional boundaries, or static delivery model.

The result should feel easier to scan, shorter to traverse, and more consistent across mobile and desktop. It should remain an evidence-first register for Australian computational accounting work, not become a tax-practice website, SaaS funnel, portfolio, or AI product launch.

The implementation remains native HTML and CSS with the existing small, task-specific JavaScript files. No framework, component runtime, design-system package, animation library, search layer, or new production dependency is introduced.

## Design read

This is a preservation-led redesign for Australian accounting managers, technical adopters, and reviewers. The visual language is a cold OLED public register with statute-note typography, ledger rules, and restrained interaction feedback.

- `DESIGN_VARIANCE`: 6. Asymmetric desktop compositions with explicit single-column mobile collapse.
- `MOTION_INTENSITY`: 3. Focus, hover, pressed, target, and location feedback only.
- `VISUAL_DENSITY`: 5. Spacious introductions followed by compact registers and evidence records.

## Current-state audit

The live homepage audit at 1280 by 720 CSS pixels found:

- one clear H1 and a strong task-led proposition
- a 72px desktop header with five stable primary routes
- a 6,613 CSS pixel document with several sections over 1,000 CSS pixels tall
- 48 links and one real product screenshot
- IBM Plex Serif, Sans, and Mono used in distinct information roles
- high-contrast true-black OLED presentation with stamp green as the only accent
- strong skip navigation, landmarks, accessible names, and visible evidence boundaries

The mobile audit at 390 by 844 CSS pixels found:

- all five primary routes remain visible in a two-row header
- the hero proposition and main actions remain legible
- the sticky header consumes a meaningful part of the small viewport
- several page introductions and register groups require long vertical traversal
- informative notes and genuine warnings sometimes share the same alert-coral treatment

The repository already has unusually strong SEO, accessibility, performance, copy, crawler, and factual-integrity contracts. The redesign must improve usability without weakening those contracts.

## Goals

1. Make the homepage proposition and actions fit comfortably within the initial desktop viewport.
2. Reduce perceived homepage length through better grouping, composition, and section transitions.
3. Make collection registers faster to scan by task, evidence state, and human boundary.
4. Standardise the article frame across tools, evaluations, rates, evidence, about, contact, and changelog pages.
5. Improve mobile information density without shrinking body text or hiding primary navigation.
6. Differentiate information, evidence, warning, refusal, and review-required treatments.
7. Preserve or improve accessibility, performance, SEO, and Generative Engine Optimisation (GEO).
8. Keep the implementation minimal, dependency-free, and maintainable.

## Non-goals

- no framework or templating migration
- no content management system
- no client-side site search or collection filtering
- no theme switcher or light theme
- no new production dependency
- no animation library or scroll choreography
- no generated imagery, stock photography, portrait, mascot, or decorative illustration
- no new calculator or accounting logic
- no new routes, changed slugs, or renamed primary navigation
- no rewriting of protected rates, sources, disclaimers, boundaries, or JSON-LD facts
- no keyword-farm pages, synthetic FAQs, or content written only for machines

## Ponytail scope rule

Use the first existing or native mechanism that solves each problem:

1. Reuse current tokens and selectors where they are sound.
2. Prefer shared CSS changes over repeated per-page overrides.
3. Prefer semantic HTML and native elements over JavaScript.
4. Add a new class only when an existing pattern cannot express the required hierarchy.
5. Add no abstraction for a single use case.
6. Add no search or filter until collection size makes direct scanning measurably insufficient.

## Visual system

### Colour

Preserve the existing semantic palette and dark-only OLED contract:

- true-black canvas
- green-black paper surfaces
- off-white primary ink
- soft green-grey supporting ink
- stamp green for links, focus, route state, and verified evidence
- coral only for warning, refusal, destructive, or review-required meaning

Informational notes must not use the coral alert treatment. They use neutral rules or a restrained stamp-green evidence treatment.

No gradient, glow, violet, indigo, texture, decorative status dot, or section-level theme inversion is introduced.

### Typography

Preserve the official self-hosted IBM Plex files and their roles:

- IBM Plex Serif for display and major section statements
- IBM Plex Sans for navigation, body copy, forms, and controls
- IBM Plex Mono for sources, dates, rates, commands, versions, and tabular values

Use the existing fluid type scale. Improve hierarchy by adjusting measure, placement, and spacing before adding any new type size.

The homepage H1 must render in no more than two lines at the tested desktop viewport while remaining readable at 320px.

### Shape and hierarchy

- square register geometry remains the default
- controls retain the existing 2px radius
- content grouping uses rules, spacing, and alignment rather than generic cards
- normal content uses no shadow
- media and code retain the existing restrained 4px radius
- pills remain prohibited

### Motion and feedback

Motion communicates action or location only:

- link, focus, current-route, hover, and pressed feedback
- one-pixel pressed movement on buttons
- `:target` treatment for deep-linked records and headings
- no entry reveals, parallax, marquees, scroll hijacking, perpetual animation, or custom cursor
- reduced-motion mode removes all non-essential transitions

## Shared chrome

### Header

Desktop remains a one-line sticky header no taller than 72px.

Mobile keeps the identity row and all five visible navigation links. Vertical padding is tightened only where 44px touch targets and 200 per cent zoom remain intact. The header must not introduce a menu button, hidden route, horizontal scrolling, or JavaScript.

### Footer

The exact advice disclaimer remains unchanged. Footer navigation and machine-readable access are grouped consistently across every styled page. The footer must remain legible at 200 per cent zoom and in forced-colour mode.

### Breadcrumbs and local contents

Breadcrumbs remain on pages deeper than the collection root. They must describe real hierarchy and not appear on flat pages.

Local contents appear only when a page has at least three useful destinations. They remain sticky on wide screens and become an in-flow index below 768px.

### Callouts

Use separate semantic treatments:

- information: neutral rule and ordinary ink
- evidence or verified source: stamp rule and explicit source label
- warning or refusal: coral rule plus text label
- review boundary: strong neutral rule plus explicit human-decision text

Colour never carries the meaning alone.

## Homepage

### Hero

The hero keeps the approved H1, support copy, primary Tools action, workflow-discussion action, and source route.

Refinements:

- widen or rebalance the desktop display measure so the H1 fits in two lines
- keep the primary and secondary actions visible without scrolling at 1280 by 720 and 1440 by 900
- tighten the spacing between supporting paragraphs
- move secondary proof or source detail out of the main proposition sequence when protected contracts permit it
- preserve the three-part review boundary immediately after the hero

The hero remains free of trust logos, feature lists, version labels, scroll cues, decorative strips, and fake product previews.

### Review-task preview

Present Extract, Calculate, Control, and Inspect as a task index rather than four equal promotional cards.

Each record contains:

1. the work to review
2. a one-sentence purpose
3. one representative control
4. a clear route into the corresponding Tools anchor

Desktop may use an asymmetric ruled grid. Mobile uses one compact sequence with strong group headings and no repeated introductory copy.

### Worked proof

Keep the real Coal LSL calculator screenshot and its source routes. The proof must remain adjacent to the claim on desktop and immediately after it on mobile.

The image retains explicit width, height, responsive sources, descriptive alt text, and below-fold loading behaviour required by existing tests.

### Adopt

Keep the three supported commands exact. Present the install slab, prerequisites, and evaluation routes as one adoption sequence. Avoid repeating explanatory copy already established in the page introduction.

### Verify

Present claim, source, release/evaluation state, review date, and human boundary in a compact evidence ledger. Evidence and Assurance remains the main destination.

### Engage

Keep the existing enquiry categories, mail routes, client-data boundary, and engagement disclaimer exact. Improve the scan order so the bounded problem and safe first email are read before the enquiry routes.

### Principles and references

The five principles remain working rules, not feature cards. Rates, source projects, release policy, and review date become a compact closing register.

## Collection pages

### Tools

Keep the ten controls grouped by Extract, Calculate, Control, and Inspect.

Each tool record should expose, in a stable order:

1. control name
2. work or failure it addresses
3. delivery form
4. source or evaluation route
5. human review boundary

Use direct scanning rather than search or filtering. Group headings and anchor targets must remain easy to reach from the homepage and keyboard navigation.

### Evaluations

Each evaluation record exposes the fabricated input, fixed release, expected observable result, reproduction route, and limitation. No card treatment or progress score is added.

### Rates

Collection records expose the current value, applicable period, primary source, reviewed date, and route to history. Existing rate page text and data remain unchanged.

### Evidence

Evidence records keep claim, source/release, review date/version, and human boundary together. Credentials remain limited owner assertions and are never styled as endorsements.

## Inner-page article system

All tool, evaluation, rate, about, evidence, contact, and changelog pages share:

- one page statement and one concise answer-first introduction
- optional breadcrumb for real hierarchy
- optional local contents for three or more destinations
- a 68ch reading measure
- full-width tables, code, or proof only when the artefact requires it
- source and date metadata beside the relevant claim
- explicit boundary treatment in a consistent closing position

Wide tables use labelled horizontal scrolling at narrow widths. Code remains selectable, horizontally scrollable, and free of fake-terminal decoration.

## Responsive behaviour

### Desktop

- asymmetric compositions may be used where they improve hierarchy
- header remains one line
- local contents may stick beside the reading column
- proof sits beside the claim when space permits

### Below 768px

- every multi-column composition becomes an explicit single-column sequence
- local contents becomes in-flow
- proof follows its claim
- body text remains at least 16px
- standalone controls remain at least 44px in the smaller dimension
- no content or navigation requires horizontal page scrolling

### Tested widths

The implementation is visually and functionally checked at 320, 390, 768, and 1440 CSS pixels, plus the repository's existing desktop and mobile Playwright projects.

## Accessibility

Preserve or improve:

- one skip link, one labelled primary navigation, and one `main#main` per indexable page
- one H1 and sequential heading levels
- visible keyboard focus with at least 3:1 adjacent contrast
- WCAG AA text and control contrast
- 44px standalone touch targets
- descriptive link labels and image alt text
- table captions or nearby explanatory headings
- no colour-only warnings or statuses
- no horizontal overflow at tested widths
- forced-colour support
- reduced-motion support
- 200 per cent zoom readability

## GEO strategy

GEO means making the site easy for people and retrieval systems to understand, verify, quote, and cite. It does not mean creating a separate layer of machine-targeted prose.

Official Google guidance states that normal SEO foundations remain relevant to generative search, that unique and useful evidence matters more than commodity content, that semantic structure and crawlability help discovery, and that there is no special GEO schema requirement. Google also states that `llms.txt` neither helps nor harms Google visibility. The site therefore keeps `llms.txt` as a machine index for systems that choose to use it, without treating it as a ranking mechanism.

### Answerability

Each indexable page should answer its main question in the H1 and first concise paragraph. Headings should describe the factual topic or task, not use decorative labels. Important conditions, dates, rates, and boundaries must remain in visible HTML text.

### Entity clarity

Preserve the canonical Person entity, author references, professional-status qualification, Newcastle context, GitHub identity, and disambiguation from the United States software executive of the same name.

### Citation proximity

Keep each rate, calculation rule, software claim, release claim, and credential assertion beside its primary source or released artefact, reviewed date/version, and human boundary. Avoid distant reference dumps that make the supporting source ambiguous.

### Original evidence

Prioritise real tool outputs, reproducible evaluations, released source, exact arithmetic, public fixtures, and maintained rate tables. Do not add generic accounting explainers or query-variant pages that duplicate commodity information.

### Structured data

Preserve the existing WebSite, WebPage, Person, SoftwareApplication, Dataset, ItemList, and FAQ JSON-LD facts unless a verified factual update requires a change. Visible content and structured data must remain semantically consistent. Structured data is validated, but no invented or unsupported schema is added.

### Crawl and retrieval policy

Preserve the deliberate separation between search/user retrieval and model training:

- allow ordinary search crawlers
- allow `OAI-SearchBot` and user-requested ChatGPT retrieval
- allow `Claude-SearchBot` and user-requested Claude retrieval
- allow `PerplexityBot`
- continue blocking named training crawlers according to the repository's approved policy

OpenAI's current publisher guidance distinguishes `OAI-SearchBot` for ChatGPT search from `GPTBot` for potential training. Anthropic likewise distinguishes search and user-requested retrieval agents from `ClaudeBot`. Perplexity recommends allowing `PerplexityBot` for search visibility. The implementation must check current official documentation before changing any crawler name or rule.

### Freshness and discovery

- keep sitemap coverage exact
- keep canonical URLs exact
- keep accurate `dateModified` and visible review dates when substantive facts change
- keep collection pages linked from primary navigation and deep pages linked from their collections
- keep the machine-readable index visible in the footer and declared as a text alternate

### GEO non-goals

- no keyword stuffing
- no fan-out pages for query variants
- no synthetic FAQ expansion
- no hidden machine-only content
- no claims that a file or schema guarantees inclusion or ranking
- no inauthentic external mentions

## Protected contracts

The following remain unchanged unless the user explicitly authorises a factual or policy change:

- route paths, canonical URLs, and primary navigation labels
- `#engage`, `#adopt`, and Tools anchor destinations
- rate values, dates, sources, and explanations
- JSON-LD factual meaning
- advice and engagement disclaimers
- human review and lodgement boundaries
- credentials and owner-assertion qualification
- calculator arithmetic and evaluation fixtures
- supported installation commands
- `llms.txt`, `robots.txt`, and `sitemap.xml` policy and coverage, except a separately reviewed current-crawler correction

## Implementation shape

Expected shared changes:

- `assets/tokens.css` only if a reusable semantic token is missing
- `assets/site.css` for shared layout and component refinements
- semantic class and structure adjustments in page HTML files where the shared system requires them
- existing browser snapshots and design contracts updated only to reflect approved visual behaviour
- `GATES.md` added before implementation and removed only if repository policy later requires a different location

No production JavaScript file is added for navigation, layout, filtering, search, or animation.

## Unlazy acceptance ledger

Before implementation, create and lint `GATES.md`. The ledger must include runnable or explicitly manual outcomes for:

1. ledger lint quality
2. repository static checks and protected contracts
3. browser journeys in mobile and desktop projects
4. no serious or critical accessibility violations
5. no horizontal overflow at 320, 390, 768, and 1440px
6. homepage H1 and actions fitting the initial desktop viewport
7. exact primary navigation and valid homepage-to-Tools anchors
8. calculator and capture regressions
9. Lighthouse repository thresholds
10. GEO crawl policy, canonical, sitemap, alternate index, JSON-LD, author/entity, review-date, and citation-proximity checks
11. manual visual review in normal, forced-colour, reduced-motion, keyboard, and 200 per cent zoom states
12. final design-taste and UI/UX preflight review

Every runnable gate requires a reviewed command and a success-only expectation. No required gate may be silently removed. An impossible gate is recorded as an explicit abandonment and reported as incomplete.

## Verification commands

Repository-defined checks remain authoritative:

```text
python scripts/check_site.py
npm run test:browser
npm run test:capture
npm run test:lighthouse
```

The Unlazy gate checker will run only reviewed commands and scripts. Browser visual baselines are updated only after the new layouts have been manually inspected at the required viewports.

## Primary guidance used for GEO

- Google Search: <https://developers.google.com/search/docs/fundamentals/ai-optimization-guide>
- Google people-first content: <https://developers.google.com/search/docs/fundamentals/creating-helpful-content>
- OpenAI publisher guidance: <https://help.openai.com/en/articles/12627856-publishers-and-developers-faq>
- Anthropic crawler guidance: <https://support.anthropic.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler>
- Perplexity crawler guidance: <https://docs.perplexity.ai/docs/resources/perplexity-crawlers>

## Completion definition

The redesign is complete only when the complete site uses the refined shared system, every acceptance gate is met with current evidence, protected contracts remain intact, browser and Lighthouse checks pass, and a final visual and copy review finds no unfinished or inconsistent page.
