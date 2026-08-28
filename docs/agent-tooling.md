# Local agent tooling

The site's agent-facing loops stay narrow and keep production hosting static.
They do not add analytics, tracking, a framework or a production package
runtime.

## Browser quality

Run the repository-defined checks from the repository root:

```powershell
python scripts/check_site.py
npm run test:browser
npm run test:lighthouse
```

Playwright covers routes, interaction, accessibility and visual snapshots.
Lighthouse records repeat-run medians for the selected public journeys. Failure
artifacts stay under ignored local output paths; do not commit them.

## Calculator WebMCP

On supporting browsers, the Coal LSL levy page registers four calculator-only,
read-only tools. They use fabricated scenario inputs and the same protected levy
engine as the visible form. On browsers without WebMCP, registration is a safe
no-op and the page continues to work normally.

## Search Console MCP

The local Search Console reader is documented in
`.agents/tools/search-console/README.md`. It is locked to
`sc-domain:duguid.com.au`, exposes only three read methods and validates request
bounds before loading a credential or contacting Google. Authentication and
logout are explicit CLI actions, never MCP tools.

Do not inspect, print, commit or upload OAuth material, stored credentials or
Search Console responses. A live comparison, URL inspection or sitemap read is
a manual gate requiring the operator's OAuth consent. The tool reports evidence
only; it neither decides nor publishes an SEO change.

## External actions

Local implementation and verification do not authorise a push, pull request,
merge, deployment, OAuth consent or other publication. Ask for explicit
permission at that boundary and report any live or external check that remains
unverified.

## Repository skill

`.agents/skills/duguid-site-quality/SKILL.md` routes site edits, browser work,
Search Console investigations and release preparation to the commands and
permission boundaries proven in this repository. Its detailed release gates
live in the linked checklist rather than being duplicated in the entry point.

Validate the package and its four routing scenarios with:

```powershell
python scripts/test_duguid_site_quality_skill.py
```
