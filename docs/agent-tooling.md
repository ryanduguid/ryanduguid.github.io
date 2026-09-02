# Local agent tooling

The site's agent-facing loops stay narrow and keep production hosting static.
They do not add analytics, tracking, a framework or a production package
runtime.

## Browser quality

Run the repository-defined checks from the repository root:

```powershell
python scripts/check_site.py
npm run test:capture
npm run test:browser
npm run test:lighthouse
```

The focused capture check renders fabricated proof without changing the tracked
image. Playwright covers routes, interaction, accessibility and visual
snapshots. Lighthouse records repeat-run medians for the selected public
journeys. Failure artifacts stay under ignored local output paths; do not
commit them.

## Portable GitHub maintenance workflows

github-agent-skills gives Codex and Claude Code the GitHub maintenance workflows this portfolio uses, and keeps the fabricated-data and human-review boundaries. Bootstrap <https://github.com/ryanduguid/github-agent-skills> locally with:

```powershell
git clone https://github.com/ryanduguid/github-agent-skills.git
cd github-agent-skills
pwsh -File scripts/sync-skills.ps1
```

## Search Console MCP and CLI

The local Search Console reader is documented in
`.agents/tools/search-console/README.md`. It is locked to
`sc-domain:duguid.com.au`, exposes only three read methods through shared MCP
and CLI handlers, and validates request bounds before loading a credential or
contacting Google. A committed uv script lock fixes direct and transitive
dependency versions and hashes. Authentication and logout are explicit CLI
actions, never MCP tools.

Do not inspect, display, commit or upload OAuth material or stored credentials.
Search Console read results may appear only in the current MCP conversation or
the operator's terminal; never redirect, copy, persist, commit or upload them.
A live comparison, URL inspection or sitemap read is a manual gate requiring
the operator's OAuth consent. The tool reports evidence only; it neither decides
nor publishes an SEO change.

## External actions

Local implementation and verification do not authorise a push, pull request,
merge, deployment, OAuth consent or other publication. Ask for explicit
permission at that boundary and report any live or external check that remains
unverified.
