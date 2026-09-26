# Claim maintenance

## Review on 26 September 2026

- Engine pins: solomons-sword 0.1.8, the-exchequer-tally 0.1.7 and the-wip-tally 0.1.2
  were published on 26 September 2026. The trust distribution, company tax and
  construction WIP pages now pin their worked examples to those releases. Each command
  was rerun from PyPI, and the WIP test at the `the-wip-tally/v0.1.2` tag; the figures
  are unchanged. The trust example states residency with `--resident-during-year`, which
  0.1.8 requires. The changelog records the three releases.
- Payday Super: the tool page's quick trial now pins 0.1.7. The command was rerun on the
  synthetic CSV the site serves and still reports one `AT_RISK` row due 17 August 2026
  with exit 0. `scripts/release_record.json` and `llms.txt` follow the page, and the
  historical evaluation stays on 0.1.3.

## Review on 23 September 2026

- Coal LSL levy: `assets/levy.mjs`, the calculator page and its CSV export now carry the
  18 September 2026 check date and the primary source URL of the `coal-lsl-levy` register
  row, which records section 6 of the Regulations as read by automated retrieval that day.
  The calculator review in the 18 September entry below ran separately and kept the
  2 September date. The rate did not change. `scripts/levy.test.mjs` now fails when the
  constants and the register row disagree.

## Review on 20 September 2026

