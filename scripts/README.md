# site-tools

`site-tools` is the site's build and check tooling: one Rust binary built from
this crate, with the toolchain pinned in `rust-toolchain.toml`. It replaced the
Python scripts here in commit 9dd6f45, which compared each tool with its script
at commit c8a8239. Each subcommand is named
after the script it replaced and keeps that script's flags, exit codes, output
bytes and written files (CRLF line endings on Windows, as Python wrote them),
except where listed under Differences below. `check_ato_sources`,
`check_production` and `stamp_source_freshness` replaced the Node scripts of
those names, compared with them at commit cfb100b; they keep the Node scripts'
behaviour in the same way, with LF line endings on every platform as Node wrote
them.

```bash
cargo install --locked --path scripts
site-tools check_site --offline
```

Run it from anywhere inside the repository: the site root is the nearest
directory holding `_config.yml` or `scripts/`, or `SITE_ROOT` when set.

| Command | Purpose |
| --- | --- |
| `build_agent_skills_manifest --write \| --check` | `.well-known/agent-skills/index.json` from the pinned skills release |
| `build_feed [--write \| --check]` | `feed.xml` from the changelog tables |
| `build_llms_full [--write \| --check]` | `llms-full.txt`, each page's `index.txt` and `.well-known/llms.txt` |
| `build_ozzit_reference [--write] [--check]` | the Ozzit page's worked examples and function index |
| `build_site` | `_site/` with the locked Jekyll |
| `check_agent_files [--verify-live]` | install commands in the machine-readable files |
| `check_ato_sources [--list] [--baseline DIR] [--out DIR] [--issue FILE] [directory ...]` | the weekly sweep of cited ATO and watched pages (CONTRIBUTING.md) |
| `check_design [--update-baseline]` | the design contract and shipped assets |
| `check_links [--offline]` | links and content in every page |
| `check_passages` | each page's leads, section sizes and openers (CONTRIBUTING.md) |
| `check_production [--base URL] [--source-root DIR] [--source-only]` | the public site as Cloudflare delivers it |
| `check_publication --repository R --commit C [--wait-seconds N]` | the deployment gate |
| `check_rates_register` | the rates register, and each rate CSV row's source and check date |
| `check_seo` | metadata, structured data (against the pinned schema.org vocabulary in `schemaorg/`), sitemap and site contracts |
| `check_site [--offline] [--ci] [--ci-metadata-only]` | every check, in order |
| `encode_cash_chart_webp` | the lossless WebP copies of the cash chart PNGs |
| `extract_xero_badge [certificate.pdf]` | the Xero badge from its certificate |
| `favicon_render` | the favicon rasters from `assets/favicon.svg` |
| `merge_driver <base> <current> <incoming>` | the `changelog-rows` Git merge driver (CONTRIBUTING.md) |
| `pin_rates_dataset <checkout>` | `rates_dataset_extract.json` |
| `release_record [--verify-live]` | release claims against `release_record.json` |
| `serve_site` | the preview server on `127.0.0.1:4173` |
| `stamp_source_freshness [--write \| --check-releases \| --write-tool-releases \| --build]` | the tool cards' last-commit stamps, release references and tool release snapshot |
| `visibility_benchmark` | assistant-visibility captures |

## Tests

`cargo test --locked` runs the suites in `tests/`, which cover every behaviour
the Python tests covered. Suites that read the rendered site use the checked
tree that `check_site` assembles, passed in `SITE_CHECKED`; without it they
build the site with Bundler when it is installed, and otherwise report that
they skipped. `check_site` runs each suite in the order the Python checks ran.
`fuzz/` holds the cargo-fuzz target for the feed builder; its README has the
commands.

## Differences from the Python scripts

- An unexpected failure prints a one-line diagnostic with Python's exit code
  instead of a traceback. `serve_site` logs one line where `socketserver`
  printed a traceback.
- Messages that told you to run `python scripts/<name>.py` now name
  `site-tools <name>`, and the generated files' headers name the command. Help,
  usage and argument errors name `site-tools <name>` as the program, wrapped as
  argparse wraps them for that name.
- `check_site` runs `site-tools` commands and `cargo test` suites where it ran
  Python scripts, so its `running ...` lines differ. Its Python and Node checks
  are unchanged; `python` means `python3` off Windows. The checked tree leaves
  out `scripts/target`.
- `release_record --verify-live` exits 1 when a source has drifted, is absent
  or has changed, and 2 when no source could be read; Python always exited 0.
  It sends `GH_TOKEN`, when set, to the GitHub API only.
- Findings Python reported in hash-randomised set order (robots.txt groups,
  the metadata path check) come in a fixed order.
- XML parse errors use roxmltree's wording, not expat's.
- Compressed bytes can differ from zlib-ng's on other inputs; the favicon and
  badge bytes match, and served gzip bodies decompress identically. Gzip uses
  level 6, as Python 3.15 does.
- `serve_site` names site-tools in its `Server` header, logs without colour,
  binds without SO_REUSEADDR on Windows, and takes MIME types from CPython's
  built-in table rather than the Windows registry or `mime.types`.
- URL joining and MIME types follow Python 3.15 where 3.14 differs.
- A format precision above 100,000,000 reports MemoryError instead of
  allocating.
- The rates register's date is Sydney time by the AEST/AEDT rule on every
  platform; Python on Windows without a time-zone database used UTC+11 all year.

## Differences from the Node scripts

- Requests carry the scripts' user agents and the headers fetch adds
  (`accept-language: *`, `sec-fetch-mode: cors`), but no `accept-encoding`, so
  responses arrive uncompressed.
- A failed fetch the ATO sweep reports by its cause (a PDF read or a redirect
  check) names the same codes, such as `ENOTFOUND`, `ECONNREFUSED` and
  `ECONNRESET`, where ureq reports them; other transport failures give ureq's
  description where Node gave another code or `fetch failed`.
- Malformed JSON is refused in serde_json's words, and a malformed questions
  file, nodriver index or release list with a sentence naming it, where Node
  threw a TypeError. Exit codes are unchanged.
- Where a script stopped on an uncaught exception, such as `check_production
  --source-root` with no value, the subcommand prints the exception's message
  without Node's stack trace and exits 1 as Node did.
- `stamp_source_freshness --build` runs `build_site` in the same process rather
  than `cargo run`, so it has no 300-second limit.
- URLs and release tags are sorted as ICU's root collation sorts printable
  ASCII; other characters sort by code point after it.
- JSON objects keep their written key order; V8 moved integer-like keys first.
- Tool slugs and URLs are matched literally when the tool pages and register
  are restamped; the script put them into patterns unescaped.
- The default site root, and the default directory `check_ato_sources` sweeps,
  is found as for the other subcommands rather than from the script's own
  path. When none is found, `stamp_source_freshness` exits 2 and the other two
  exit 1.
- `check_site` runs the `source_freshness`, `production` and `ato_sources`
  suites where it ran the scripts' `node --test` files.
