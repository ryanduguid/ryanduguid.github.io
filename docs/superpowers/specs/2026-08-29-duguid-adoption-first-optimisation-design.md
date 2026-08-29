# Adoption-first optimisation for duguid.com.au

Status: approved in chat on 29 August 2026

## Summary

duguid.com.au will become an adoption-led catalogue for Ryan Duguid's
open-source Australian accounting controls. The work preserves the current
OLED public-register identity, existing factual claims, tool URLs and
professional boundaries. It improves the information architecture, shortens
the homepage, adds three collection hubs, makes calculator behaviour clearer,
completes social metadata and fixes the remaining crawl-hygiene gaps.

The primary success action is browsing or adopting a tool. A workflow enquiry
is secondary. The site remains about the tools rather than Ryan as a
personality, so it will not use a portrait.

## Current evidence

The implementation baseline is main commit
63d009065b8c6f1a0e8319524410f2713f6e55c6, the released result of pull request
45.

Fresh checks against that tree established:

- python scripts/check_site.py passes, including 24 design mutation cases, 16
  public-contract mutation cases, 21 levy-engine tests, SEO and schema checks,
  and all internal and external links.
- npm run test:browser passes 38 tests with four intentional
  project-specific skips.
- The browser suite covers axe checks, keyboard reachability, responsive
  overflow, calculator journeys, browser health and reviewed visual baselines.
- The existing browser evidence records 200 per cent zoom and forced-colours
  observations.
- The page does not have document-level mobile overflow. The primary
  navigation is an intentional, keyboard-reachable horizontal scroll row.
- The current sitemap has 20 entries: 19 indexable HTML pages and llms.txt.
- The directories tools, rates and evaluate have child pages but no index page.
- Nine indexable pages still lack og:description, twelve lack twitter:card,
  and all nineteen lack Open Graph image alt text and dimensions.
- The current shared social PNG is 572,337 bytes.
- ATO Benchmarks and Trust Distributions already have suitable description
  lengths. Payday Super and Australian tax AI agents remain 165 characters.
- Search Console verification and the prior Bing submission are already
  complete. They must not be repeated as part of this task.
- Open pull request 44 contains the stronger OLED register-card design and
  explicitly supersedes the older card work in pull request 40. Both pull
  requests are currently dirty against main.

## Goals

1. Make tools and maintained rates directly discoverable from every page.
2. Give the homepage one primary adoption path and less competing content.
3. Add stable collection routes for tools, evaluation packs and rates.
4. Preserve inspectable proof, current primary sources and human-review
   boundaries.
5. Make the Coal LSL calculator's zero-value, help, print and export behaviour
   explicit and accessible.
6. Complete share metadata with small, contextual register cards.
7. Improve crawl hygiene without repeating webmaster-account setup.
8. Preserve the current performance, accessibility and dependency boundaries.

## Non-goals

- No portrait, stock image, generated image, mascot or personality-led brand.
- No testimonial, client name, outcome or independent endorsement unless a
  separately verified source exists.
- No calculator arithmetic, statutory rate, identity, credential, capability,
  source claim, disclaimer or professional boundary change. Navigation and
  collection structured data may change only to match the approved new
  information architecture.
- No contact form, upload, client-data collection, local storage, analytics or
  third-party tracking.
- No new public-page runtime dependency or static-site generator.
- No claim that GitHub Pages serves configurable response headers or immutable
  caching.
- No DNS, CDN, hosting, Search Console, Bing, repository-setting or other
  external-account change.
- No push, pull request, merge, deployment or modification of pull requests 40
  and 44 without separate authority.
- No claim of manual screen-reader conformance. That remains an unverified
  human acceptance activity.

## Information architecture

### Primary navigation

The exact primary navigation order will be:

1. Tools, linking to /tools/
2. Rates, linking to /rates/
3. Evidence, linking to /evidence/
4. About, linking to /about/
5. Contact, linking to /#engage

GitHub, Awesome List, Evaluations and the machine-readable index move to a
secondary footer group.

