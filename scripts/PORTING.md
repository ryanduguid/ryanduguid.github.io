# Tooling port record (`scripts/`)

`_config.yml` excludes `scripts/` and `service/` from Jekyll builds. All Rust tooling lives in the `duguid-site-tools` crate (`scripts/Cargo.toml`, binary `site-tools`).

## Ported to Rust

- `search_console` ([`scripts/src/search_console/mod.rs`](src/search_console/mod.rs), exposed via `site-tools search_console` from [`scripts/src/search_console/cli.rs`](src/search_console/cli.rs) and tested in [`scripts/tests/search_console.rs`](tests/search_console.rs)):
  - Ports the pure validation, reporting window calculation (`comparison_windows`), Search Analytics request construction (`build_search_request`), same-site HTTPS URL validation (`validate_site_url`) and period-over-period row joining and ranking (`compare_search_rows`) from `.agents/tools/search-console/core.py`.
  - Ports the pure endpoint, request-body and response-shaping contracts (`compare_requests`, `compare_response`, `inspect_request`, `inspect_response`, `sitemaps_response` and offline `self_test`) from `.agents/tools/search-console/server.py`.
  - Parity: [`scripts/tests/search_console_parity.rs`](tests/search_console_parity.rs) runs `core.py` and the Rust functions on the same inputs, valid and invalid, and requires byte-identical JSON output and error messages. `server.py` needs its `uv` dependencies to import, so its response shaping is checked against the values its offline self-test asserts. Rows whose metrics are NaN are refused, where `core.py` would rank them in an order Python's sort leaves undefined.
  - Reuses existing crate modules and dependencies (`py::Date`, `pyjson`, `pyurl`, `num-bigint`, `num-traits`, `std`) without adding external dependencies to `scripts/Cargo.toml` or `scripts/Cargo.lock`.

## Retained non-Rust scripts and constraint classifications

Constraint numbering follows the repository implementation standard:
- Constraint 1: host accepts only another language (browser runtime, Cloudflare Worker, browser automation hooks, Windows COM automation).
- Constraint 2: required library or platform integration lacks adequate Rust support (`mcp`, `google-auth`, `google-auth-oauthlib`, `keyring` Windows Credential Manager, headless Chromium automation via Playwright/Puppeteer, `wrangler`).
- Constraint 3: must run without a build step on machines that may lack Rust (`uv` PEP 723 script, GitHub Actions bootstrap gate).
- Constraint 5: existing project stack for its extensions and fixes.

| Path | Language / runtime | Constraint | Reason retained |
| --- | --- | --- | --- |
| `.agents/tools/search-console/core.py` | Python 3.14 | 2, 3 | Imported directly at runtime by `server.py` and `scripts/test_search_console.py` whilst both remain Python. |
| `.agents/tools/search-console/server.py` (+ `server.py.lock`) | Python 3.14 (`uv` PEP 723) | 2, 3 | Local stdio MCP server and explicit OAuth/Windows Credential Manager CLI depending on `mcp`, `google-auth`, `google-auth-oauthlib` and `keyring`, run directly via `uv` without a Rust build step. |
| `scripts/test_search_console.py` | Python `unittest` | 2, 3 | Exercises `.agents/tools/search-console/core.py` directly under `check_site` and offline checks. |
| `.github/ci/check_gates.py` | Python 3 | 3, 5 | Shared CI gate script executed directly by `.github/workflows/checks.yml` (`checks-gates`) before or without a Rust build step. |
| `scripts/mutation-check.mjs` (+ `scripts/*.test.mjs`) | Node 24 ESM | 1, 2 | Directly mutates and imports browser ES modules from `assets/*.mjs` under `node:test` to verify the browser calculator engines. |
| `scripts/render-social-cards.mjs` (+ `scripts/capture-social-cards.spec.mjs`) | Node 24 / Playwright | 1, 2 | Renders SVG social-card templates to PNG using headless Chromium via `@playwright/test`. |
| `scripts/capture-coal-lsl-proof.mjs` (+ `scripts/capture-coal-lsl-proof.spec.mjs`, `scripts/coal-lsl-proof-fixture.mjs`) | Node 24 / Playwright | 1, 2 | Drives interactive DOM calculation and captures WebP proof screenshots in headless Chromium via `@playwright/test`. |
| `scripts/lighthouse-browser.cjs` (+ `scripts/clean-lighthouse-output.mjs`, `lighthouserc.cjs`, `playwright*.config.mjs`, `tests/browser/*.{mjs,spec.mjs}`) | Node 24 CJS/ESM | 1, 2 | Configuration and browser-launcher hooks loaded directly by Lighthouse CI, Puppeteer and Playwright. |
| `service/coal-lsl-levy/` (`src/*.mjs`, `bin/serve.mjs`, `conformance/*.mjs`, `deploy/build-worker.mjs`, `test/*.test.mjs`) | Cloudflare Worker / Node 24 ESM | 1, 2, 5 | Executes and tests the same `assets/levy.mjs` ES module engine inside Cloudflare Workers (`wrangler`) and Node HTTP conformance checks. |
| `scripts/export-cash-chart.ps1` | PowerShell / Excel COM | 1, 2 | Drives desktop Excel read-only over Windows COM to style and export the cash-preview PNG chart from `assets/examples/lumbridge/lumbridge.xlsx`. |