- Aus Accounting MCP: release 0.2.4 was published on 20 September 2026 (AEST) to GitHub, PyPI and the MCP registry, where it is active and latest. It superseded 0.2.3, published earlier the same day. It pins payday-super-checker 0.1.6, ato-benchmark-compare 0.1.8, div7a-loan-review 0.1.4 and australian-tax-calculators 0.1.3, the checker and the Division 7A engine released the same day and the other two pins unchanged. The AI-agents page, its pinned demonstration command, its structured `softwareVersion`, the changelog rows and `scripts/release_record.json` now name 0.2.4. The pinned command was run from a clean directory and its output matched the checked transcript, allowing for the CRLF line endings a Windows console writes.
- Payday Super: checker 0.1.5 carries the structural matching warnings into the canonical contributions CSV's `join_caveats` column, the report's caveats column and the evidence pack. The tool page's quick trial now pins 0.1.5; the command was rerun on the synthetic CSV and still reports one `AT_RISK` row due 17 August 2026 with exit 0. PSC-2 stays recorded against 0.1.4 with the release that carries the warnings noted on the limitations page and in `llms.txt`.
- ATO benchmarks: ato-benchmark-compare 0.1.8 gates the command line text, JSON and exit code on the supplied buckets, so ABC-1's two paths agree from that release. The entry stays recorded against 0.1.7 with the change noted. The worked example on the tool page keeps its 0.1.6 pin.
- The Payday Super evaluation keeps its 0.1.3 pin and the recorded development snapshot; no evaluation was rerun.
- Business calculators: each result now shows a "Sources applied" panel naming the formula, the figures the user supplied and the one statutory fact in play. The GST rate of 10% was read on the [ATO's How GST works page](https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/how-gst-works) (last updated 14 September 2026) and the [A New Tax System (Goods and Services Tax) Act 1999](https://www.legislation.gov.au/C2004A00446/latest/text) title was confirmed on the Federal Register the same day. The other eight calculators apply no rate or threshold, and their panels say so.
- Announced measures: the new `/rates/announced-not-yet-law/` page and its CSV repeat the ATO's [latest news on tax and superannuation law and policy](https://www.ato.gov.au/about-ato/new-legislation/latest-news-on-tax-law-and-policy) (QC43473, last updated by the ATO 18 September 2026, read 20 September 2026). Fifteen tax and super measures sit at TBD with no bill, three are enacted with a 1 July 2027 start, and nine are enacted and in force, including the $1,000 instant deduction, the instant asset write-off and the tax loss carry-back under the Tax Reform No. 1 and No. 2 Acts of 2026. Administrative funding rows were left out and the page says which. Bill links were not followed; the Acts and Royal Assent dates are as the ATO states them.
- Agent skills manifest: `.well-known/agent-skills/index.json` lists the 19 SKILL.md files of australian-accounting-skills v0.2.1 (commit 527b0a2) with sha256 digests computed from the raw release bytes by `scripts/build_agent_skills_manifest.py --write`; `--check` runs in the site checks. The Agent Skills site publishes no discovery manifest format, so the shape is this site's own and says so in its `format` field.
- Division 7A provenance: div7a-loan-review 0.1.4 adds `primary_url`, `retrieved_on` and `snapshot_sha256` to every row of `div7aloan/data/benchmark_rates.csv`, naming the RBA statistical table F5 workbook as the primary source; no rate value changed. `docs/rates-register.md` records those columns and no longer describes this site as an intermediate source between the engine and the RBA, because `verify_at` is now a convenience link rather than the source of the figure.
- Rates register: `rates/register/README.md` now states the review cadence (1 July rollover, May Budget, December MYEFO, sittings for dependent bills, new compilations, and reported errors checked before the next register version). `SHA256SUMS` was regenerated for the edited README.

## Review on 18 September 2026

- Section 3B of the [Payroll Levy Collection Act 1992](https://www.legislation.gov.au/C2004A04352/latest/text) was read in Compilation No 12 (C2026C00364, in force 1 September 2026), retrieved as EPUB from the Federal Register API because the web host refused every request from this machine. Paragraph 3B(1)(b) applies 75 per cent to the base rate of pay together with at-least-monthly incentive payments and bonuses, overtime or penalty rates, and allowances other than expense reimbursements. Endnote 4 records section 3B as inserted by Act No 142, 2011 and amended by Act No 43, 2023; Act No 63, 2026, which compilation 12 incorporates, did not touch it. The calculator's arithmetic already matched; one sentence of explanation did not and was corrected. The 2.7 per cent rate keeps its 2 September 2026 check date because the Regulations were not re-read. (Superseded on 23 September 2026; see that entry.)
- The [Coal LSL eligible wages guidance note](https://coallsl.com.au/guidance-notes/eligible-wages) was read on the same day. It sets Formula B out as 75 per cent of the total of the four components, which agrees with the Act as read.
- The two merged upstream contributions were confirmed through the GitHub API: [OpenAccountants pull request 85](https://github.com/OpenAccountants/openaccountants/pull/85) merged on 11 August 2026 across 10 files, and [Meltano SDK pull request 3727](https://github.com/meltano/sdk/pull/3727) merged on 8 August 2026 across 2 files. Merge status and file counts only; neither says anything about adoption, endorsement, or the accounting calculations here.
- The public site was fetched and compared with the privacy notice. Cloudflare rewrites email addresses in the delivered HTML into an obfuscated link and appends its own visitor-verification code, neither of which exists in this repository or the local build. The rewriting reaches the HTML pages only: the plain-text alternate of each page, the machine-readable index and the downloadable review template carry the address as written. The privacy notice now describes both additions, and every page that asks for a reply either spells the address out or links the contact page, which does.
- [Cloudflare's JavaScript Detections documentation](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/javascript-detections/), last updated 26 August 2026, was read on 18 September 2026. The script is injected into HTML page responses only, and the verification outcome is stored in a `cf_clearance` cookie that populates the `cf.bot_management.js_detection.passed` field for WAF custom rules and Workers. The notice's earlier claim that neither addition reports anything to the site owner was therefore removed: whether this zone reads that field depends on its own configuration, which was not inspected.
- Aus Accounting MCP: the AI-agents page named reference release v0.2.0 in its
  visible label, its release link and its structured `softwareVersion`, while its
  demonstration command already pinned 0.2.2. Release 0.2.2 is the current published
  release on GitHub (13 September 2026), on PyPI and in the MCP registry, where it is
  active and latest. The page now documents 0.2.2 throughout, and
  `scripts/release_record.json` records the published, documented and evaluated
  releases separately.
- The same page said the worksheet scope was fixed by australian-tax-calculators
  0.1.2 and linked that release. Published MCP 0.2.2 pins 0.1.3, so both were
  corrected. The supported-period table is identical in 0.1.2 and 0.1.3, so no scope
  claim changed.
- Ozzit: the published release is v3.4.1 (13 September 2026), whose asset is
  downloadable and matches its published SHA-256. The repository's default branch
  documents a prepared v3.4.2 cut whose tag, release page and download do not exist;
  a request for that asset returned HTTP 404 on 18 September 2026. The new
  `/tools/ozzit/` page documents v3.4.1, and the release record carries the
  unreleased version with that observation.
- Ozzit's 133 functions and 5 help tables remain correct: the released v3.4.1
  workbook carries 138 `oz.` defined names, and the repository's own AGENTS.md and
  release record state the 133 and 5 split.
- The profile's upstream contribution counts were one project and one pull request
  low. The profile's own date-bounded search returned 50 merged pull requests across
  16 projects as at 14 September 2026, 33 of them in OpenAccountants. Both counts and
  the project total were corrected; the links and the date bound are unchanged.
- The Lumbridge case figures were reproduced from source at the pinned commit:
  quarterly profit before income tax of $35,957.55 in both cases, October closing
  cash of $32,040.00 against ($11,960.00), a lowest daily balance of $16,800.00 on
  7 October against ($25,160.00) on 6 November, December closing cash of $67,320.00
  and a cash reconciliation difference of $0.00. The distributed workbook's SHA-256
  matches its sample record.

## Review on 14 September 2026

- The [ATO SG table](https://www.ato.gov.au/tax-rates-and-codes/key-superannuation-rates-and-thresholds/super-guarantee) matched every general-rate row on the site, including 12% from 1 July 2025. This check did not repeat the statutory timing review dated 30 August 2026.
- The [ATO Division 7A table](https://www.ato.gov.au/tax-rates-and-codes/division-7a-benchmark-interest-rate) matched the site's 2021-22 to 2026-27 rows, including 8.77% for 2026-27 and 8.37% for 2025-26. The earlier rows and original RBA derivation retain their 28 August review date. The ATO table applies to companies with a 30 June year end.
- Section 6 of the [2026 car-expense determination](https://www.legislation.gov.au/F2026L00785/asmade) sets 91 cents for the income year starting 1 July 2026 only. Section 6 of the [2024 determination](https://www.legislation.gov.au/F2024L00697/asmade) sets 88 cents from 1 July 2024 until repeal. Both instruments were read on the Federal Register. The figures and CSV data needed no change.
- The public SAP badges name Ryan Duguid and remain current: [Financial Accounting](https://www.credly.com/badges/750e7557-ab6d-4b28-a241-8252c263613a/public_url) expires on 18 July 2027; [Management Accounting](https://www.credly.com/badges/0f753c71-5f49-41be-8519-51e81030a8f1/public_url) expires on 14 July 2027. CA ANZ provisional membership and Xero certification remain owner-supplied statements; neither was independently verified in this review.
- The profile contribution searches returned 49 merged public upstream pull requests across 15 projects through 14 September 2026, including 33 in OpenAccountants. The README update changes both counts, its date and both date-bounded search links together.
- Ozzit's current README states 133 native LAMBDAs plus 5 help tables. Its current release is v3.4.1, published on 13 September 2026 Australian time. The profile machine index still named v3.4.0 and is updated separately.
- Australian Accounting Skills remains at 19 workflows in release v0.2.1 and 50 on main preparing v0.3.0. The website's eight current release references matched public release records. These checks did not rerun product evaluations or establish new capability claims.
- The source-freshness workflow creates date-only pull requests and flags newer stable releases for editorial review. There were no open website pull requests at this check. Fixed evaluation releases retain their historical pins.

## When a claim changes

Update profile counts and static badges when their source inventory changes. Distinguish published releases from development inventories.

Review current release rows and capability descriptions after a release alert. A newer version alone does not justify changing an evaluation: record a new run before claiming new results.

Read the relevant primary source before changing a rate or its verification date. Keep editorial review dates separate from source checks, and state the scope of a partial check. Regenerate the machine views after changing visible page text.

Review credential wording against the issuer's record or the owner's supplied evidence when status changes. Preserve provisional membership wording and the non-endorsement boundary.