An exact current page uses aria-current="page". A child page marks its parent
collection with aria-current="location", for example Tools on a tool or
evaluation page and Rates on a rate page. The Contact link does not claim a
current state.

The mobile navigation remains a single horizontal scroll row. Focused links
must scroll fully into view, retain a visible focus indicator and never widen
the document.

### New routes

Three indexable collection pages will be added:

- /tools/
- /evaluate/
- /rates/

Every existing child URL remains unchanged. The compatibility redirect at
/tools/review-ready-gate/ remains unchanged.

The XML sitemap will contain the 22 canonical HTML pages after the three hubs
are added. llms.txt will be removed from the XML sitemap because it is a
machine-retrieval resource rather than a search-result candidate. It remains
linked visibly, declared through the existing alternate relationship and
available under the existing robots policy.

### Breadcrumbs

Child breadcrumbs will point to their real collection page:

- Home / Tools / child tool
- Home / Tools / Evaluations / child evaluation
- Home / Rates / child rate

This removes the current duplicate breadcrumb destinations. BreadcrumbList
structured data must match the visible hierarchy.

## Homepage

### Lead

The exact homepage H1 will be:

Review-ready controls for Australian accounting work.

The supporting copy will be:

Open-source checks for payroll, Xero, workpapers and AI workflows, with every
source and calculation kept visible.

The primary action is Browse the tools and links to /tools/. The secondary
action is Discuss a workflow and links to /#engage.

The existing trust boundary remains exact and immediately follows the lead:

Review aids only. No client files. No lodgement. Human sign-off.

### Sequence

The homepage content order will be:

1. Tool-led statement and the two ordered actions.
2. Existing trust boundary and register scope.
3. Compact four-category tool preview.
4. The real Coal LSL result proof.
5. Concise adoption and verification records.
6. Secondary workflow-enquiry record at #engage.
7. Rates, principles and footer references.

The existing equal-weight Engage, Adopt and Verify hero register is removed.
The anchors #engage, #adopt and #verify remain valid. Their sections become
content-sized records rather than full-viewport routes.

The homepage preview has Extract, Calculate, Control and Inspect entries. Each
entry carries one sentence, one representative tool and a link to the matching
anchor on /tools/. The complete ten-tool catalogue lives only on /tools/.

The implementation records the current document height before changing code.
At 390 by 844 and 1440 by 900 CSS pixels, the finished homepage must be shorter
than that baseline, contain no viewport-based route minimum height and retain
zero document overflow.

## Collection pages

### Tools

The Tools page groups all ten tools under Extract, Calculate, Control and
Inspect. Each entry exposes:

- the task it checks or stops;
- delivery type, such as Browser, Python, MCP, skill or project guide;
- the direct guide or calculator route;
- the source repository;
- a reproducible evaluation when one exists; and
- the human decision or data boundary.

These are ruled register rows, not cards or pills. Ten entries do not justify
client-side search or filtering.

### Evaluations

The Evaluations page lists the three reproducible packs. Each entry states the
fabricated input, expected result, fixed source release, limitation and direct
reproduction page. Evaluations remain part of the Tools adoption path rather
than a primary navigation item.

### Rates

The Rates page lists the three maintained references. Each entry states the
current value or scope, verified date, primary source, HTML page and downloadable
CSV where available. It does not duplicate the full tables.

### Structured data

Each hub uses a WebPage, BreadcrumbList and ItemList within the existing
canonical Person graph pattern. Child counts and positions must exactly match
the visible entries.

The ten-tool ItemList moves from the homepage to /tools/, where all ten entries
are visible. The homepage retains its WebSite and Person graph and may describe
only the four category previews it visibly presents. Existing identity,
credential, capability, rate and boundary values remain semantically unchanged.

## Existing content pages

### About

The About header becomes one short, tool-led paragraph:

I build open-source controls for Australian tax, payroll, ledgers and
workpapers. They show sources and working, use fabricated examples, and leave
judgement and lodgement with a person.

