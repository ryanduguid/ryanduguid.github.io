# Browser quality evidence

Hands-on review completed on 28 August 2026. The refined visual baselines and
automated gates were inspected and rerun on 31 August 2026. This record
supplements the repeatable Playwright and Lighthouse checks. It is evidence of
the checks described below, not a claim of WCAG conformance.

## Test environment

- Windows 11 and Google Chrome 152.0.0.0 for the hands-on review.
- Playwright 1.62.1 with Chromium 151.0.7922.34 for the mobile and desktop
  browser matrix; Lighthouse 12.6.1 used that pinned browser for its recorded
  local audit.
- Fabricated calculator inputs only. No profile, cookies, storage state or
  credentials were captured.
- Snapshot refresh: `npm run test:browser:update`.
- Browser matrix: `npm run test:browser`.
- Performance matrix: `npm run test:lighthouse`.

## Automated results

- `npm run test:browser` collects 82 tests over its two projects, six of which
  are intentional project-specific skips, leaving 76 that run. The two capture
  specs are not part of that count: they run under a different config and
  project, and are described under Limits. Eleven approved routes passed the
  mobile and desktop page-shell matrix: one visible `h1`, `main#main`, primary
  navigation, no document-level horizontal overflow, no browser health errors,
  and no serious or critical Axe findings.
- The missing-route positive control proved that an unapproved HTTP 404 fails
  the health collector; the paired allow-list case passed only for its exact
  route and status.
- The homepage exposes one Tools action and exactly one Adopt and Verify section.
  The retired hash and path resolve quietly to the homepage. Protected fonts settle before line measurement: the
  desktop masthead has two lines, the mobile masthead has no more than three,
  and both route words stay intact at the 900-pixel wide-layout seam.
- Keyboard traversal reaches the last mobile primary-navigation link after the
  row scrolls, then reaches and activates the final catalogue category. The
  homepage has no document overflow at 320, 390, 768 or 1440 CSS pixels.
- The first calculator fieldset begins within the initial 390 by 844 mobile
  viewport. Its completed ledger also remains inside a 320-pixel document and
  keeps the levy value unbroken.
- The homepage proof retains lazy loading and low fetch priority. The browser
  scrolls it into view, confirms a positive natural width, awaits `decode()`
  and verifies its 868 by 580 intrinsic dimensions before either homepage
  baseline is captured.
- The calculator journey explicitly selected the base-rate branch, submitted
  fabricated Formula B figures, verified branch, eligible wages, levy and the
  explanatory comparison, and rechecked document overflow after rendering the
  result in both viewports.

## Inspected visual baselines

Each snapshot first loads the bundled IBM Plex faces, then reloads from the
warm browser cache. This makes the production `font-display: optional` choice
deterministic on local and hosted Windows runners without changing that choice.

- Desktop homepage, 1440 by 5388: the masthead occupies exactly two lines; one
  ruled Adopt and Verify register appears after the separate trust
  band; each route word stays on one line; the current result proof is visible;
  and the principles resolve as one lead cell beside four supporting cells.
- Mobile homepage, 390 by 7734: the masthead occupies three lines; primary
  navigation remains one horizontal row; no page edge is clipped; the decoded
  Formula B proof is visible with its values and caption; and the principles
  collapse to five legible cells.
- Mobile calculator result, 358 by 528: each label and value has separate
  alignment, numeric values remain unbroken, the green levy is dominant and the
  complete Formula B explanation is readable.

Each baseline passed its maximum one per cent pixel-difference assertion after
the approved refresh.

## Lighthouse results

Twelve new JSON reports were written under `work/lighthouse`, with three runs
for each route. The configured median assertions all passed.

| Route | Performance | Accessibility | Best Practices | SEO | LCP | CLS | Total blocking time |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Homepage | 0.98 | 1.00 | 1.00 | 1.00 | 1,952.983 ms | 0 | 0 ms |
| Tools | 0.98 | 1.00 | 1.00 | 1.00 | 1,802.733 ms | 0 | 0 ms |
| Evidence | 0.98 | 1.00 | 1.00 | 1.00 | 1,955.536 ms | 0 | 0 ms |
| Coal LSL calculator | 0.98 | 1.00 | 1.00 | 1.00 | 1,953.106 ms | 0 | 0 ms |

## Keyboard and focus review

- On the homepage, the first Tab exposed `Skip to content` with a solid 3 px
  focus outline. Enter set the `#main` target, and the next Tab continued with
  the first main-content call to action instead of replaying the header links.
- On the calculator, Tab traversed the shared navigation, one tab stop for the
  payment-method radio group, all numeric fields, `Add a bonus`, `Calculate`,
  the employee label field and `Add to table` in document order.
- Each reviewed calculator control had the same solid 3 px focus outline.
  Radio-group arrow-key behaviour remains native browser behaviour.

## 200 per cent zoom review

- Chrome's own zoom control reported 200 per cent. At that setting the CSS
  viewport was 531 px wide and both the homepage and calculator reported a
  531 px document scroll width, so neither introduced horizontal page scroll.
- The calculator's radio control, four numeric inputs, two action buttons,
  employee label input and table button each scrolled into view when focused.
  A hit test at the focused control's centre found it visible and unobscured.
- Visual inspection found readable reflow, full-width form controls and no
  clipped calculator actions. Chrome was reset to 100 per cent afterwards.

## Forced-colours review

- Chrome DevTools forced-colours emulation made
  `(forced-colors: active)` match on both pages.
- The homepage retained white body text, yellow links and a cyan 3 px focus
  outline without horizontal overflow.
- The calculator retained visible field and button borders, a distinct cyan
  selected radio state, readable result content and the cyan focus outline.
