# Browser quality evidence

Reviewed locally on 28 August 2026. This record supplements the repeatable
Playwright and Lighthouse checks. It is evidence of the checks described
below, not a claim of WCAG conformance.

## Test environment

- Windows 11 and Google Chrome 152.0.0.0 for the hands-on review.
- Playwright 1.62.1 with Chromium 151.0.7922.34 for the mobile and desktop
  browser matrix; Lighthouse 12.6.1 used that pinned browser for its recorded
  local audit.
- Fabricated calculator inputs only. No profile, cookies, storage state or
  credentials were captured.

## Automated results

- Seven approved routes passed the mobile and desktop page-shell matrix: one
  visible `h1`, `main#main`, primary navigation, no document-level horizontal
  overflow, no browser health errors, and no serious or critical Axe findings.
- The missing-route positive control proved that an unapproved HTTP 404 fails
  the health collector; the paired allow-list case passed only for its exact
  route and status.
- Homepage mobile and desktop baselines and the mobile Formula B calculator
  baseline passed with a maximum one per cent pixel-difference allowance.
- Three-run Lighthouse medians passed every configured assertion. Performance
  was 0.99 for the homepage, 0.98 for Evidence and 0.98 for the calculator;
  Accessibility, Best Practices and SEO were 1.00 for all three. Median LCP
  was 1,802 ms, 1,953 ms and 1,952 ms respectively. CLS and total blocking
  time were zero in every run.

## WebMCP progressive enhancement

- A pre-navigation test host captured exactly four calculator registrations on
  mobile and desktop, including strict schemas and read-only annotations. It
  executed the Formula B scenario through the registered tool and verified
  that an employee-label sentinel was neither read nor returned.
- The local Chrome 152 secure context did not expose `document.modelContext`.
  The calculator therefore followed its intended no-op path and loaded without
  a console, page or request error. Native discovery remains conditional on a
  browser build that exposes the evolving WebMCP API.

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

## Limits

The automated Axe scan covers detectable rules and this hands-on pass covers
the recorded keyboard, focus, reflow and forced-colours scenarios. It does not
replace assistive-technology testing, a complete WCAG audit or testing with
real client data.
