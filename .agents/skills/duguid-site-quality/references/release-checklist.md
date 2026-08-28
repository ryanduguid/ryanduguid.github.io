# Release checklist

Use this checklist only when reviewing release readiness. It prepares evidence;
it does not authorise publication.

## Scope and safety

- Read `AGENTS.md` and inspect `git status --short` before acting. Classify every
  entry as intended release content, ignored/local evidence or unrelated user
  work; do not silently omit intended changes from the branch diff.
- Preserve unrelated work and the protected facts, crawler files, verification
  file, disclaimers and levy formula behaviour.
- Confirm generated browser reports, OAuth material, Search Console responses,
  credentials and client data are not tracked.

## Required local gates

Run from the repository root:

```powershell
python scripts/check_site.py
npm run test:browser
npm run test:lighthouse
uv run --locked --script .agents/tools/search-console/server.py self-test
git diff --check
git diff --check origin/main...HEAD
git ls-files -ci --exclude-standard
```

The browser gate must finish with the expected route, interaction,
accessibility and snapshot coverage. Lighthouse must pass all configured
category and metric assertions. The Search Console self-test must expose only
the three read-only tools without authentication.
The final filename-only command must return no tracked files that match ignore
rules. Never inspect a suspected credential or private artefact to classify it.

Use fabricated data only. Keep failure traces, screenshots and Lighthouse
reports in their ignored local paths while diagnosing a failure; do not add
them to the release diff.

## Review and hand-off

- Review `origin/main...HEAD` for material correctness, regression, security,
  accessibility and unmet requirements.
- Confirm every intended release change is tracked and committed in that
  reviewed diff. Explain any intentional local status entry without deleting or
  absorbing unrelated user work.
- Rerun any affected gate after a fix.
- Report the outcome, relevant metrics, local MCP status, OAuth/live-read
  status and every unverified or not-run check.
- Stop for explicit permission before push, pull request creation, merge,
  deployment or any other publication. A request for review or release
  readiness is not publication approval.
