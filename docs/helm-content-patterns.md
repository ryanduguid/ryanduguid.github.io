# Helm content patterns for the accounting tools site

Explain each tool through the question it answers, the evidence it reads and the result a reader can inspect. Helm's public connector pages, inspected on 9 October 2026, provide a useful content structure for that purpose.

This is an internal editorial note. The site's [design system](../DESIGN.md) keeps its existing accounting register, static implementation and visual language. This document is excluded from publication by `_config.yml`.

## Useful source patterns

| Source | Observed structure | Adaptation for this site |
| --- | --- | --- |
| [Simpro connector](https://helmnewcastle.au/connectors/simpro) | Concrete business questions followed by separate search, detail and cost tools | Give a reader a question, the required input and the existing tool or worked example that answers it. |
| [Meta Ads connector](https://helmnewcastle.au/connectors/meta-ads) | Setup information is distinguished from performance results; currency and account context are explicit | Explain the reporting period, units and source before interpreting an amount or comparison. |
| [Training page](https://helmnewcastle.au/ai-training) | Training is tied to the team's own work and handover | Link to a fabricated example a reader can reproduce, then show the evidence needed to review it. |
| [Governance page](https://helmnewcastle.au/iso-42001) | A use register, named responsibilities, training and a staged readiness review | Describe the controls the repository implements and link to their evidence. |

The connector descriptions claim read-only credentials, isolated client instances and documented exits. Those are vendor claims about Helm's service. They are useful questions for our own tool descriptions, but do not establish that our repositories implement the same controls or hosting model.

## Original tool page worksheet

Use this worksheet when an existing tool page needs an editorial change:

| Field | What to write |
| --- | --- |
| Reader's question | One concrete accounting or review question the implemented tool can answer. |
| Required evidence | Accepted input, period, currency, source and relevant assumptions. |
| Inspectable result | The output file or worked example, with the existing verification route. |
| Limits | Unsupported inputs, refusal cases and checks the example does not perform. |
| Human decision | What the reader must assess before relying on the result. |
| Provenance | Version, source date and links supporting each mutable claim. |

Use an existing fabricated example and its measured result. Do not add claims about time savings, customer outcomes, accreditation or a commercial service without separate evidence and authority. Ryan's public role and qualifications must follow the current site instructions.

## Visual observations

Helm's desktop homepage uses a dark canvas, large type, a short opening description, one prominent meeting action and visible people. LodgeiT's desktop homepage uses a dark blue introduction, an illustration and audience and feature navigation. These are observations of the inspected desktop views, not a mobile or accessibility audit.

For this site's existing design, the useful change is clearer links from questions to worked examples and readable evidence disclosure. Keep the site's current palette, accessible controls and public register purpose. Use original images and copy. Helm's portraits, client logos and testimonials do not belong in this repository.

Any later visible-page change must follow [CONTRIBUTING.md](../CONTRIBUTING.md), regenerate the required machine-readable text and run its applicable site and browser checks. This note does not add a public page or change a claim on the live site.

## Applied worksheet

The local [Monthly Close Controls page](../tools/monthly-close-controls/index.html) now opens with the review question, distinguishes required and optional inputs, and provides a reproducible output-path refusal alongside its fictional worked result. Both commands were checked at its existing source commit `ae88966fc416f6f2ad618652779c50d0e348949d`; the example returns `REVIEW` with eight exceptions and six draft queries, while the refused output path returns exit code 1 without creating a pack. These page changes remain unpublished.
