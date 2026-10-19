use std::process::ExitCode;

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let result = match args.first().map(String::as_str) {
        Some("build_feed") => {
            site_tools::root().and_then(|root| site_tools::feed::run(&root, &args[1..]))
        }
        _ => {
            let _ =
                site_tools::print_text("usage: site-tools build_feed [--write|--check]\n", true);
            return ExitCode::from(2);
        }
    };
    match result {
        Ok(code) => ExitCode::from(code),
        Err(error) => {
            let _ = site_tools::print_text(&format!("{error}\n"), true);
            ExitCode::FAILURE
        }
    }
}