Credential, identity, advice-boundary and authorship facts remain in their
existing records. No portrait is added.

### Evidence

The visible H1 becomes:

Evidence behind the tools

The opening becomes:

This register links public claims to identity records, releases, primary source
reviews, repository controls and reproducible tests. It supports limited claims
about the software. It does not turn an output into advice, approval, a
compliance decision or a lodgment.

No evidence record, limitation, source or assertion is removed. The shorter
header changes scanning, not substance.

### Review dates

Rate pages already show a verified source line beside the heading. Existing
tool and evaluation pages move their published or last-reviewed line from the
end of the article to the article header. The value and source remain
unchanged.

## Coal LSL calculator

### Calculation flow

The protected calculation flow remains:

form controls -> assets/levy-form.mjs -> assets/levy.mjs -> result ledger

The result may then flow into the in-memory employee table and a locally
generated CSV. No value crosses the network or survives a page reload.

### Blank monetary inputs

Zero wages is a valid tested result, so monetary fields do not become required.
A form-level note states that blank monetary fields are treated as $0.00. Every
monetary control includes that common note plus its field-specific note in
aria-describedby.

Dynamic branch templates must create unique note identifiers and preserve
descriptions when validation messages are added or cleared.

When all monetary inputs are blank, the result still shows $0.00 but adds an
explicit explanation that no eligible wages were entered and blank amounts
were treated as zero.

### Validation

The casual reporting month remains required. Existing invalid, negative and
malformed input handling remains focused and inline. The first invalid control
receives focus, aria-invalid and an associated alert message.

### Result actions

After a successful calculation the result exposes:

1. Print working
2. Add to monthly table

Print working calls the browser print flow and uses a dedicated print
stylesheet. The print view contains the calculation inputs, branch, formula,
eligible wages, levy, source-reviewed date and professional boundary. It
removes navigation and interactive controls. It does not include an employee
identifier by default.

The employee label becomes Employee reference. Its example becomes EMP-001 and
nearby copy asks for a non-identifying reference and says not to enter a
person's name, tax file number or other direct identifier.

Export CSV becomes Download CSV. The existing in-browser Blob generation,
formula-injection hardening and aggregate-from-total-wages behaviour remain
unchanged.

## Social metadata

### Card system

The implementation ports the useful OLED register-card concept and provenance
from pull request 44 into the new branch without changing that remote pull
request. Pull request 40 is treated as superseded.

Five 1200 by 630 PNG cards are produced:

- site
- tools
- evaluations
- rates
- evidence

About uses the site card. Child pages use their collection card. This avoids 22
near-identical assets while giving each major shared context a truthful preview.

One editable SVG template and a small data file are the sources. A
development-only renderer uses the repository's existing Playwright dependency
to produce deterministic PNGs. It adds no public runtime dependency. Each PNG
must remain under 50 KB and retain documented source, method and checksum
provenance.

### Page metadata

Every one of the 22 indexable HTML pages includes:

- unique title and meta description;
- canonical URL;
- og:title;
- og:description;
- og:type;
- og:url;
- og:image;
- og:image:type;
- og:image:alt;
- og:image:width;
- og:image:height;
- twitter:card;
- twitter:title;
- twitter:description; and
- twitter:image; and
- twitter:image:alt.

Page titles and descriptions remain page-specific even when a collection image
is shared. Image alt text describes the actual collection card.

The Payday Super and Australian tax AI agents descriptions are reduced from 165
characters, and the 159-character Coal LSL description is tightened at the same
time. All three target the recommended 120 to 155 character range. Descriptions
already in that range are not rewritten merely for uniformity.

## Privacy, security and hosting

Every styled page gains:

<meta name="referrer" content="strict-origin-when-cross-origin">

No ineffective headers file is added. HSTS, X-Content-Type-Options,
Permissions-Policy, anti-framing controls and full response-header CSP require
a configurable CDN or host. Adding one would change DNS, TLS and operational
ownership, so it is a separate future decision.

