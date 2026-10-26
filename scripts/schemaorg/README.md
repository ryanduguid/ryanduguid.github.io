# Pinned schema.org vocabulary

`site-tools check_seo` validates every JSON-LD node on indexable pages against
this copy of the official schema.org vocabulary. It reports unknown types and
properties, properties used outside their `domainIncludes` types (including
subtypes), values naming an unknown term by URL (such as
`https://schema.org/InStock`), and terms that are pending, superseded or retired
to the attic. The check reads only this file and never fetches the vocabulary.

`ALLOWED_PENDING_SCHEMA_TERMS` in `scripts/src/site_contracts/data.rs` lists the
pending terms the site has reviewed and accepts. The check refuses an entry
that is no longer pending, so the list shrinks when schema.org adopts a term.

| Field | Value |
| --- | --- |
| File | `schemaorg-all-https.jsonld` |
| Source | [schemaorg/schemaorg](https://github.com/schemaorg/schemaorg), `data/releases/30.1/schemaorg-all-https.jsonld` |
| Release | schema.org 30.1, tag `v30.1`, commit `5f2d8cdec99b7329459ef6584e94b6a840f88471` |
| Retrieved | 27 October 2026 |
| SHA-256 | `07e7c663dbc12a0937581745e59a98ed12b8698f38e8e3b03650287d9df88ae5` |
| Licence | Apache License 2.0; the upstream `LICENSE` is copied beside it unchanged |

The file is unmodified. `scripts/src/schema_vocab.rs` holds the release and
SHA-256, and the check fails when the file no longer matches them.

To move to a newer release, replace the file with the same file from the new
release's tagged commit, then update the release, commit, date and SHA-256 here
and the constants in `schema_vocab.rs` in one reviewed pull request. Run
`site-tools check_site --offline` and fix or justify every newly reported term.
