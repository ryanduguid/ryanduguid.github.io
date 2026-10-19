# site-tools

`site-tools` is the site's build and check tooling: one Rust binary built from
this crate, with the toolchain pinned in `rust-toolchain.toml`. It replaced the
Python scripts that were here up to commit c8a8239. Each subcommand is named
after the script it replaced and keeps that script's flags, exit codes, output
bytes and written files (CRLF line endings on Windows, as Python wrote them),
except where listed under Differences below.

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
| `check_design [--update-baseline]` | the design contract and shipped assets |
| `check_links [--offline]` | links and content in every page |
| `check_publication --repository R --commit C [--wait-seconds N]` | the deployment gate |
| `check_rates_register` | the rates register |
| `check_seo` | metadata, structured data, sitemap and site contracts |
| `check_site [--offline] [--ci] [--ci-metadata-only]` | every check, in order |
| `extract_xero_badge [certificate.pdf]` | the Xero badge from its certificate |
| `favicon_render` | the favicon rasters from `assets/favicon.svg` |
| `pin_rates_dataset <checkout>` | `rates_dataset_extract.json` |
| `release_record [--verify-live]` | release claims against `release_record.json` |
| `serve_site` | the preview server on `127.0.0.1:4173` |
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
  `site-tools <name>`, and the generated files' headers name the command. Help
  and usage text keep the script names as their program names.
- `check_site` runs `site-tools` commands and `cargo test` suites where it ran
  Python scripts, so its `running ...` lines differ. Its Python and Node checks
  are unchanged; `python` means `python3` off Windows. The checked tree leaves
  out `scripts/target`.
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
