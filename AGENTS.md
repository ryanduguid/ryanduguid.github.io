# Website repository instructions

Before changing a page or shared include, read [DESIGN.md](DESIGN.md) and
[CONTRIBUTING.md](CONTRIBUTING.md). Keep the site static and preserve its
accessibility, navigation and evidence requirements.

- Edit page sources and `_includes/`; `_site/` is generated. Read the README's
  build instructions before previewing the site.
- When visible main text changes, regenerate `llms-full.txt` using the command
  in CONTRIBUTING.md. Keep claims, source dates and release references consistent
  across visible pages and machine-readable indexes.
- For generated images, follow the README's provenance and renderer instructions.
- When adding repository tooling or documentation, check `_config.yml` so those
  files stay out of the published site.
- For local agent tooling or Search Console work, read
  [docs/agent-tooling.md](docs/agent-tooling.md) before using it.

Before handoff, run the relevant checks in CONTRIBUTING.md and
[checks.yml](.github/workflows/checks.yml). Distinguish offline checks from live
links and browser evidence; report every required check that was not run.
