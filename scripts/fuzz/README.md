The cargo-fuzz target feeds fabricated changelogs to the Atom feed builder. Every
refusal must name the changelog and every built feed must be well-formed XML; a
panic or a broken invariant fails the run. The seed corpus is
`scripts/fuzz-corpus/feed`.

On Linux, from `scripts`, run:

```sh
rustup toolchain install nightly-2026-10-15 --profile minimal
cargo install cargo-fuzz --locked --version 0.13.2
cargo +nightly-2026-10-15 fuzz run feed fuzz-corpus/feed -- -max_total_time=60 -max_len=4096 -timeout=2 -rss_limit_mb=1024
```

CI runs the target after main pushes, weekly and on demand. The test suite replays
the seed corpus on every supported platform (`tests/feed.rs`). libFuzzer needs a
nightly toolchain, so coverage-guided fuzzing runs on Linux. A successful run is
bounded evidence, not proof that every input is handled.