- Emulation was disabled afterwards and both tabs reported forced colours as
  inactive.

## Design-taste preflight

The finished refinement was checked as a preservation-led public accounting
register at `DESIGN_VARIANCE: 6`, `MOTION_INTENSITY: 2` and
`VISUAL_DENSITY: 5`.

- The site remains one true-black dark theme with stamp green as its only
  accent. Alert red remains reserved for refusal and warning semantics. Content
  and register surfaces stay square, while controls use the single documented
  2px control radius.
- IBM Plex Serif remains justified by the statutory-note and public-register
  identity. The centred homepage masthead remains justified as the ceremonial
  artefact rather than a generic split hero.
- The hero has its public-register label, two-line desktop or three-line mobile
  masthead, concise identity sentence and one Tools action. The trust band is
  separate. Adopt and Verify occur once in the register, have distinct intent
  and do not wrap on the wide layout.
- The desktop primary navigation stays on one line. Mobile navigation stays on
  one keyboard-scrollable row. The catalogue index is also keyboard reachable.
- Exactly three homepage technical labels remain, and each carries evidence or
  register context rather than decorative section numbering. The catalogue is
  grouped by four category destinations and the principles contain exactly five
  cells with one visual lead.
- The only product proof is the real local Formula B calculator result. It is
  fabricated-data-only evidence rather than generated imagery, stock imagery or
  a div-built fake product preview.
- No document overflow was measured at 320, 390, 768 or 1440 CSS pixels. Normal
  focus produced a solid 3px green outline. Reduced-motion emulation matched,
  changed root scrolling to `auto` and reduced the tested link transition to a
  near-instant duration. Forced-colours emulation matched, retained solid 3px
  focus outlines and calculator input borders, and produced zero overflow.
- The revised homepage and calculator strings contain no emoji, em dash, en
  dash or banned generic marketing phrase. The added strings were read against
  the Australian English requirement; `judgement` and `lodgement` remain the
  visible spellings.
- Motion remains limited to 160ms feedback and a one-pixel button press. There
  is no marquee, scroll cue, reveal, parallax, scroll listener, GSAP or perpetual
  animation. The calculator is synchronous, so a loading treatment does not
  apply; its ready, validation, error and result states remain present.
- There is no logo wall, testimonial, quote, image overlay, version label,
  decorative status dot, fake precision, progress track, weather strip,
  hand-drawn icon or mixed design system to assess. The grouped ten-tool public
  register is intentionally visible in document flow rather than hidden behind
  a marketing carousel or disclosure.
- Lighthouse confirms every route below 2.5 seconds median LCP, zero CLS and
  zero total blocking time.

The contextual exceptions are deliberate and approved: dark-only delivery and
true black, IBM Plex Serif, stamp green, sharp ruled geometry, 2px controls, the
centred manifesto masthead and one real local proof instead of the skill's
generated-image default. The measured masthead sizing, tracking, 23rem wide
route rail and mobile spacing also replace the plan's literal estimates because
they are what satisfy the binding line-count, no-wrap, keyboard and overflow
outcomes with the protected fonts.

The proof writer uses a fixed temporary sibling and atomic replacement rather
than a direct final-path write. The current WebP is 30,050 bytes, 868 by 580
and decodes in both homepage projects.

## Limits

The automated Axe scan covers detectable rules and this hands-on pass covers
the recorded keyboard, focus, reflow and forced-colours scenarios. It does not
replace assistive-technology testing, a complete WCAG audit or testing with
real client data.

The source checker validates the committed proof's RIFF/WEBP container marker
and 80 KB limit, but does not independently parse its intrinsic dimensions or
fully decode it. The browser checks provide the current decode and 868 by 580
intrinsic-dimension evidence; source-level image parsing remains an explicit
deferred limitation.

The focused capture check renders one fabricated Formula B result through the
same Playwright-served page used by the browser suite, then holds two images to
one contract: a RIFF/WEBP container, a canvas of 868 by 580 read from the WebP
header, and a file inside the 80 KB budget. It applies that contract to the
fresh render, then applies it again to the committed
`assets/coal-lsl-calculator.webp`. The second application does not run under
`--update-snapshots=all`, where the spec writes the tracked proof and returns
before it reaches that line. `check_design` holds the same published file to
the RIFF/WEBP container and the 80,000-byte budget in
`scripts/check_design.py`, so the 868 by 580 canvas is what this spec adds over
that gate. `renderCoalLslProofPage` pins the figures the picture shows,
matching Formula A, Formula B, eligible wages, the levy, the branch and the
explanation against `COAL_LSL_PROOF`, throwing when any has drifted, and
holding the captured panel to 868 by 580 before the screenshot.

The rendered bytes are never compared with the published bytes. That WebP comes
from `canvas.toDataURL` in whichever Chromium the runner carries, over a PNG
whose text the host rasterised, so the same page encodes to a different file on
a different machine: the committed proof is 30,050 bytes and a Linux render of
it came back at 28,078. CI runs the capture on `windows-latest` against a proof
captured elsewhere, where byte equality cannot pass. The check writes the
tracked proof only when snapshot-update mode is explicit. It runs under
`playwright.capture.config.mjs` in the `proof-chromium` project, alongside the
social-card capture spec, so neither is part of the `npm run test:browser`
count above.

The repository commits three screenshot baselines for `win32` only, two
full-page homepage captures and one capture of the calculator result panel.
`win32` is the platform the browser job runs on. A run on another platform has
no baseline to compare against, so it writes one and reports the test as
failed. The counts above are therefore the matrix as collected, not a claim
that every test passes on every platform.
