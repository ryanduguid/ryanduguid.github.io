// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

//! Consolidated coverage integration tests so Cargo compiles and links one
//! executable instead of one binary per coverage module.
mod common;

#[path = "cov/cli_and_io.rs"]
mod cli_and_io;
#[path = "cov/commands.rs"]
mod commands;
#[path = "cov/py_format_json.rs"]
mod py_format_json;
#[path = "cov/py_helpers.rs"]
mod py_helpers;
#[path = "cov/site_contracts.rs"]
mod site_contracts;
#[path = "cov/validators_a.rs"]
mod validators_a;
#[path = "cov/validators_b.rs"]
mod validators_b;
