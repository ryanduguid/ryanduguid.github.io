# Repository contract

## Scope

- This repository is the static source for `duguid.com.au`.
- Keep public pages dependency-free unless a task explicitly changes that boundary.
- Make the smallest scoped change and preserve unrelated work.

## Local commands

Install browser-test dependencies:

```text
npm ci
npx playwright install chromium
```

Serve the site manually when needed:

```text
python -m http.server 4173 --bind 127.0.0.1
```

Run the current checks:

```text
python scripts/check_site.py
npm run test:browser
npm run test:lighthouse
git diff --check
```

## Protected content

- Do not change `llms.txt`, `robots.txt`, `sitemap.xml` or
  `google03d2012cc1791991.html` unless the task explicitly requires it.
- Preserve published rate facts, structured-data facts and disclaimers unless
  the task supplies an authoritative reason to update them.
- Preserve the behaviour of `assets/levy.mjs`; calculator changes need focused
  tests before implementation.
- Do not edit generated Playwright or Lighthouse output under `work/`.

## Browser evidence

- Use fabricated calculator inputs only.
- Prefer role, label and visible-text locators with web-first assertions.
- Observe page errors, error-level console messages, failed requests and HTTP
  responses of 400 or higher. Allow exceptions only in the test that proves a
  known response is intentional.
- Keep traces, screenshots and reports under ignored `work/` paths. Never save
  or upload a browser profile, storage state, cookies or credentials. The
  Lighthouse browser shim is intentional: it avoids an upstream Windows
  temporary-profile cleanup race while preserving isolated browser state.

## Definition of done

- Add a failing focused test before changing behaviour.
- Run every relevant command listed above and report anything not run.
- Keep protected content and unrelated work unchanged.
- Do not push, publish, deploy, open or merge a pull request, send messages, or
  change an external account unless the user explicitly asks.
