// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

//! Consolidated coverage integration tests so Cargo compiles and links one
//! executable instead of one binary per coverage module.
mod common;

#[path = "cov/cli_and_io.rs"]
mod cli_and_io;
#[path = "cov/commands.rs"]
mod commands;
#[path = "cov/pass2_contracts.rs"]
mod pass2_contracts;
#[path = "cov/pass2_runtime.rs"]
mod pass2_runtime;
#[path = "cov/pass2_validators.rs"]
mod pass2_validators;
#[path = "cov/py_format_json.rs"]
mod py_format_json;
#[path = "cov/py_helpers.rs"]
mod py_helpers;
#[path = "cov/seo_core_edges.rs"]
mod seo_core_edges;
#[path = "cov/site_contracts.rs"]
mod site_contracts;
#[path = "cov/site_contracts_edges.rs"]
mod site_contracts_edges;
#[path = "cov/validators_a.rs"]
mod validators_a;
#[path = "cov/validators_b.rs"]
mod validators_b;

const ISOLATED_CHILD_ENV: &str = "SITE_TOOLS_ISOLATED_TEST_CHILD";
const PROXY_ENV_VARS: [&str; 8] = [
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "http_proxy",
    "https_proxy",
    "all_proxy",
    "NO_PROXY",
    "no_proxy",
];

/// Runs a test body inside a fresh copy of this test binary with proxy environment
/// variables removed and process-exit cleanup guaranteed for any detached resources.
pub(crate) fn run_in_isolated_child(
    test_name: &str,
    extra_env: &[(&str, &std::ffi::OsStr)],
    body: impl FnOnce(),
) {
    if std::env::var_os(ISOLATED_CHILD_ENV).is_some() {
        body();
        return;
    }
    let exe = std::env::current_exe().unwrap();
    let mut cmd = std::process::Command::new(exe);
    cmd.args(["--exact", test_name, "--nocapture", "--test-threads=1"])
        .env(ISOLATED_CHILD_ENV, "1");
    for var in PROXY_ENV_VARS {
        cmd.env_remove(var);
    }
    for (key, value) in extra_env {
        cmd.env(key, value);
    }
    let output = cmd.output().unwrap();
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        output.status.success(),
        "isolated child {test_name} failed ({}):\nstdout:\n{stdout}\nstderr:\n{stderr}",
        output.status,
    );
    assert!(
        stdout.contains("1 passed; 0 failed"),
        "isolated child {test_name} did not run exactly one test:\nstdout:\n{stdout}\nstderr:\n{stderr}",
    );
}
