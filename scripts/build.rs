// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

//! Embeds the identity of the sources this build reads as `SITE_TOOLS_SOURCES`, so the
//! binary can refuse to write in a checkout whose sources differ.

#[allow(dead_code)]
#[path = "src/source_identity.rs"]
mod source_identity;

fn main() {
    for input in ["src", "Cargo.toml", "Cargo.lock", "build.rs"] {
        println!("cargo::rerun-if-changed={input}");
    }
    let scripts = std::env::var_os("CARGO_MANIFEST_DIR").expect("Cargo sets CARGO_MANIFEST_DIR");
    let identity = source_identity::of(std::path::Path::new(&scripts))
        .unwrap_or_else(|error| panic!("cannot read the site-tools sources: {error}"));
    println!("cargo::rustc-env=SITE_TOOLS_SOURCES={identity}");
}
