# Security and operations runbook

For whoever runs this service. It is not running anywhere today.

## Threat model in one paragraph

The service has no authentication, no accounts, no database and no writes. It
holds no secrets. An attacker's realistic goals are to exhaust the host, to
get a wrong figure believed, or to read something about other callers from the
logs. The controls below are aimed at those three.

## Before it goes anywhere

- [ ] `node --test "test/*.test.mjs"` passes.
- [ ] `node conformance/check.mjs` passes against the built artefact, not the
      working tree.
- [ ] `COAL_LSL_HOST` is set deliberately. The default is `127.0.0.1`. Binding
      to `0.0.0.0` is a decision, not a default.
- [ ] `COAL_LSL_ALLOWED_ORIGINS` lists only origins that need browser access,
      or is empty.
- [ ] `COAL_LSL_TRUST_PROXY=1` only when a proxy you control appends to
      `X-Forwarded-For`, and `COAL_LSL_TRUSTED_PROXY_DEPTH` set to how many such
      proxies sit in front. The caller is read that many places from the right;
      everything to the left is whatever the caller chose to send. Get the depth
      wrong and you are keying the throttle on a value a client controls.
- [ ] An instance cap is set on the platform. The publishing standard asks
      publishers to bound their own cost; the throttle alone does not.
- [ ] The rate row in the register has been re-read against the Federal
      Register, and its check date moved, if the last check is stale. A stale
      check narrows the supported months rather than serving a stale rate, so
      the failure mode is a 404, not a wrong number.

## Configuration

| Variable | Default | Notes |
| --- | --- | --- |
| `COAL_LSL_HOST` | `127.0.0.1` | Loopback unless changed deliberately |
| `COAL_LSL_PORT` | `8787` | |
| `COAL_LSL_MAX_BODY_BYTES` | `16384` | Declared in discovery; enforced before parsing |
| `COAL_LSL_RATE_LIMIT_PER_MINUTE` | `60` | Per client, fixed window |
| `COAL_LSL_ALLOWED_ORIGINS` | empty | Comma separated; exact origins, no wildcard |
| `COAL_LSL_TRUST_PROXY` | `0` | See above |
| `COAL_LSL_TRUSTED_PROXY_DEPTH` | `0` | How many proxies you control sit in front. Only read when the above is `1` |
| `COAL_LSL_CALCULATOR_URN` | `urn:sbrm:calc:coal-lsl-levy` | Changeable if the registry wants another spelling |
| `COAL_LSL_PUBLIC_BASE_URL` | unset | Only affects the `servers` entry in the OpenAPI document |
| `COAL_LSL_CODE_REVISION` | from `git rev-parse` | Set explicitly where git is unavailable |

The process reads no other environment variable and no secret. If a deployment
needs one, that is a change to review, not a configuration tweak.

## What is logged

One JSON line per request: a random request id, the method, the resolved path,
the status and the duration in milliseconds. The path is the one the routing
used, with dot segments resolved and each segment decoded, not the raw request
target: logging what the caller typed let the record disagree with the handler
that ran. That is
all. No body, no amount, no field name, no client address, no user agent, no
header. An internal error logs the error message against the request id and
returns only the request id to the caller.

A payroll figure is personal information in substance even when the payload
carries no name, which is why amounts never reach the log. The test suite
asserts this: `logs carry no request bodies, amounts or client addresses`.

If a platform logs client addresses at the edge, that is the platform's
record and its retention policy applies. Check it before deploying.

## Failure modes and what they mean

| Symptom | Meaning | Action |
| --- | --- | --- |
| Every request 404 on the period URN | The rate row's check date has fallen behind the months being asked for | Re-verify the rate against the Federal Register and update the row, or accept the narrower coverage |
| Start-up throws on the register | A register or methods file is missing or malformed | Fix the file. The service refuses to start rather than serve without evidence |
| 429 under normal load | The limit is too low for the caller, or one client is looping | Raise `COAL_LSL_RATE_LIMIT_PER_MINUTE` deliberately, or leave it |
| 413 from a legitimate caller | A body over `COAL_LSL_MAX_BODY_BYTES` | Raise the limit deliberately; the default is 16 KiB and a levy request is under 1 KiB |
| 422 `too_many_items` | More than 24 bonus rows | The bonus cap is in `src/schema.mjs`; changing it is a contract change |
| 500 with a request id | A defect | The log line with that id has the message. Reproduce with a fixture before changing anything |

## Scaling

The throttle is per process. Two instances give a caller twice the allowance.
That is acceptable behind a small instance cap and wrong behind a large one.
The upgrade is a shared counter, and it is the only part of this service that
assumes a single process.

## Incident notes

- There is no data to breach: no store, no writes, no secrets.
- A wrong figure is the real incident. If one is reported, get the request,
  the response and the expected figure with its source, add it to
  `fixtures/cases.json` as a failing case, then fix the engine. The fixture is
  the record.
- Rolling back means serving an older revision. Results carry the code
  revision and the engine module hash in their manifest, so a figure can be
  traced to the exact code that produced it.
