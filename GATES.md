# Gates: duguid.com.au refined register

OWNS: GATES.md, index.html, tools/index.html, evidence/index.html, assets/site.css, tests/browser/**, scripts/check_design.py, scripts/test_contracts.py, docs/superpowers/**

Scope: refine the complete static site system while preserving content, accessibility, performance, SEO and GEO contracts

- [x] G0: this ledger states executable outcomes that can fail
  CHECK: node "C:/Users/-/.codex/skills/unlazy/scripts/gate-lint.mjs" GATES.md
  EXPECT: LINT OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\-\Documents\Codex\2026-08-31\can-you-improve-the-ui-ux\work\site-source; path=934dd37bab06/26 entries; EXPECT=matched; output-sha256=a8ed3ad192b9f98bdf6c5e94f2c9c8d048c0b16bbdb67f82a878e840b8541256; output-bytes=706

- [x] G1: repository static, factual, SEO and GEO contracts pass
  CHECK: python scripts/check_site.py
  EXPECT: site checks passed
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\-\Documents\Codex\2026-08-31\can-you-improve-the-ui-ux\work\site-source; path=934dd37bab06/26 entries; EXPECT=matched; output-sha256=1eda7e685408e9fa79f0757c38da294c10daaa3844f283214322b822b4c9c64b; output-bytes=88230

- [x] G2: responsive browser journeys and accessibility checks pass
  CHECK: npm run test:browser
  EXPECT: passed
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\-\Documents\Codex\2026-08-31\can-you-improve-the-ui-ux\work\site-source; path=934dd37bab06/26 entries; EXPECT=matched; output-sha256=3d7a9a94c9fe3fdd82bc3cd4f8d1bc0c84a803c99e4774d4cef9c4dad7ca328f; output-bytes=13861

- [x] G3: calculator proof and social-card captures remain reproducible
  CHECK: npm run test:capture
  EXPECT: passed
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\-\Documents\Codex\2026-08-31\can-you-improve-the-ui-ux\work\site-source; path=934dd37bab06/26 entries; EXPECT=matched; output-sha256=cb1da5f47f151f772fcbc778f90de48817c94657c815378ba4f7b41d8c5dac3c; output-bytes=1842

- [x] G4: Lighthouse meets the repository performance and quality thresholds
  CHECK: npm run test:lighthouse
  EXPECT: Done running autorun
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\-\Documents\Codex\2026-08-31\can-you-improve-the-ui-ux\work\site-source; path=934dd37bab06/26 entries; EXPECT=matched; output-sha256=4ceb1041b392beb637633db9c41b7b5f420aee24c53157b61e8f585977fe4cb3; output-bytes=2279

- [x] G5: normal, keyboard, forced-colour, reduced-motion and 200 per cent zoom states are visually reviewed at 320, 390, 768 and 1440 CSS pixels
  EVIDENCE: 31 August 2026 manual review: normal desktop/mobile baselines and 320/390/768/1440 browser states showed no clipped content or page overflow; all five primary routes remained visible; skip-link and primary-link focus used a 3px solid stamp-green outline; forced-colour emulation at all four widths produced Canvas/CanvasText contrast, a 3px system focus outline and intact rules without overflow; reduced-motion emulation matched and changed smooth scrolling to auto with 0.00001s transitions; 200 per cent zoom retained readable type, intact controls and layout-width containment while the visual viewport narrowed as expected; both CTAs stayed one line and 44px high; seven visible standalone calculator controls were at least 44px high; labelled tabindex-0 table/code regions retained local horizontal scrolling; homepage links had no empty or generic-purpose labels.

- [x] G6: the final diff passes Ponytail, design-taste, UI/UX and GEO scope review with no protected-content drift
  EVIDENCE: 31 August 2026 final review: preservation-led dark public-register system retained OLED black, IBM Plex, stamp green, square/2px geometry, 16px-plus body text and four distinct homepage layout families; desktop H1 is two lines and CTAs are visible, single-line and non-duplicative; coral remains limited to explicit boundary/warning meaning while information/provenance use neutral or stamp rules; no em dash, en dash, gradient, glow, decorative dot, pill, fake screenshot, generated image, dependency, framework, production JavaScript, search, filter or speculative abstraction was added; collection/article layouts collapse below 768px and changed visible copy remains natural Australian English; static contracts confirm canonical, sitemap, alternate index, JSON-LD, author/entity, review-date and citation-proximity requirements; robots.txt, llms.txt, sitemap.xml, rate files, calculator modules and structured-data meaning are unchanged.

## Task 5: GEO and authority verification (31 August 2026)

- Official crawler guidance reviewed: [OpenAI Publishers and Developers FAQ](https://help.openai.com/en/articles/12627856-publishers-and-developers-faq) confirms `OAI-SearchBot` is required for ChatGPT search discovery and `GPTBot` is the separately controllable training crawler; [Anthropic crawler guidance](https://support.anthropic.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler) confirms `Claude-SearchBot` is search indexing, `Claude-User` is user-directed retrieval, and `ClaudeBot` is the training crawler; [Perplexity crawler guidance](https://docs.perplexity.ai/docs/resources/perplexity-crawlers) confirms `PerplexityBot` surfaces and links search results rather than crawling for foundation-model training, while `Perplexity-User` supports user actions. The protected policy retains the expected search/retrieval versus training separation; no policy change is indicated.
- `python scripts/test_contracts.py`, exit 0: `contract tests passed (29 design mutations, 47 public-contract mutations)`.
- `python scripts/check_seo.py`, exit 0: every indexable HTML page plus `sitemap.xml`, `llms.txt` and `robots.txt` checked; `all clear`.
- `python scripts/check_design.py`, exit 0: `design contracts passed`.
- `git diff -- robots.txt llms.txt sitemap.xml`, exit 0 with no output; protected GEO files are unchanged.
- Manual answerability and citation review: Homepage has the H1 “Review-ready controls for Australian accounting work”, its immediate short answer, adjacent GitHub source, and the immediate “Human sign-off” boundary; the site-wide review date is in the footer rather than beside that source. Tools has the H1 and immediate short answer, fixed-release evaluation link, per-tool source links and human-sign-off boundary; it does not state a review date in the overview header. Rates has the H1 and immediate short answer, visible rate claims, card-level primary sources, verification dates and human boundary. Super Guarantee has its H1 and immediate 12 per cent answer, adjacent ATO and legislation sources with a 30 August 2026 verification date, and general-reference boundary. Evidence has its H1 and immediate scope answer, repository/release and primary-source links, visible human-accountability boundary, and a footer review date rather than a date beside the opening claim. Workpaper Review Gate has its H1 and immediate READY/NOT_READY/BLOCKED answer, release v0.1.1 and page dates, source link, and repeated human decision boundary. Coal LSL Calculator has its H1 and immediate answer, visible 2.7 per cent rate with check date, legislative/Coal LSL sources, and estimate-only boundary.
- Scope result: no visitor content, routes, structured data, crawler policy or protected file changed; this evidence-only update does not create a machine-only content layer. Follow-up concern: if stricter claim-level date proximity is desired, the homepage, Tools overview and Evidence overview need an explicitly approved people-first editorial change.

### Task 5: Fix round 1: claim-adjacent review dates resolved (31 August 2026)

- Interpretation: “the main question appears in the H1” means the H1 names the page’s primary user intent and the immediately following short answer answers that intent. The approved register H1s are not rewritten as literal questions.
- Homepage: H1 names review-ready Australian accounting controls; the immediate short answer explains visible sources/calculations; GitHub source and the moved `Last reviewed 30 August 2026.` page-meta are adjacent in `.home-hero__copy`; the immediate trust band states the human-sign-off boundary. **Pass.**
- Tools: H1 names the tool register; the immediate short answer explains source, visible-calculation and human-sign-off intent; reproducible-evaluation/source claim is followed by `Last reviewed 30 August 2026.` in the opening `.article-header`; card-level source/release access and the human boundary remain visible. **Pass.**
- Rates: H1 names the rate register; immediate answer explains current values/source-reviewed dates; each rate claim has its verified date and primary source in the same card; footer preserves the human decision boundary. **Pass.**
- Super Guarantee: H1 names rate history; immediate answer gives 12 per cent and timing distinction; ATO/legislation sources and `Verified 30 August 2026` follow the answer; general-reference/human boundary remains visible. **Pass.**
- Evidence: H1 names the evidence register; immediate answer limits software claims; the moved `Last reviewed 30 August 2026.` page-meta directly follows the answer in `.article-header`; release/repository/source-review links and human-accountability boundary remain visible. **Pass.**
- Workpaper Review Gate: H1 names manager review packs; immediate answer gives READY/NOT_READY/BLOCKED; v0.1.1 release and page review dates are directly below; source link and human approval/lodgment boundary remain visible. **Pass.**
- Coal LSL Calculator: H1 names the calculator; immediate answer names section 3B; 2.7 per cent rate/check date, visible legislation/Coal LSL sources, and estimate-only human boundary remain visible. **Pass.**
- TDD: before the HTML edits, the new opening-review-date static contract made `python scripts/check_design.py` fail exactly for Homepage, Tools and Evidence; after the three minimal people-first metadata edits it passed. Three matching mutation cases keep the placement contract executable.
- Final checks: `python scripts/test_contracts.py`, exit 0 (`32 design mutations, 47 public-contract mutations`); `python scripts/check_seo.py`, exit 0 (`all clear`); `python scripts/check_design.py`, exit 0; `git diff -- robots.txt llms.txt sitemap.xml`, exit 0/no output. Protected GEO files remain unchanged.
