# Duguid Search Console reader

This local stdio MCP reports bounded evidence from the fixed Search Console
property `sc-domain:duguid.com.au`. It cannot add properties, submit sitemaps,
request indexing or change Search Console state.

It exposes three tools:

- `compare_search_performance` compares adjacent periods of up to 90 days and
  at most 1,000 top rows, using only `date`, `page`, `query`, `device` and
  `country` dimensions.
- `inspect_url` accepts HTTPS URLs only on `duguid.com.au` or
  `www.duguid.com.au`.
- `list_sitemaps` reads the property's current sitemap report.

Each period can return only top rows. A row absent from one returned set is
normalised to zero, so deltas are indicative rather than exhaustive. Treat the
results as evidence for a decision, not as an instruction to change or publish
the site. Responses remain in the MCP conversation and must not be saved in the
repository.

## Local registration

From this checkout, run:

```powershell
codex mcp add duguid-search-console -- uv run --script C:\Users\-\Documents\Codex\2026-08-28\wha-5\work\duguid-site-agent-tooling\.agents\tools\search-console\server.py
codex mcp get duguid-search-console
```

The registration contains the absolute script path. Re-register the MCP after
moving or deleting this checkout.

## Authentication boundary

Registration and `self-test` do not authenticate or read Windows Credential
Manager. Authentication is an explicit operator action and requests only
`https://www.googleapis.com/auth/webmasters.readonly`:

```powershell
uv run --script .agents/tools/search-console/server.py auth --client-secrets C:\path\to\desktop-oauth-client.json
```

The command passes the supplied file to Google's installed-app flow without
printing it, then stores `Credentials.to_json()` directly under the Windows
Credential Manager service `duguid-search-console` and account
`sc-domain:duguid.com.au`. It creates no token file. Do not run it until the
operator has supplied the Desktop OAuth client path and accepted the exact
read-only scope.

Remove the stored credential only through an explicit operator request:

```powershell
uv run --script .agents/tools/search-console/server.py logout
```

## Network-free check

```powershell
python scripts/test_search_console.py
uv run --script .agents/tools/search-console/server.py self-test
```