Asset filenames are not fingerprinted in this change. GitHub Pages controls
the observed ten-minute cache header, and hashed names cannot create immutable
caching without response-header control. The site is already small, so
repository-wide filename churn is not justified.

No analytics is added. When separately requested, adoption can be assessed
through the already configured Search Console and existing public release or
package signals without adding client-side tracking.

## Performance and accessibility

The true-black OLED palette, IBM Plex typography, register rules and
dark-only design remain. The proof image remains lazy and explicitly sized.
No page loads a social card during normal browsing.

Acceptance requires:

- no document overflow at 320, 390, 768 or 1440 CSS pixels;
- focused mobile-navigation links fully visible;
- touch targets of at least 44 CSS pixels where already required;
- logical headings, one main#main and one H1;
- clean serious and critical axe results;
- keyboard access and visible focus;
- reduced-motion and forced-colours behaviour retained;
- no layout shift from the new hubs or proof placement;
- no new runtime dependency; and
- no regression in the current Lighthouse category thresholds.

A manual screen-reader session is desirable but must be reported as unverified
unless it is actually performed.

## Error handling

- A missing child route continues to use the true HTTP 404 page with noindex
  and recovery links.
- Hub links are checked on disk and externally before release.
- A failed social-card render must fail without overwriting the last good PNG.
- Card dimensions, byte caps, source text and checksums are contract tested.
- Calculator validation never replaces or disconnects persistent field help.
- A zero calculation is explicit, not an error.
- Contact remains a mailto route with the existing no-client-data warning. No
  form submission failure state is introduced.

## Test-first implementation slices

### Slice 1: information architecture

Write failing contract tests for the three hubs, exact navigation order,
current-state semantics, real breadcrumbs, sitemap coverage and llms.txt
exclusion. Then add the pages and update shared delivery chrome.

### Slice 2: homepage and content hierarchy

Write failing source and browser assertions for the exact H1, ordered actions,
compact category preview, proof placement, retained anchors, shortened About
and Evidence headers, early review dates and responsive document height. Then
make the content and CSS changes.

### Slice 3: calculator interaction

Write failing engine-adjacent and browser tests for the blank policy,
described-by relationships, zero explanation, print presentation, privacy-safe
employee reference and Download CSV wording. Then change only the form,
presentation script and print CSS. assets/levy.mjs remains byte-identical.

### Slice 4: social metadata

Write failing source tests for the five card mappings, complete metadata,
description lengths, deterministic generation, dimensions, byte caps and
provenance. Then port the accepted PR 44 concept and generate the cards.

### Slice 5: whole-site verification

Review intentional visual changes before accepting new snapshots. Run:

- python scripts/check_site.py
- npm run test:capture
- npm run test:browser
- npm run test:lighthouse
- git diff --check

The browser routes add the three hubs. Lighthouse adds the adoption-critical
Tools hub to the current homepage, Evidence and Coal LSL set. The final report
must name any check not run and any unverified manual acceptance.

## Likely repository changes

The plan may refine exact test locations, but implementation is expected to
touch:

- index.html
- about/index.html
- evidence/index.html
- tools/index.html
- evaluate/index.html
- rates/index.html
- existing indexable HTML pages for shared navigation and metadata
- tools/coal-lsl-levy/index.html
- assets/site.css
- new contextual social-card sources and PNGs
- sitemap.xml
- llms.txt
- DESIGN.md
- README.md
- scripts/site_contracts.py and focused metadata or renderer checks
- tests/browser/site-quality.spec.mjs
- tests/browser/calculator.spec.mjs
- reviewed browser snapshots
- Lighthouse configuration

Protected rates, calculator arithmetic, crawler policy, Google verification
file, disclaimers and unrelated work remain unchanged.

## Release boundary

The implementation remains local until Ryan separately authorises remote work.
No action on pull requests 40 or 44 is implied by approving this design. If a
future pull request is authorised, its description must identify the ported PR
44 card concept, the deliberate non-use of a portrait or tracking, the hosting
constraints, the verification evidence and every manual check not performed.
