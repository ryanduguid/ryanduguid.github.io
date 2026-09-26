# Deployment and operations

Cloudflare Workers is the selected host. Its supported `httpServerHandler`
runs the Node HTTP server with the existing engine and bundled evidence.
There is no database, storage binding or external calculation lookup.

## Cost and limits

Checked on 26 September 2026: Workers Free includes 100,000 requests per day
and 10 ms CPU per invocation. Workers Paid starts at US$5 per month, with
usage charges above its allowances. See
[Cloudflare pricing](https://developers.cloudflare.com/workers/platform/pricing/).
Start on an existing Free account if available. These scripts do not change a
subscription or enable paid services.

The Worker allows 60 requests per minute per client IP per Cloudflare location.
Its [rate counters](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
are eventually consistent, so this is not a strict global quota. Shared IPs
share the allowance. Throttled requests receive 429 and `Retry-After: 60`.
Bodies are limited to 16 KiB before JSON parsing.

The Free account's daily quota bounds free usage and is shared with other
Workers. A paid account needs a spending decision: a per-IP guard is not a
monetary cap. Workers has no instance-count setting.

## Prepare and deploy

Run from `service/coal-lsl-levy`:

```sh
npm ci
npm test
npm run conformance
npm run check:worker
npm audit --audit-level=high
```

The dry run writes `work/worker-bundle/` locally. The build script embeds the
exact engine, rate and method bytes. Commit reviewed source before deployment
so the manifest names a clean revision.

With the deployment approved and the account signed in:

```sh
npx wrangler login
npm run deploy:worker
node conformance/check.mjs --base https://REAL-WORKER-HOST
```

Keep Wrangler's assigned `workers.dev` URL, Worker name and account subdomain
stable. A custom domain is optional. The rate-limit namespace in `wrangler.toml`
belongs to this API; do not reuse it for an unrelated limiter in the account.

Use synthetic inputs for the live check. Verify its revision and served hashes
before completing the [listing request](../docs/listing-request-draft.md).
Local tests do not verify production routing, CPU limits or account quotas.

## Privacy and maintenance

The Worker stores no application data and emits no application logs. Workers
Observability is disabled. Cloudflare still processes request metadata under
its platform policies. Requests need pay components and factual answers only;
never send names, identifiers, payroll files or credentials.

The Node launcher binds to loopback by default. It logs request identifiers,
method, path, status and duration without request bodies or client addresses.
Its limiter is per process; the Worker uses the platform binding instead.
CORS is disabled by default. Server-to-server callers do not need CORS.

A 404 for a period means current evidence does not support it. Recheck the law
and rate register before extending coverage. A 400 needs established or
corrected facts; a 422 needs corrected input. Reproduce any wrong figure with
synthetic data and an independently derived regression case before changing
the engine. Rollback uses an earlier reviewed deployment followed by the live
conformance check. Retain its revision and evidence hashes.
