# Website fact-check remediation

Reviewed 22 September 2026 (Australia/Sydney). Website baseline: `20975376daee112d721bbde0fcc56c6075a33d3d`. Accounting development reference: `19a5824af78cf281ccfc6b8f07f7e21b860ae1a7`.

This report records verification at the initial local handoff, before publication of the pull request. The supported corrections were implemented in an isolated website worktree. The original website checkout and the accounting source checkout were not edited. The handover supplied findings to investigate; its proposed wording and dates were not treated as verified facts.

## Finding outcomes

| Finding | Observation and verification | Disposition and affected sources |
| --- | --- | --- |
| F01 | Published checker 0.1.6 and quick-trial 0.1.5 both return `ON_TIME`, exit 0, for a timely receipt date without an amount. Version 0.1.6 adds an explicit assumption caveat. Development code separately requires amount evidence. | Added a prominent link beside the worked example and a release-specific explanation in `tools/payday-super/index.html#receipt-amount`. Qualified homepage, About, MCP, limitations and historical evaluation claims, including the concise machine index. Added the checker to `scripts/release_record.json`. Preserved evaluation 0.1.3 and quick-trial 0.1.5 pins. No engine fix or publication. |
| F02 | The rate-setting statute is the *Fringe Benefits Tax Act 1986* (Cth) s 6, not the Assessment Act. The latest Register compilation is C2018C00240, dated 19 June 2018. | Corrected visible attribution and structured citation in `rates/fbt-rate/index.html`; retained the historical table's 20 September verification date. Regression permits legitimate Assessment Act references for other purposes. |
| F03 | The current ATO summary has 27 selected rows matching the site's selection: 14 `TBD`, one `Various`, three with later application and nine with earlier application. `TBD` does not prove the absence of a draft, bill or instrument. | Replaced unsupported absence claims and narrowed the title, headings, FAQ and metadata in `rates/announced-not-yet-law/index.html`. CSV records ATO status source, review scope and application notes. The URL stays stable. |
| F04 | The reform Act distinguishes commencement, income-year application and acquisitions. Negative-gearing sch 2 item 5 applies from 2027-28; sch 2 commenced 27 June 2026. Inserted s 26-155(2)(a) concerns interests last acquired before 7:30 pm ACT legal time on 12 May 2026, with the contract rule in s 26-155(3). CGT has separate rules. | Replaced the blanket 2026-27 statement with sourced, scoped explanations of the negative-gearing exception and CGT application provisions. Prescribed activities, new-dwelling instruments and individual property eligibility remain outside the verified conclusion. No calculator logic changed. |
| F05 | The current primary sources support the rate values listed below. The standard deduction has residence, labour-income and actual-deduction conditions. | Preserved supported figures and old historical review dates. Added standard-deduction eligibility and interaction with actual expenses to the announced-measures FAQ, and business-claim eligibility to `rates/cents-per-kilometre/index.html#how-the-method-works`. |
| F06 | Coal LSL s 3B(1) supports the stated non-casual base-rate example. Existing integer monetary tests cover $7,125 eligible wages and $192.38 levy. Excel recalculation and an independent movement trace both reproduce cash minimum −$25,160. | Existing calculator, workbook, rounding and scope wording retained. No duplicate arithmetic implementation added to the site. Reproduction evidence accompanies this report. |
| F07 | Both public SAP badges identify Ryan Duguid, SAP as issuer, the stated qualification and valid dates. The hosted Xero certificate shows the stated dates. Public upstream records confirm both merged contributions. CA ANZ membership was not independently authenticated. | Preserved precise provisional membership wording, certificate-copy distinction and non-endorsement boundaries. No membership number or private identity evidence requested. |
| F08 | Local engines, installation downloads, MCP transport, AI host and optional network adapter have different boundaries. The development LodgeiT adapter is opt-in and separate from the standard MCP server. | Added component-specific wording to `evidence/index.html#data-and-privacy-boundary` and `tools/australian-tax-ai-agents/index.html`, with a link to website privacy. The concise machine index now distinguishes local engines from cloud AI-host transmission. No security-audit claim. |
| F09 | Content changes must propagate through the existing generators and contracts. | Regenerated full text, page text and the well-known index; updated sitemap, release record and scoped design digests. Added six deterministic fact-check tests to the existing site runner, and adjusted date fixtures and browser baselines for the edited content. Changelog unchanged, so feed regeneration was unnecessary; the feed check remains required. |

