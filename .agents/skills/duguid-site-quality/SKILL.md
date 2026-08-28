---
name: duguid-site-quality
description: Use when changing, reviewing, diagnosing, or preparing a release for the duguid.com.au repository, including static content, the Coal LSL calculator, browser quality, WebMCP, Search Console evidence, or publication readiness.
---

# Duguid Site Quality

Make the smallest scoped change, verify it in proportion to its risk, and close
user-visible work on the affected route in a browser. Local completion never
implies permission to publish.

## Start here

Read `AGENTS.md` and the relevant repository manifests before changing files.
Preserve its factual, legal, client-data, credential and external-action
boundaries. Use fabricated data in tests and browser work.

## Route the work

| Change | Evidence required |
| --- | --- |
| Copy, metadata, links or static HTML | Run the focused source checker(s), then `python scripts/check_site.py`; inspect the affected route in a browser. |
| Levy calculator, explanation or WebMCP | Run both levy test commands, `python scripts/check_site.py` and `npm run test:browser`; add Lighthouse when layout, assets or performance can change. |
| Browser presentation or interaction | Run `npm run test:browser`; run `npm run test:lighthouse` for layout, asset or performance risk. Retain ignored failure evidence. |
| Search performance or indexing investigation | Use Search Console only for an explicit search task and within the limits below. |
| Release readiness | Read and apply [the release checklist](references/release-checklist.md). |

The levy commands are:

```text
node --test scripts/levy.test.mjs
node --test scripts/levy-webmcp.test.mjs
```

## Search Console boundary

For an explicit search task, read `.agents/tools/search-console/README.md` and
use only its local read-only MCP for `sc-domain:duguid.com.au`. Require an
operator-confirmed finalised end date; do not guess it. Requests are limited to
90 days, 1,000 rows, allowlisted dimensions and same-site HTTPS inspection.
Treat ranked deltas as indicative; the operator decides materiality.

Explicit OAuth consent is required and must request exactly
`https://www.googleapis.com/auth/webmasters.readonly`. Never inspect or print
OAuth material or stored credentials. Keep Search Console responses in the MCP
conversation; never save, commit or upload them. Report evidence; do not infer
permission to alter or publish SEO.

## Completion contract

Report the changed outcome, checks run, browser evidence and every unverified
item. Stop for explicit permission before any push, pull request, merge,
deployment or other publication.

## Common mistakes

- A passing source check does not close a user-visible change; inspect the
  affected route.
- A browser screenshot does not replace levy or source contracts.
- Search evidence does not authorise an SEO edit or indexing request.
- “Release-ready” does not mean “deploy”.
