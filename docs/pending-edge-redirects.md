# Pending Cloudflare redirects

Prepared 21 September 2026 for findings WI-02 and WI-07. These changes are
**not deployed by this pull request**. GitHub Pages cannot apply repository
redirect configuration. The existing Cloudflare rules and their order must
be inspected by the account owner before applying this plan.

## WI-02: restore the retired refusal address

Add a Single Redirect with this exact match expression:

```text
(http.host in {"duguid.com.au" "www.duguid.com.au"} and http.request.uri.path in {"/refusals" "/refusals/"})
```

Use the static target `https://duguid.com.au/tools/refusals/`, status 301 and
enable **Preserve query string**. Put this specific rule ahead of the general
www rule so the old www address reaches the new canonical page directly.
Do not match subpaths or change the canonical destination's behaviour.

## WI-07: send HTTP www directly to HTTPS apex

Update the existing www redirect, or replace it with one Single Redirect,
matching `http.host eq "www.duguid.com.au"` for both HTTP and HTTPS. Use this
dynamic target expression:

```text
concat("https://duguid.com.au", http.request.uri.path)
```

Use status 301 and enable **Preserve query string**. The fixed destination
host prevents a request from choosing an external redirect target. Keep the
existing HTTPS enforcement and HSTS. Check rule precedence against the current
HTTPS upgrade: an HTTP www request must reach apex in one response, rather
than first reaching HTTPS www. Do not disable global HTTPS enforcement merely
to hide the extra hop.

Cloudflare's [Single Redirect settings](https://developers.cloudflare.com/rules/url-forwarding/single-redirects/settings/)
document static and dynamic targets, permanent status codes and query
preservation, which is disabled by default. Its [www-to-root example](https://developers.cloudflare.com/rules/url-forwarding/examples/redirect-www-to-root/)
matches HTTPS only; copying that example unchanged would leave WI-07 open.
Both references were read on 21 September 2026.

## Verify after an authorised change

Use GET requests with a fresh curl process, without a persisted HSTS file.
In PowerShell, run:

```powershell
$hostsToCheck = @('https://duguid.com.au', 'https://www.duguid.com.au', 'http://duguid.com.au', 'http://www.duguid.com.au')
foreach ($hostToCheck in $hostsToCheck) {
  foreach ($pathToCheck in @('/refusals', '/refusals/', '/refusals/?audit=redirect%20check')) {
    rtk proxy curl.exe -sS -D - -o NUL --max-time 20 ($hostToCheck + $pathToCheck)
  }
}
foreach ($urlToCheck in @('http://www.duguid.com.au/', 'http://www.duguid.com.au/tools/coal-lsl-levy/?audit=redirect%20check', 'https://www.duguid.com.au/tools/coal-lsl-levy/?audit=redirect%20check')) {
  rtk proxy curl.exe -sS -L -o NUL --max-redirs 3 --max-time 20 -w 'status=%{http_code} redirects=%{num_redirects} final=%{url_effective}\n' $urlToCheck
}
node scripts/check_production.mjs
```

Require a 301 or 308 to the exact HTTPS apex destination, intact path and
query, final 200 and no loop. Require one redirect for each www example.
Also check that `/tools/refusals/` still returns 200 and that `/refusals-test/`
and `/refusals/child/` retain their 404 responses. The existing production
check protects headers and older redirects; it does not yet enforce these
pending rules. After successful deployment, add the two refusal paths to its
`REDIRECTS` map and retain the www hop checks above as deployment evidence.

Record the changed rule names, prior order, timestamp and verified responses
in the implementation handoff. If verification fails, restore only the rule
changes from this operation and rerun the existing production check. Neither
finding is complete until the live responses pass.
