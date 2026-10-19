use std::process::ExitCode;

const USAGE: &str = "usage: site-tools <command> [arguments]\n\ncommands: build_feed, check_seo\n";

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let Some(command) = args.first() else {
        let _ = site_tools::print_text(USAGE, true);
        return ExitCode::from(2);
    };
    let rest = &args[1..];
    let result = site_tools::root().and_then(|root| match command.replace('-', "_").as_str() {
        "build_feed" => site_tools::feed::run(&root, rest),
        "check_seo" => site_tools::check_seo::run(&root),
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
