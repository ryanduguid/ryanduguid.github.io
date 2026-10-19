use std::process::ExitCode;

const USAGE: &str = "usage: site-tools <command> [arguments]\n\ncommands: build_feed, build_llms_full, build_site, check_design, check_seo, extract_xero_badge, favicon_render, serve_site\n";

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let Some(command) = args.first() else {
        let _ = site_tools::print_text(USAGE, true);
        return ExitCode::from(2);
    };
    let rest = &args[1..];
    let result = site_tools::root().and_then(|root| match command.replace('-', "_").as_str() {
        "build_feed" => site_tools::feed::run(&root, rest),
        "build_llms_full" => site_tools::llms_full::run(&root, rest),
        "build_site" => site_tools::build_site::run(&root),
        "check_seo" => site_tools::check_seo::run(&root),
        "check_design" => site_tools::check_design::run(&root, rest),
        "favicon_render" => site_tools::favicon_render::run(&root),
        "serve_site" => site_tools::serve_site::run(&root),
        "extract_xero_badge" => site_tools::extract_xero_badge::run(&root, rest),
        _ => Err(format!("site-tools: unknown command {command:?}\n{USAGE}")),
    });
    match result {
        Ok(code) => ExitCode::from(code),
        Err(error) => {
            let _ = site_tools::print_text(&format!("{error}\n"), true);
            ExitCode::FAILURE
        }
    }
}