## Primary-source record

All sources below were read on 22 September 2026. A current-source check is distinct from a fresh audit of every historical row.

| Claim | Source and pinpoint | Result and boundary |
| --- | --- | --- |
| SG | [ATO super guarantee table](https://www.ato.gov.au/tax-rates-and-codes/key-superannuation-rates-and-thresholds/super-guarantee), updated 17 April 2026 | 12% from 1 July 2025. Qualifying earnings applies from 1 July 2026; earlier quarters used ordinary time earnings. |
| Annual maximum contribution base | [ATO maximum contributions base](https://www.ato.gov.au/businesses-and-organisations/super-for-employers/paying-super-on-payday/what-payments-are-qualifying-earnings/maximum-contributions-base), updated 10 August 2026 | $270,830 in 2026-27, per employer per employee. $32,500 × 100/12, rounded down to the nearest $10. An earnings base, not a contribution cap. Award obligations may differ. |
| Cents per kilometre | [Determination F2026L00785](https://www.legislation.gov.au/F2026L00785/latest/text), ss 2, 6 | 91 cents for the income year commencing 1 July 2026. No extrapolation to 2027-28. |
| Business use of kilometre method | [ATO method guidance](https://www.ato.gov.au/businesses-and-organisations/income-deductions-and-concessions/income-and-deductions-for-business/deductions/deductions-for-motor-vehicle-expenses/cents-per-kilometre-method), updated 27 May 2026 | Sole traders and partnerships with an individual partner; a car; maximum 5,000 business kilometres per car per year; private use excluded; retain a basis for the estimate. This business guidance is not a statement that employees cannot claim work-related car expenses. |
| FBT | [Rate-setting Act](https://www.legislation.gov.au/C2004A03281/latest/text), ss 6, 6A; [ATO rates table](https://www.ato.gov.au/tax-rates-and-codes/fringe-benefits-tax-rates-and-thresholds), updated 20 May 2026 | Section 6 sets 47%; s 6A's extra two points apply only to tax years beginning 1 April 2015 and 2016. ATO 2023–2027 table agrees with 47% and gross-up factors 2.0802/1.8868. Historical 2018–2022 table review was not renewed. |
| Coal LSL | [Coal LSL levy guidance](https://coallsl.com.au/employer/administer-lsl/levy); [Collection Act](https://www.legislation.gov.au/C2004A04352/latest/text), compilation 12 dated 1 September 2026, s 3B(1)–(4) | Current 2.7% on eligible wages. Base-rate branch compares A with 75% of the aggregate; expense reimbursements are excluded from the relevant allowances. Annual-salary and casual branches differ. |
| Standard deduction and reforms | [Tax Reform No. 1 Act 2026](https://www.legislation.gov.au/C2026A00049/latest/text), s 2; sch 1 items 60, 82–84; sch 2 items 1, 5; sch 4 pt 1 items 3, 17 | Assented 26 June 2026. Standard deduction applies from 2026-27: individual Australian resident for some of the year with assessable labour income; limited to the lesser of $1,000 and that income, then reduced, not below zero, by the specified actual deductions. Income-protection and association-membership exceptions are separately stated in inserted s 25-130(3). |
| Division 7A | [ATO annual table](https://www.ato.gov.au/tax-rates-and-codes/division-7a-benchmark-interest-rate), updated 1 July 2026 | 8.77% for year ending 30 June 2027, using the RBA figure published 5 June 2026. Substituted accounting periods need their own treatment. |
| Car depreciation limit | [ATO car thresholds](https://www.ato.gov.au/businesses-and-organisations/small-business-newsroom/car-thresholds-from-1-july), published 9 June 2026 | $69,883 for 2026-27; apply business-use proportion. The GST credit maximum and luxury car tax thresholds are separate. |
| Measure summary | [ATO latest law and policy](https://www.ato.gov.au/about-ato/new-legislation/latest-news-on-tax-law-and-policy), updated 18 September 2026 | Source-reported status for selected rows, not a finding about every legislative document. |
| Planning before enactment | [ATO guidance on announced measures](https://www.ato.gov.au/about-ato/new-legislation/guidance-on-tax-and-superannuation-measures) | Explains consequences of following existing law or anticipating changes. Does not prohibit clearly labelled planning scenarios. |

## Authoritative Library cross-check

Read the Library instructions, index and the following extracts under `C:\Users\-\Documents\Library\_reference\`. No Library files changed.

- `superannuation-instant-reference-rates-thresholds-and-checklists/p18-620-01.md`, ¶18-620, PDF p 60: annual maximum contribution base formula, reviewed 30 June 2026.
- `superannuation-superannuation-guarantee-scheme/p12-190-01.md`, ¶12-190, PDF p 75: annual base and per-employer treatment, including exemption-certificate context.
- `tax-examples-fringe-benefits-tax-fbt/p3-000-01.md`, ¶3-000, PDF pp 1–2: $10,000 type 2 benefit × 1.8868 × 47% = $8,867.96. The example supports arithmetic within its stated assumptions, not universal benefit eligibility.

The Library supplied authoritative reference material; current ATO and registered legislation established currency for the changed claims.

## Reproductions

### Payday checker

Installed exact published packages in isolated uv environments. Synthetic payday 6 August 2026; obligation $120; review date 20 August; ordinary due date 17 August. `reproduce_payday.py` records commands, inputs, outputs, standard output, errors and exit codes for each version.

| Case | Both 0.1.5 and 0.1.6 |
| --- | --- |
| Receipt 17 August, no amount | `ON_TIME`, exit 0; only 0.1.6 adds the full-receipt assumption caveat |
| Remitted 14 August, $120, no receipt date | `AT_RISK`, exit 2 |
| Same remittance case, explicit acknowledgement | `AT_RISK`, exit 0; acknowledgement does not prove receipt |
| Receipt 17 August, matched $60 | `UNPAID`, exit 2 |
| Receipt 17 August, matched $120 | `ON_TIME`, exit 0 |
| Receipt 18 August, matched $120 | `LATE`, exit 2 |
| Remittance 18 August, receipt 17 August | Rejected, exit 1, no report |

`matched_amount` takes precedence; `remitted_amount` is a fallback amount. Neither input authenticates a fund receipt. The development predicate `receipt_amount_evidenced` was inspected at the pinned revision, not run as a published release. The existing historical evaluation was not rerun or relabelled.

### Cash workbook

File: `assets/examples/lumbridge/lumbridge.xlsx`. SHA-256: `b150de6281fccb6dcb1d221c034b047eb610ad4064972c5d9ac9fca8916b8463`.

Opened read-only in a separate hidden Excel 16.0 instance, with macros disabled and external-link updates disabled. Workbook connections: zero; external Excel links: none reported. Automatic calculation was enabled. `CalculateFullRebuild()` ran after setting `Assumptions!B2` to 0 and 45. The workbook was closed without saving, and its hash stayed unchanged.

The named receipt-delay input moves the $44,000 `OPEN-V` receipt by calendar days. `Cash dates!C2:C35` drives weekly `SUMIFS` receipts and payments in `Cash 13 weeks!C2:D14`. Opening cash is `Sources!B12` ($30,000); each closing balance adds receipts and subtracts payments. A separate Decimal calculation re-summed every week's dated movements and agreed with all 13 Excel balances for both scenarios.

Zero-day delay minimum: $16,800. Forty-five-day delay minimum: −$25,160. Delayed weekly closing cash: $16,800; $15,600; $25,520; −$11,960; −$11,960; −$25,160; $17,640; $27,560; $49,680; $36,480; $79,280; $67,320; $67,320. The $15,000 buffer is a scenario assumption. These are synthetic forecasts, not observed business results.

### Coal LSL

The example is for a non-casual employee paid a base rate, with no bonuses in this fixture, $3,000 overtime/penalties and $500 non-reimbursement allowances. Formula A is $6,000; Formula B is 75% × $9,500 = $7,125. The higher amount × 2.7% is $192.375, rounded once to $192.38. Existing `scripts/levy.test.mjs` and the fixed proof-capture tests cover the result; they do not establish an individual worker's statutory eligibility.

## Credentials and privacy evidence

- [SAP Financial Accounting badge](https://www.credly.com/badges/750e7557-ab6d-4b28-a241-8252c263613a/public_url): issued to Ryan Duguid by SAP, 17 July 2026; expires 18 July 2027.
- [SAP Management Accounting badge](https://www.credly.com/badges/0f753c71-5f49-41be-8519-51e81030a8f1/public_url): issued to Ryan Duguid by SAP, 13 July 2026; expires 14 July 2027.
- Hosted Xero PDF: pdf-inspector found an image-only page; its local offline OCR read Level 3 certification, 1 July 2026, valid to 1 July 2027. This verifies what the hosted document states, not its authenticity or live issuer status.
- [OpenAccountants PR 85](https://github.com/OpenAccountants/openaccountants/pull/85): merged 11 August 2026, 10 changed files. Accepted contribution does not demonstrate deployment of all exporter prevention controls.
- [Meltano SDK PR 3727](https://github.com/meltano/sdk/pull/3727): merged 8 August 2026, two changed files. Refresh-token retention is in memory, not persistent configuration write-back.
- Accounting code and README at the pinned development revision distinguish the local engine/MCP path from `apps/lodgeit-calculator-adapter`. The adapter requires explicit enablement, a configured endpoint and an allowed host. AI-host transmission depends on the selected host and configuration.
- Camofox observed the live Coal LSL page loading local assets and Cloudflare Rocket Loader. This is consistent with the existing hosting boundary; a resource sample cannot prove the absence of every transmission in every configuration.

## GEO and answer accuracy

Ryan prioritised GEO over SEO. The final pass checked whether the concise machine index carries the qualifications needed for an AI answer. It removed the blanket claim that client data stays local, identified the cloud AI host boundary, linked the receipt-amount limitation, and distinguished published releases from the unreleased change and the historical evaluation. The PSC-1 entry now says that stale rates do not affect verdict calculation; it no longer claims every verdict is correct. The public limitations page and generated text carry the same distinction.

The existing structured data, canonical links, text alternates and source citations remain in place. A regression test checks the key qualifications in `llms.txt`, and the generator checks its identical well-known copy and the extracted page text. These checks establish consistency and local availability. They do not measure whether an external assistant retrieves, cites or recommends the site.

No fresh answer or citation benchmark was run. The repository's visibility benchmark separates mentions, citations and answer accuracy, and distinguishes branded from non-branded prompts. Measuring these changes would require fresh captured answers after publication; this task did not deploy the changes. Lighthouse's SEO result is a required technical check, not evidence of improved GEO visibility.

## Unresolved scope

1. Full-receipt inference remains in published checker 0.1.6 and quick-trial 0.1.5. The website now discloses it. Publishing a corrected engine was expressly outside this task.
2. No independent CA ANZ membership authentication or live Xero issuer verification was available. The site retains precise provisional wording and the hosted-certificate boundary.
3. The 14 TBD rows and the multi-part Various row have not each received an exhaustive Treasury, Parliament and Register search. They now report the ATO's wording without asserting legal absence.
4. New-dwelling and prescribed-activity instruments, individual property eligibility and every asset-specific CGT transition were not fully determined. The page identifies these limits and avoids a universal cut-off.
5. Older historical rate rows retain their original verification dates. This task's current-source checks do not renew every row or constitute a full tax-engine audit.
6. The automated live-link check receives HTTP 403 from Parliament's bills index. Camofox returned HTTP 200 and displayed the correct Bills and Legislation page. The valid primary-source link is retained, with no new exception or weaker rule in the link checker.

## Validation

The required environment was installed locally with the user's approval: Ruby 3.3.12, Bundler 2.5.22 and the locked Jekyll gems; Node 22.23.2; Python 3.12.10; uv 0.12.5; Ruff 0.16.6; Mypy 2.3.1; locked npm packages and Playwright Chromium. The Node archive matched the SHA-256 published on nodejs.org. Initial checks using the machine's Node 24 were superseded by runs using Node 22.

The first Node 22 browser run had two intermittent failures in unchanged features: a Coal LSL touch target was partly obscured after scrolling, and a question-filter count stayed at 10 despite the query. The corresponding tests passed on an untouched archive of the baseline commit (three applicable cases, one viewport skip). A second full run passed those cases but failed a font request with `net::ERR_NO_BUFFER_SPACE`. Those attempts and traces are retained; the reduced-concurrency rerun keeps every assertion. The underlying cause of the initial intermittent failures was not established. During the GEO follow-up, a further run lost its local preview server after 24 passing tests: 202 subsequent tests failed with connection-refused errors and eight skipped. The exit cause was not established. The log and first failed trace are retained; the rerun uses a separately logged preview process.

Final command results and browser evidence are recorded in the delivery report beside the patch. This repository report is excluded from the published site through the existing `docs` exclusion, confirmed against the native Jekyll output. No runtime dependency, calculator implementation, deployment configuration or package lock changed.

A standalone `check_design.py` invocation against unrendered source reported missing shared footer text and index links. That invocation omitted the rendered-site setup provided by `check_site.py`; the required runner passed those design contracts. The final GEO pass reused the successful Lighthouse and capture results because it did not change their seven measured routes, shared assets or capture inputs.

| Check | Final result |
| --- | --- |
| `python -m ruff check .` | Passed with Ruff 0.16.6. |
| `python -m ruff format --check .` | Passed, 45 files. |
| `python -m mypy` | Passed, 27 source files, Mypy 2.3.1. |
| `python scripts/check_site.py --offline` | Passed in the required environment. Includes native Jekyll build, source-selection checks, six new fact-check cases, existing contract mutations, rates register, SEO, agent-file safety, generated text/feed/manifests, local links and Node monetary tests. |
| `python scripts/check_site.py` | Failed only on the Parliament URL's HTTP 403. All prior checks passed; the runner stops at that failure, so later Node checks are evidenced by the complete offline run. No link-check exception was added. |
| `python scripts/release_record.py --verify-live` | Passed: published MCP 0.2.4, Ozzit 3.4.2, FP&A pack 0.1.1 and checker 0.1.6 match the reviewed record; Ozzit's asset size and hash match. |
| `npm run test:capture` | Passed, all three fixed-image and social-card capture checks under Node 22. |
| `npm run test:browser -- --workers=2` | Passed under Node 22: 226 passed, eight intentional viewport-specific skips, no retries. Five affected routes were added to the accessibility/page-health matrix. Initial default-concurrency failures remain documented above. |
| `npm run test:lighthouse` | Passed under Node 22: seven routes, three runs each, no assertion failures. Median performance 99 to 100; accessibility, best practices and SEO 100 on each route. |
| `npm audit --audit-level=high` | Passed, zero reported vulnerabilities, including development dependencies. |
| `node scripts/check_production.mjs` | Passed against the unchanged live site; 55 notes about injected inline scripts blocked by its CSP. This does not deploy or validate delivery of the local patch. |
| Scoped visual inspection | Reviewed homepage and changed receipt, FBT, reform and privacy sections at 390px and 1440px. No document overflow in the eight scoped captures. Existing wide tables retain their horizontal scrolling region. |
| Diff, generated output and publication scope | `git diff --check` passed. Design digests changed only for affected content and metadata. Internal report absent from `_site`. Feed and historical evaluation output checks passed. |

Checks not claimed at the initial local handoff: remote GitHub Actions execution, a Linux CI run, a full accounting-engine suite, fresh historical evaluation results, independent professional review, live issuer authentication of CA ANZ/Xero, and a complete legal search for every proposal or transition. The initial verification stage did not include publication or deployment; subsequent PR checks and deployment status are recorded on the pull request.

Ponytail full review: reused the site's generators, contract parsers and test runners; added no website dependency or parallel release manifest. No AI Slop review: checked factual scope, release distinctions, Australian English and the limits of each verification. The unresolved factual boundaries remain explicit above.

## PR follow-up

[PR 218](https://github.com/ryanduguid/ryanduguid.github.io/pull/218) adds the receipt-amount section to the Payday page contents, preserves the required evaluation-link order, and aligns the rates hub's announced-measures verification date. The review dates use Australia/Sydney; UTC timestamps on 21 September after 14:00 fall on 22 September locally.

GitHub [run 35624778953](https://github.com/ryanduguid/ryanduguid.github.io/actions/runs/35624778953) returned HTTP 403 for Parliament's bills index and the ATO cents-per-kilometre eligibility page. Camofox returned HTTP 200 and the expected content for both on 22 September. The link checker now handles those two exact URLs through its existing confirmed-denial policy, with the evidence and removal condition in CONTRIBUTING.md. Regression coverage rejects other statuses and neighbouring URLs. This replaces the initial unresolved link-check result above with an explicit manual-verification boundary; an accepted HTTP 403 is not proof of source availability.
