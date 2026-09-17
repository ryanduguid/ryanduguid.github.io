# Deployment configuration

Not executed. Nothing here has been applied, and no infrastructure exists for
this service. These files record what a deployment would need so the decision
is reviewable before anyone makes it.

## Prerequisites, none of which are met

- A host account and a project to deploy into.
- A decision on the public hostname. The publishing standard asks for a stable
  URL; a Cloud Run default URL is not one, as LodgeiT's own notice about their
  changing host shows.
- A TLS certificate for that hostname.
- An instance cap, so an unauthenticated public endpoint cannot bill without
  limit.
- The runbook checklist in [../docs/runbook.md](../docs/runbook.md) completed.

## What a deployment looks like

`Dockerfile` builds a Node 22 image that copies `assets/levy.mjs`,
`rates/register/` and `service/coal-lsl-levy/` from the repository root and
runs `bin/serve.mjs` as a non-root user. The engine module and the register
are part of the image, so the hashes in a manifest identify the exact bytes
the running service holds.

`service.env.example` lists the environment for a public deployment. Copy it,
set the values, and do not commit the copy.

`cloud-run.yaml.example` is a Knative service definition with the instance cap
and concurrency filled in. It is an example: the project, region, image
reference and service account are placeholders that a real deployment must
replace.

## After deploying, before telling anyone

```bash
node conformance/check.mjs --base https://<your-host>
```

Then re-read [../docs/contract-snapshot.md](../docs/contract-snapshot.md)
against the live LodgeiT surface, because a listing request quotes a contract
that may have moved.

The listing request itself is a draft at
[../docs/listing-request-draft.md](../docs/listing-request-draft.md). It has
not been sent.
