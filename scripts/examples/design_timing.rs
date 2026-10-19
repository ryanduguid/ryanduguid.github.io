//! Diagnostic aid: time each check_design stage against a checked site tree.
use site_tools::check_design as design;
use site_tools::pyjson;
use std::time::Instant;

fn main() {
    let root = std::path::PathBuf::from(std::env::args().nth(1).expect("site root"));
    let baseline =
        pyjson::loads(&site_tools::read(&root.join("scripts/design_baseline.json")).unwrap())
            .unwrap();
    let tokens = site_tools::read(&root.join("assets/tokens.css")).unwrap();
    let time = |label: &str, f: &dyn Fn()| {
        let start = Instant::now();
        f();
        eprintln!("{label:24} {:>8.3}s", start.elapsed().as_secs_f64());
    };
    time("repository", &|| drop(design::check_repository(&root)));
    time("document_delivery", &|| {
        drop(design::check_document_delivery(&root, &baseline))
    });
    time("favicon_assets", &|| {
        drop(design::check_favicon_assets(&root))
    });
    time("stylesheets", &|| {
        drop(design::check_stylesheets(&root, &baseline))
    });
    time("font_delivery", &|| {
        drop(design::check_font_delivery(&root, &tokens))
    });
    time("homepage_refinement", &|| {
        drop(design::check_homepage_refinement(&root))
    });
    time("copy", &|| drop(design::check_copy(&root)));
    time("opening_review_dates", &|| {
        drop(design::check_opening_review_dates(&root))
    });
    time("raw_text all pages", &|| {
        for path in site_tools::seo_core::html_files(&root) {
            drop(site_tools::seo_core::raw_text(
                &site_tools::read(&path).unwrap(),
            ));
        }
    });
}
