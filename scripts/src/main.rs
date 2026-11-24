// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

use std::process::ExitCode;

const USAGE: &str = "usage: site-tools <command> [arguments]\n\ncommands: build_agent_skills_manifest, build_effective_life, build_effective_life_pages, build_feed, build_llms_full, build_ozzit_reference, build_rates_json, build_site, check_agent_files, check_ato_sources, check_design, check_links, check_passages, check_production, check_publication, check_rates_register, check_seo, check_site, encode_cash_chart_webp, extract_xero_badge, favicon_render, merge_driver, minify_site, pin_rates_dataset, release_record, render_about_portrait, serve_site, stamp_source_freshness, visibility_benchmark\n";

/// Commands that write files whatever their arguments, besides the `build_*` commands.
const WRITING_COMMANDS: [&str; 6] = [
    "encode_cash_chart_webp",
    "extract_xero_badge",
    "favicon_render",
    "minify_site",
    "pin_rates_dataset",
    "render_about_portrait",
];

/// Arguments that make any other command write.
const WRITING_FLAGS: [&str; 5] = [
    "--build",
    "--sync-releases",
    "--update-baseline",
    "--write",
    "--write-tool-releases",
];

/// The `check_ato_sources` options naming the baseline, report and issue files it writes.
const ATO_WRITING_OPTIONS: [&str; 3] = ["--baseline", "--issue", "--out"];

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let Some(command) = args.first() else {
        let _ = site_tools::print_text(USAGE, true);
        return ExitCode::from(2);
    };
    let rest = &args[1..];
    let command = command.replace('-', "_");
    // An installed binary older than the checkout would write with outdated rules.
    // The publication gate needs no checkout. The merge driver is left alone because a
    // refusal would only make Git fall back to its own text merge (CONTRIBUTING.md).
    if !matches!(command.as_str(), "check_publication" | "merge_driver")
        && let Ok(root) = site_tools::root()
    {
        let writes = command.starts_with("build_")
            || WRITING_COMMANDS.contains(&command.as_str())
            || rest.iter().any(|arg| WRITING_FLAGS.contains(&arg.as_str()))
            || (command == "check_ato_sources"
                && rest.iter().any(|arg| {
                    let name = arg.split_once('=').map_or(arg.as_str(), |(name, _)| name);
                    ATO_WRITING_OPTIONS.contains(&name)
                }));
        let built = env!("SITE_TOOLS_SOURCES");
        match site_tools::source_identity::check(&root, built, writes) {
            Ok(None) => {}
            Ok(Some(warning)) => {
                let _ = site_tools::print_text(&format!("{warning}\n"), true);
            }
            Err(refusal) => {
                let _ = site_tools::print_text(&format!("{refusal}\n"), true);
                return ExitCode::FAILURE;
            }
        }
    }
    let result = match command.as_str() {
        // The publication gate reads GitHub only; it needs no site root.
        "check_publication" => site_tools::check_publication::run(rest),
        // Git runs the merge driver on temporary files; it needs no site root either.
        "merge_driver" => site_tools::merge_driver::run(rest),
        // The former Node scripts find the site root themselves: these two only when
        // no directory is given, and the freshness check reports a missing one as an
        // outage (exit 2) rather than drift.
        "check_ato_sources" => site_tools::ato_sources::run(rest),
        "check_production" => site_tools::check_production::run(rest),
        "stamp_source_freshness" => site_tools::source_freshness::run(rest),
        _ => site_tools::root().and_then(|root| match command.as_str() {
            "build_agent_skills_manifest" => site_tools::agent_skills::run(&root, rest),
            "build_effective_life" => site_tools::effective_life::run(&root, rest),
            "build_effective_life_pages" => site_tools::effective_life_pages::run(&root, rest),
            "build_feed" => site_tools::feed::run(&root, rest),
            "build_llms_full" => site_tools::llms_full::run(&root, rest),
            "build_ozzit_reference" => site_tools::ozzit_reference::run(&root, rest),
            "build_rates_json" => site_tools::rates_json::run(&root, rest),
            "build_site" => site_tools::build_site::run(&root),
            "check_agent_files" => site_tools::agent_files::run(&root, rest),
            "check_links" => site_tools::check_links::run(&root, rest),
            "check_passages" => site_tools::passages::run(&root),
            "check_rates_register" => site_tools::rates_register::run(&root),
            "check_seo" => site_tools::check_seo::run(&root),
            "check_site" => site_tools::check_site::run(&root, rest),
            "check_design" => site_tools::check_design::run(&root, rest),
            "encode_cash_chart_webp" => site_tools::cash_chart_webp::run(&root),
            "favicon_render" => site_tools::favicon_render::run(&root),
            "minify_site" => site_tools::minify_site::run(&root, rest),
            "pin_rates_dataset" => site_tools::pin_rates::run(&root, rest),
            "release_record" => site_tools::release_record::run(&root, rest),
            "render_about_portrait" => site_tools::about_portrait::run(&root, rest),
            "serve_site" => site_tools::serve_site::run(&root),
            "visibility_benchmark" => site_tools::visibility::run(&root, rest),
            "extract_xero_badge" => site_tools::extract_xero_badge::run(&root, rest),
            _ => Err(format!("site-tools: unknown command {command:?}\n{USAGE}")),
        }),
    };
    match result {
        Ok(code) => ExitCode::from(code),
        Err(error) => {
            let _ = site_tools::print_text(&format!("{error}\n"), true);
            ExitCode::FAILURE
        }
    }
}
