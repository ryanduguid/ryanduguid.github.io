//! The seo_core and site_contracts parts of scripts/test_contracts.py: focused mutation
//! tests for the site's public contracts, run against a copy of the committed site.
use site_tools::pyjson::{self, Json};
use site_tools::seo_core::{self as core, MetadataContext, Tree};
use site_tools::site_contracts as contracts;
use std::collections::HashSet;
use std::path::{Path, PathBuf};

mod common;
use common::*;

fn not_indexed() -> HashSet<String> {
    contracts::NOT_INDEXED
        .iter()
        .map(|s| (*s).to_owned())
        .collect()
}

/// Run the configured metadata checks for one page under an arbitrary root.
fn page_metadata_failures(root: &Path, rel: &str) -> Vec<String> {
    let (image, alt) = contracts::social_metadata_for_page(rel);
    core::check_file_metadata(
        &root.join(rel),
        contracts::SITE,
        &not_indexed(),
        &mut Vec::new(),
        &MetadataContext {
            expected_social_image: image.as_deref(),
            expected_social_alt: alt.as_deref(),
            description_limits: contracts::TIGHT_META_DESCRIPTION_PAGES
                .contains(&rel)
                .then_some(contracts::TIGHT_META_DESCRIPTION_LIMITS),
        },
        root,
    )
    .unwrap()
}

/// Run the share and referrer contracts directly against mutated HTML.
fn check_metadata_text(html: &str, rel: &str, failures: &mut Vec<String>) {
    let canonical = site_tools::pyre::re(r#"<link rel="canonical" href="(.*?)""#, 0)
        .search(html)
        .map(|m| m[1].to_owned());
    let (image, alt) = contracts::social_metadata_for_page(rel);
    core::check_social_metadata(
        html,
        rel,
        core::meta(html, "name", "description").as_deref(),
        canonical.as_deref(),
        &image.unwrap(),
        &alt.unwrap(),
        failures,
    );
    if site_tools::pyre::re(r#"<link\s+rel="stylesheet"(?:\s|/?>)"#, 0).is_match(html) {
        core::check_referrer_policy(html, rel, failures);
    }
}

fn contract_mutation(
    label: &str,
    source: &str,
    old: &str,
    new: &str,
    checker: impl Fn(&str, &mut Vec<String>),
    expected: &str,
) {
    let mut failures = Vec::new();
    checker(&changed_text(source, old, new), &mut failures);
    expect_failure(label, &failures, expected);
}

fn set(object: &Json, key: &str, value: Json) -> Json {
    let Json::Object(pairs) = object else {
        panic!("an object")
    };
    let mut pairs = pairs.clone();
    match pairs.iter_mut().find(|(k, _)| k == key) {
        Some(slot) => slot.1 = value,
        None => pairs.push((key.to_owned(), value)),
    }
    Json::Object(pairs)
}

#[test]
fn parked_consultancy_surface() {
    if !rendered() {
        return;
    }
    let homepage = read_text(root(), "index.html");
    let tree = core::parse_structure(&homepage);
    let ids: Vec<Option<&str>> = tree
        .descendants(Tree::ROOT, None, true)
        .into_iter()
        .map(|e| tree.attr(e, "id"))
        .collect();
    assert!(!ids.contains(&Some("engage")));
    assert!(
        !core::anchor_hrefs(&homepage)
            .iter()
            .any(|h| h == "/#engage")
    );
    assert!(!core::visible_text(&homepage).contains("Discuss a workflow"));
    for (rel, boundary) in [
        (
            "about/index.html",
            "not accepting professional engagements through this site",
        ),
        (
            "contact/index.html",
            "do not accept professional engagements through this site",
        ),
    ] {
        let page = read_text(root(), rel);
        let text = site_tools::py::casefold(&core::visible_text(&page));
        if rel == "about/index.html" {
            assert!(
                !site_tools::py::casefold(&page).contains("mailto:"),
                "{rel}"
            );
        }
        assert!(text.contains("not a practice"), "{rel}");
        assert!(text.contains(boundary), "{rel}");
    }
    let llms = read_text(root(), "llms.txt");
    assert!(!core::markdown_section(&llms, "Choose a route").contains("**Engage**"));
    let folded = site_tools::py::casefold(&llms);
    assert!(!folded.contains("firm workflow"));
    assert!(folded.contains("not accepting professional engagements through this site"));
    for path in core::html_files(root()) {
        let rel = core::rel(&path, root());
        if rel == "changelog/index.html" {
            continue;
        }
        let html = site_tools::py::casefold(&site_tools::read(&path).unwrap());
        assert!(!html.contains("/#engage"), "{rel}: Engage URL remains");
        assert!(!html.contains("firm workflow or controlled pilot"), "{rel}");
    }
}

fn web_page(html: &str, rel: &str) -> Json {
    let mut failures = Vec::new();
    let pages: Vec<Json> = core::json_ld_blocks(html, rel, &mut failures)
        .iter()
        .flat_map(|b| {
            core::nodes(b)
                .into_iter()
                .filter(|n| {
                    n.get("@type")
                        .is_some_and(|t| t.py_eq(&Json::str_obj("WebPage")))
                })
                .cloned()
                .collect::<Vec<_>>()
        })
        .collect();
    assert!(failures.is_empty(), "{failures:?}");
    assert_eq!(
        pages.len(),
        1,
        "{rel}: expected one WebPage, found {pages:?}"
    );
    pages[0].clone()
}

fn title(html: &str) -> Option<String> {
    site_tools::pyre::re(r"<title>(.*?)</title>", site_tools::pyre::S)
        .search(html)
        .map(|m| site_tools::py::strip(&m[1]).to_owned())
}

#[test]
fn geo_leftovers_surface() {
    if !rendered() {
        return;
    }
    let homepage_title = "Open source tools for Australian accountants";
    let coal_title = "Coal LSL levy calculator and section 3B eligible wages";
    let coal_lead = "The coal mining long service leave (Coal LSL) levy is 2.7% of monthly eligible wages. Section 3B has separate base rate, annual salary and casual branches. The base rate branch uses the greater of Formula A and Formula B.";
    let home = read_text(root(), "index.html");
    let tools = read_text(root(), "tools/index.html");
    let coal = read_text(root(), "tools/coal-lsl-levy/index.html");
    let s = Json::str_obj;
    assert_eq!(title(&home).as_deref(), Some(homepage_title));
    assert_ne!(title(&home), title(&tools));
    assert_eq!(
        core::meta(&home, "property", "og:title").as_deref(),
        Some(homepage_title)
    );
    assert_eq!(
        core::meta(&home, "name", "twitter:title").as_deref(),
        Some(homepage_title)
    );
    assert!(
        web_page(&home, "index.html")
            .get("name")
            .unwrap()
            .py_eq(&s(homepage_title))
    );

    let tree = core::parse_structure(&coal);
    let h1s = tree.descendants(Tree::ROOT, Some("h1"), true);
    let leads: Vec<usize> = tree
        .descendants(Tree::ROOT, None, true)
        .into_iter()
        .filter(|e| tree.has_class(*e, "short-answer"))
        .collect();
    assert_eq!(title(&coal).as_deref(), Some(coal_title));
    assert!(h1s.len() == 1 && tree.text(h1s[0]) == "Coal LSL levy calculator");
    assert!(leads.len() == 1 && tree.text(leads[0]) == coal_lead);
    assert_eq!(
        core::meta(&coal, "property", "og:title").as_deref(),
        Some(coal_title)
    );
    assert_eq!(
        core::meta(&coal, "name", "twitter:title").as_deref(),
        Some(coal_title)
    );
    let coal_page = web_page(&coal, "tools/coal-lsl-levy/index.html");
    assert!(coal_page.get("name").unwrap().py_eq(&s(coal_title)));
    assert!(
        coal_page
            .get("dateModified")
            .unwrap()
            .py_eq(&s("2026-10-21"))
    );
    assert!(core::visible_text(&coal).contains("Last reviewed 21 October 2026."));

    let robots = read_text(root(), "robots.txt");
    assert!(robots.contains(
        "# Unnamed agents must not silently redefine this policy; named rows state the intended treatment."
    ));
    let mut groups = core::robots_groups(&robots);
    groups.sort();
    let mut expected: Vec<(String, Vec<String>)> = [
        ("*", "Allow: /"),
        ("Googlebot", "Allow: /"),
        ("Bingbot", "Allow: /"),
        ("OAI-SearchBot", "Allow: /"),
        ("ChatGPT-User", "Allow: /"),
        ("Claude-User", "Allow: /"),
        ("Claude-Search", "Allow: /"),
        ("Claude-SearchBot", "Allow: /"),
        ("PerplexityBot", "Allow: /"),
        ("Applebot", "Allow: /"),
        ("YouBot", "Allow: /"),
        ("anthropic-ai", "Allow: /"),
        ("Claude-Web", "Allow: /"),
        ("GPTBot", "Allow: /"),
        ("ClaudeBot", "Allow: /"),
        ("Google-Extended", "Allow: /"),
        ("Applebot-Extended", "Allow: /"),
        ("CCBot", "Allow: /"),
        ("Bytespider", "Allow: /"),
        ("Amazonbot", "Disallow: /"),
        ("cohere-ai", "Disallow: /"),
        ("Diffbot", "Disallow: /"),
        ("FacebookBot", "Disallow: /"),
        ("meta-externalagent", "Disallow: /"),
    ]
    .iter()
    .map(|(a, d)| ((*a).to_owned(), vec![(*d).to_owned()]))
    .collect();
    expected.sort();
    assert_eq!(groups, expected);

    // Each page's visible review date, its JSON-LD dateModified and its
    // sitemap lastmod must agree; the dates themselves move with each edit.
    for (rel, url) in [
        ("rates/index.html", "https://duguid.com.au/rates/"),
        ("evaluate/index.html", "https://duguid.com.au/evaluate/"),
    ] {
        let html = read_text(root(), rel);
        let tree = core::parse_structure(&html);
        let meta: Vec<String> = tree
            .descendants(Tree::ROOT, None, true)
            .into_iter()
            .filter(|e| tree.has_class(*e, "page-meta"))
            .map(|e| tree.text(e))
            .collect();
        let [line] = meta.as_slice() else {
            panic!("{rel}: expected one page-meta line, found {meta:?}");
        };
        let review = line
            .strip_prefix("Last reviewed ")
            .and_then(|d| d.strip_suffix('.'))
            .unwrap_or_else(|| panic!("{rel}: page-meta is {line:?}"));
        let modified = site_tools::pytime::strptime_day_month_year(review)
            .unwrap_or_else(|| panic!("{rel}: {review:?} is not a date"))
            .isoformat();
        assert!(
            web_page(&html, rel)
                .get("dateModified")
                .unwrap()
                .py_eq(&s(&modified)),
            "{rel}: dateModified differs from {review}"
        );
        assert_eq!(core::sitemap_lastmods(url, root()).unwrap(), [modified]);
    }
    let tables = core::markdown_section(&read_text(root(), "llms.txt"), "Reference tables");
    for url in [
        "https://duguid.com.au/rates/super-guarantee/super-guarantee-rates.csv",
        "https://duguid.com.au/rates/div7a-benchmark-rate/div7a-benchmark-rates.csv",
        "https://duguid.com.au/rates/cents-per-kilometre/cents-per-kilometre-rates.csv",
        "https://duguid.com.au/rates/maximum-contribution-base/maximum-contribution-base.csv",
        "https://duguid.com.au/rates/car-limit/car-limit.csv",
        "https://duguid.com.au/rates/fbt-rate/fbt-rates.csv",
    ] {
        assert_eq!(tables.matches(url).count(), 1, "{url}");
    }
    let levy = "https://duguid.com.au/tools/coal-lsl-levy/";
    assert_eq!(
        core::sitemap_lastmods(levy, root()).unwrap().len(),
        1,
        "{levy}"
    );
}

#[test]
fn indexable_robots_metadata() {
    if !rendered() {
        return;
    }
    let original = read_text(root(), "contact/index.html");
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("contact/index.html");
    std::fs::create_dir(path.parent().unwrap()).unwrap();
    let mut missed = Vec::new();
    for tag in [
        r#"<meta name="robots" content="noindex">"#,
        r#"<META NAME="ROBOTS" CONTENT="NoIndex, Follow">"#,
        "<meta content='none' name='robots' />",
        r#"<meta name="robots" content="index"><meta name="robots" content="noindex">"#,
        r#"<meta name="googlebot" content="noindex">"#,
        r#"<meta name="robots" content="index, follow"><meta name="googlebot" content="noindex">"#,
        "<meta content='none' name='GOOGLEBOT-NEWS' />",
        r#"<META NAME="GOOGLEBOT" CONTENT="NoIndex, Follow">"#,
        r#"<meta name="bingbot" content="noindex">"#,
    ] {
        std::fs::write(
            &path,
            original.replacen("</head>", &format!("{tag}</head>"), 1),
        )
        .unwrap();
        if !page_metadata_failures(directory.path(), "contact/index.html")
            .iter()
            .any(|f| f.contains("indexable page"))
        {
            missed.push(tag);
        }
    }
    assert!(
        missed.is_empty(),
        "indexable pages accepted indexing restrictions: {missed:?}"
    );
    for tag in [
        r#"<meta name="robots" content="index, follow">"#,
        r#"<meta name="robots" content="noimageindex, nosnippet">"#,
        r#"<!-- <meta name="robots" content="noindex"> -->"#,
        r#"<template><meta name="robots" content="noindex"></template>"#,
        r#"<meta name="author" content="none">"#,
    ] {
        std::fs::write(
            &path,
            original.replacen("</head>", &format!("{tag}</head>"), 1),
        )
        .unwrap();
        assert_clean(
            "indexable robots control",
            &page_metadata_failures(directory.path(), "contact/index.html"),
        );
    }
    std::fs::write(
        directory.path().join("404.html"),
        read_text(root(), "404.html"),
    )
    .unwrap();
    assert_clean(
        "deliberately unindexed page",
        &page_metadata_failures(directory.path(), "404.html"),
    );
}

#[test]
fn html_file_discovery() {
    let directory = tempfile::tempdir().unwrap();
    let root = directory.path();
    let mut public: Vec<String> = [
        "index.html",
        "about/index.html",
        "about/nested/page.html",
        "google-directory.html/nested/index.html",
        "catalog.html",
    ]
    .map(String::from)
    .to_vec();
    std::fs::create_dir(root.join("catalog.html")).unwrap();
    for relative in &public[..public.len() - 1] {
        let page = root.join(relative);
        std::fs::create_dir_all(page.parent().unwrap()).unwrap();
        std::fs::write(page, "<main>Review</main>").unwrap();
    }
    for relative in [
        ".hidden.html",
        "google-verification.html",
        "about/google-check.html",
    ] {
        std::fs::write(root.join(relative), "excluded").unwrap();
    }
    for name in core::GENERATED_HTML_DIRECTORIES.iter().chain(&[".hidden"]) {
        for parent in [root.to_path_buf(), root.join("about")] {
            let page = parent.join(name).join("nested/index.html");
            std::fs::create_dir_all(page.parent().unwrap()).unwrap();
            std::fs::write(page, "excluded").unwrap();
        }
    }
    std::fs::write(root.join("uppercase.HTML"), "<main>Review</main>").unwrap();
    // PurePath.match is case-insensitive on Windows only.
    if cfg!(windows) {
        public.push("uppercase.HTML".into());
    }
    let mut entered = Vec::new();
    let found = core::html_files_observed(root, &mut |path| entered.push(path.to_path_buf()));
    for path in entered {
        let relative = path.strip_prefix(root).unwrap();
        assert!(
            !relative.components().any(|c| {
                let part = c.as_os_str().to_string_lossy();
                part.starts_with('.') || core::GENERATED_HTML_DIRECTORIES.contains(&part.as_ref())
            }),
            "HTML discovery entered excluded directory: {relative:?}"
        );
    }
    let mut expected: Vec<PathBuf> = public
        .iter()
        .map(|name| {
            name.split('/')
                .fold(root.to_path_buf(), |p, part| p.join(part))
        })
        .collect();
    site_tools::sort_paths(&mut expected);
    assert_eq!(found, expected);
    assert!(core::html_files(&root.join("missing")).is_empty());
    assert!(core::html_files(&root.join("index.html")).is_empty());
}

#[test]
fn public_contracts_page_and_site_checks() {
    if !rendered() {
        return;
    }
    let home = read_text(root(), "index.html");
    let calculator = read_text(root(), contracts::CALCULATOR_REL);
    let evidence = read_text(root(), contracts::EVIDENCE_REL);
    let module = read_text(root(), contracts::LEVY_PAGE_MODULE);
    let paths = core::html_files(root());
    let indexed = paths
        .iter()
        .filter(|p| !contracts::NOT_INDEXED.contains(&core::rel(p, root()).as_str()))
        .count();
    // The sitemap lists every indexable page, so the count follows it.
    let listed = core::sitemap_urls(root()).unwrap().len();
    assert_eq!(
        indexed, listed,
        "expected {listed} canonical HTML pages, as the sitemap lists, found {indexed}"
    );
    let metadata: Vec<String> = paths
        .iter()
        .flat_map(|p| page_metadata_failures(root(), &core::rel(p, root())))
        .collect();
    assert_clean("complete page metadata", &metadata);

    let mut failures = Vec::new();
    contracts::check_homepage_contract(&home, &mut failures);
    contracts::check_shared_shell(&home, "index.html", &mut failures);
    contracts::check_calculator_contract(&calculator, &mut failures, &module);
    contracts::check_article_pattern(&evidence, contracts::EVIDENCE_REL, &mut failures);
    contracts::check_rate_table_region(
        &read_text(root(), "rates/super-guarantee/index.html"),
        "rates/super-guarantee/index.html",
        &mut failures,
    );
    assert_clean("page contracts", &failures);
    assert_clean(
        "evidence surface",
        &contracts::check_evidence_page(root()).unwrap(),
    );
    assert_clean(
        "Xero evaluation summary",
        &contracts::check_xero_evaluation_summary(root()).unwrap(),
    );
    assert_clean(
        "authority surface",
        &contracts::check_authority_surface(root()).unwrap(),
    );
    assert_clean(
        "evaluation packs",
        &contracts::check_evaluation_packs(root()).unwrap(),
    );
    assert_clean(
        "task routes",
        &contracts::check_task_routes(root()).unwrap(),
    );
    assert_clean(
        "privacy delivery claims",
        &contracts::check_privacy_delivery_claims(root()).unwrap(),
    );
    assert_clean(
        "collection hubs",
        &contracts::check_collection_hubs(root()).unwrap(),
    );
    assert_clean(
        "social cards",
        &contracts::check_social_cards(root()).unwrap(),
    );
    expect_failure(
        "homepage headline changed without updating its card",
        &contracts::check_social_cards_for(root(), "An updated homepage headline").unwrap(),
        "site social card must match the homepage headline",
    );
    let robots = read_text(root(), "robots.txt");
    assert_clean("robots policy", &contracts::check_robots_policy(&robots));
    assert_clean(
        "AI-agent review date",
        &contracts::check_mcp_review_dates(&read_text(root(), contracts::MCP_REL)),
    );
    let (sitemap, _) =
        core::check_sitemap(&paths, contracts::SITE, &not_indexed(), root()).unwrap();
    assert_clean("sitemap and machine index coverage", &sitemap);
}

#[test]
fn public_contracts_install_and_adoption_routes() {
    if !rendered() {
        return;
    }
    for (label, before, after, failure) in [
        (
            "homepage install command duplication",
            "Set up AI tools",
            "claude mcp add aus-accounting -- uvx aus-accounting-mcp",
            "index.html: install commands belong in the integration guide",
        ),
        (
            "homepage setup guide route",
            "href=\"/tools/australian-tax-ai-agents/#install\">Set up AI tools",
            "href=\"/tools/australian-tax-ai-agents/\">Set up AI tools",
            "index.html: #adopt must link to the integration guide",
        ),
    ] {
        let site = copied_site();
        replace_file(site.path(), "index.html", before, after);
        expect_failure(
            label,
            &contracts::check_authority_surface(site.path()).unwrap(),
            failure,
        );
    }
    let route = [
        "https://github.com/ryanduguid/github-agent-skills",
        "git clone https://github.com/ryanduguid/github-agent-skills.git",
        "cd github-agent-skills",
        "python scripts/validate_skills.py --strict",
        contracts::GITHUB_AGENT_SKILLS_BOUNDARY,
    ];
    let install_text = core::visible_text(&read_text(root(), contracts::MCP_REL));
    assert!(install_text.contains("Five ways to try it"));
    for required in route {
        assert!(install_text.contains(required), "{required:?}");
    }
    let once = format!(
        "{}: install commands must appear exactly once inside #install",
        contracts::MCP_REL
    );
    for (label, before, after, expected) in [
        (
            "stable skills release pin",
            "checkout --detach v0.4.0",
            "checkout v0.2.1",
            once.as_str(),
        ),
        (
            "github-agent-skills bootstrap command",
            "python scripts/validate_skills.py --strict",
            "python scripts/validate_skills.py --missing",
            once.as_str(),
        ),
        (
            "github-agent-skills boundary",
            contracts::GITHUB_AGENT_SKILLS_BOUNDARY,
            "github-agent-skills changes the maintenance workflow.",
            "tools/australian-tax-ai-agents/index.html: github-agent-skills boundary must be",
        ),
    ] {
        let site = copied_site();
        replace_file(site.path(), contracts::MCP_REL, before, after);
        expect_failure(
            label,
            &contracts::check_authority_surface(site.path()).unwrap(),
            expected,
        );
    }
}

#[test]
fn public_contracts_payday_example() {
    if !rendered() {
        return;
    }
    let payday = read_text(root(), "tools/payday-super/index.html");
    assert_clean(
        "payday receipt boundary",
        &contracts::check_payday_receipt_boundary(&payday),
    );
    let provenance = pyjson::loads(&read_text(
        root(),
        "tools/payday-super/example-provenance.json",
    ))
    .unwrap();
    assert_clean(
        "fixed Payday evidence",
        &contracts::check_payday_example(&payday, &provenance),
    );
    let field = |key: &str| provenance.get(key).unwrap().as_str().unwrap().to_owned();
    let fixture_url = field("fixture_url");
    let unpinned = fixture_url.replace(&field("commit"), "main");
    let fingerprint = field("fixture_sha256");
    for (label, before, after) in [
        ("wrong verdict", ">AT_RISK</span>", ">ON_TIME</span>"),
        ("wrong contribution", ">$120.00</span>", ">$121.00</span>"),
        (
            "wrong visible deadline",
            ">17 August 2026</time>",
            ">18 August 2026</time>",
        ),
        (
            "wrong deadline metadata",
            "datetime=\"2026-08-17\"",
            "datetime=\"2026-08-18\"",
        ),
        (
            "wrong fixture fingerprint",
            fingerprint.as_str(),
            &"0".repeat(64),
        ),
        (
            "wrong first-contribution pathway",
            "data-example=\"first_contribution\">no",
            "data-example=\"first_contribution\">yes",
        ),
        (
            "wrong out-of-cycle pathway",
            "data-example=\"out_of_cycle\">no",
            "data-example=\"out_of_cycle\">yes",
        ),
        ("unpinned fixture", fixture_url.as_str(), unpinned.as_str()),
    ] {
        assert!(payday.contains(before), "{label}");
        expect_failure(
            label,
            &contracts::check_payday_example(&payday.replace(before, after), &provenance),
            "fixed Payday example",
        );
    }
    for pathway in ["first_contribution", "out_of_cycle"] {
        let changed = set(&provenance, pathway, Json::Bool(true));
        expect_failure(
            "recorded pathway drift",
            &contracts::check_payday_example(&payday, &changed),
            "fixed Payday example",
        );
        let page = payday.replace(
            &format!("data-example=\"{pathway}\">no"),
            &format!("data-example=\"{pathway}\">yes"),
        );
        assert_clean(
            "matching true pathway representation",
            &contracts::check_payday_example(&page, &changed),
        );
        expect_failure(
            "non-boolean pathway",
            &contracts::check_payday_example(
                &payday,
                &set(&provenance, pathway, Json::str_obj("no")),
            ),
            "fixed Payday example",
        );
    }
    expect_failure(
        "categorical missing-receipt claim",
        &contracts::check_payday_receipt_boundary(
            "<p>Without a fund receipt date, a line can only be \"at risk\".</p>",
        ),
        "must not say a missing receipt can only be at-risk or unknown",
    );
}

#[test]
fn public_contracts_person_graph() {
    if !rendered() {
        return;
    }
    let about = read_text(root(), "about/index.html");
    let mut parse_failures = Vec::new();
    let people = |html: &str, rel: &str, failures: &mut Vec<String>| -> Vec<Json> {
        core::json_ld_blocks(html, rel, failures)
            .iter()
            .flat_map(|b| {
                core::nodes(b)
                    .into_iter()
                    .filter(|n| core::has_type(n, "Person"))
                    .cloned()
                    .collect::<Vec<_>>()
            })
            .collect()
    };
    let canonical = people(&about, "about/index.html", &mut parse_failures);
    assert_clean("About JSON-LD", &parse_failures);
    assert_eq!(canonical.len(), 1);
    let canonical = &canonical[0];
    assert_clean(
        "canonical Person",
        &contracts::check_canonical_person(canonical),
    );
    let Some(Json::Array(same_as)) = canonical.get("sameAs") else {
        panic!("sameAs")
    };
    let reversed = set(
        canonical,
        "sameAs",
        Json::Array(same_as.iter().rev().cloned().collect()),
    );
    expect_failure(
        "canonical identity order",
        &contracts::check_canonical_person(&reversed),
        "Person sameAs must contain only",
    );
    let homepage = people(
        &read_text(root(), "index.html"),
        "index.html",
        &mut parse_failures,
    );
    assert_eq!(homepage.len(), 1);
    let stub = &homepage[0];
    assert_clean(
        "homepage Person stub",
        &contracts::check_person_stub("index.html", stub, canonical),
    );
    expect_failure(
        "homepage Person stub drift",
        &contracts::check_person_stub(
            "index.html",
            &set(stub, "name", Json::str_obj("R. Duguid")),
            canonical,
        ),
        "stub name differs from the canonical Person",
    );
    expect_failure(
        "Person stub outside the homepage",
        &contracts::check_person_stub("tools/index.html", stub, canonical),
        "must not define a Person node",
    );
    let extra_type = set(
        stub,
        "@type",
        Json::Array(vec![Json::str_obj("Person"), Json::str_obj("Organization")]),
    );
    expect_failure(
        "homepage Person stub extra type",
        &contracts::check_person_stub("index.html", &extra_type, canonical),
        "stub @type differs from the canonical Person",
    );
    expect_failure(
        "homepage Person stub unknown null field",
        &contracts::check_person_stub("index.html", &set(stub, "bogus", Json::Null), canonical),
        "stub must carry exactly",
    );
    let graph = vec![
        ("about/index.html".to_owned(), canonical.clone()),
        ("index.html".to_owned(), stub.clone()),
    ];
    assert_clean(
        "Person stub cardinality",
        &contracts::check_person_stubs(&graph, canonical),
    );
    let mut duplicated = graph.clone();
    duplicated.push(("index.html".to_owned(), stub.clone()));
    expect_failure(
        "duplicate homepage Person stubs",
        &contracts::check_person_stubs(&duplicated, canonical),
        "exactly one Person stub",
    );
    expect_failure(
        "missing homepage Person stub",
        &contracts::check_person_stubs(&graph[..1], canonical),
        "exactly one Person stub",
    );
    let evidence = read_text(root(), contracts::EVIDENCE_REL);
    contract_mutation(
        "About opening",
        &about,
        contracts::ABOUT_OPENING,
        "I build software.",
        |html, found| contracts::check_approved_page_opening(html, "about/index.html", found),
        "about/index.html: page opening must be",
    );
    contract_mutation(
        "Evidence opening",
        &evidence,
        contracts::EVIDENCE_OPENING,
        "This register links claims.",
        |html, found| contracts::check_approved_page_opening(html, contracts::EVIDENCE_REL, found),
        "evidence/index.html: page opening must be",
    );
}

#[test]
fn public_contracts_routes_privacy_and_evaluations() {
    if !rendered() {
        return;
    }
    let site = copied_site();
    replace_file(
        site.path(),
        "tools/index.html",
        "<a href=\"/evaluate/manager-review-gate/\"><strong>Check a BAS pack before manager review</strong>",
        "<a href=\"/evaluate/#example-routes\"><strong>Check a BAS pack before manager review</strong>",
    );
    expect_failure(
        "tools task route destination",
        &contracts::check_task_routes(site.path()).unwrap(),
        "tools/index.html: task routes are",
    );
    let site = copied_site();
    replace_file(
        site.path(),
        "llms.txt",
        "- **Calculate a Coal LSL levy** (https://duguid.com.au/tools/coal-lsl-levy/):",
        "- **Calculate a Coal LSL levy** (https://duguid.com.au/tools/):",
    );
    expect_failure(
        "machine route destination",
        &contracts::check_task_routes(site.path()).unwrap(),
        "must route 'Calculate a Coal LSL levy'",
    );
    let site = copied_site();
    replace_file(
        site.path(),
        "privacy/index.html",
        "Email Address Obfuscation is disabled so email links work without scripts.",
        "Neither addition reports anything to the site owner.",
    );
    expect_failure(
        "provider no-reporting assurance",
        &contracts::check_privacy_delivery_claims(site.path()).unwrap(),
        "unsupported delivery claim",
    );
    let site = copied_site();
    replace_file(
        site.path(),
        "evaluate/xero-trial-balance-integrity/index.html",
        "Balance does not prove completeness, classification or approval.",
        "Balance does not prove every accounting conclusion.",
    );
    expect_failure(
        "Xero evaluation limit",
        &contracts::check_xero_evaluation_summary(site.path()).unwrap(),
        "evaluate/xero-trial-balance-integrity/index.html: evaluation summary is incomplete",
    );
    type Checker = fn(&Path) -> Result<Vec<String>, String>;
    for (label, rel, old, new, checker, expected) in [
        (
            "whitespace-prefixed consultancy email",
            "contact/index.html",
            "mailto:ryan@duguid.com.au?subject=Website%20or%20tool%20feedback",
            "\n mailto:consult@example.com",
            contracts::check_authority_surface as Checker,
            "contact/index.html: non-practice boundary is incomplete",
        ),
        (
            "evidence canonical",
            "evidence/index.html",
            "<link rel=\"canonical\" href=\"https://duguid.com.au/evidence/\" />",
            "<link rel=\"canonical\" href=\"https://duguid.com.au/evidence-copy/\" />",
            contracts::check_evidence_page as Checker,
            "evidence/index.html: canonical is",
        ),
        (
            "authority route",
            "index.html",
            "id=\"verify\"",
            "id=\"missing-verify\"",
            contracts::check_authority_surface as Checker,
            "index.html: missing visible authority section #verify",
        ),
        (
            "evaluation section order",
            "evaluate/manager-review-gate/index.html",
            "id=\"versions\"",
            "id=\"releases\"",
            contracts::check_evaluation_packs as Checker,
            "evaluation section order must be",
        ),
    ] {
        let site = copied_site();
        replace_file(site.path(), rel, old, new);
        expect_failure(label, &checker(site.path()).unwrap(), expected);
    }
    let robots = read_text(root(), "robots.txt");
    expect_failure(
        "training crawler opened",
        &contracts::check_robots_policy(&changed_text(
            &robots,
            "User-agent: Amazonbot\nDisallow: /",
            "User-agent: Amazonbot\nAllow: /",
        )),
        "robots.txt: Amazonbot must have exactly",
    );
}

#[test]
fn public_contracts_homepage_and_metadata_mutations() {
    if !rendered() {
        return;
    }
    let home = read_text(root(), "index.html");
    for (label, old, new, expected) in [
        (
            "homepage title",
            "<title>Open source tools for Australian accountants</title>",
            "<title>Wrong homepage title</title>",
            "index.html: homepage title is",
        ),
        (
            "homepage description",
            contracts::HOMEPAGE_DESCRIPTION,
            "Wrong homepage description",
            "index.html: homepage description is",
        ),
        (
            "homepage heading",
            contracts::HOMEPAGE_HEADING_MARKUP,
            "<h1 id=\"home-title\">Controls for accounting work.</h1>",
            "index.html: homepage H1 must be",
        ),
        (
            "homepage primary action",
            "Explore the cash flow example",
            "Browse every tool",
            "index.html: homepage actions are",
        ),
        (
            "homepage category anchor",
            "href=\"/tools/workpaper-review-gate/\"",
            "href=\"/tools/missing-workpaper-review-gate/\"",
            "index.html: category preview is",
        ),
        (
            "homepage Adopt anchor",
            "id=\"adopt\"",
            "id=\"adopt-copy\"",
            "index.html: expected exactly one valid #adopt anchor",
        ),
        (
            "proof evidence route",
            "<a href=\"/evidence/\">Open the evidence register</a>",
            "<a href=\"/missing-evidence/\">Open the evidence register</a>",
            "proof feature is missing required link /evidence/",
        ),
    ] {
        contract_mutation(
            label,
            &home,
            old,
            new,
            contracts::check_homepage_contract,
            expected,
        );
    }
    let description = format!(
        "<meta property=\"og:description\" content=\"{}\" />",
        contracts::HOMEPAGE_DESCRIPTION
    );
    for (label, old, new, expected) in [
        (
            "Open Graph field",
            "  <meta property=\"og:image:height\" content=\"630\" />\n",
            "",
            "expected exactly one non-empty og:image:height",
        ),
        (
            "Twitter field",
            "  <meta name=\"twitter:image:alt\" content=\"OLED register card: Open source tools for Australian accountants\" />\n",
            "",
            "expected exactly one non-empty twitter:image:alt",
        ),
        (
            "canonical and Open Graph URL",
            "<meta property=\"og:url\" content=\"https://duguid.com.au/\" />",
            "<meta property=\"og:url\" content=\"https://duguid.com.au/copy/\" />",
            "og:url is 'https://duguid.com.au/copy/'",
        ),
        (
            "social-card context",
            "<meta property=\"og:image\" content=\"https://duguid.com.au/assets/social-card-site-20261016.png\" />",
            "<meta property=\"og:image\" content=\"https://duguid.com.au/assets/social-card-tools-20261016.png\" />",
            "og:image is 'https://duguid.com.au/assets/social-card-tools-20261016.png'",
        ),
        (
            "referrer policy",
            "  <meta name=\"referrer\" content=\"strict-origin-when-cross-origin\" />\n",
            "",
            "referrer policy is []",
        ),
        (
            "Open Graph description mirror",
            description.as_str(),
            "<meta property=\"og:description\" content=\"Different share description.\" />",
            "og:description is 'Different share description.'",
        ),
        (
            "Twitter title mirror",
            "<meta name=\"twitter:title\" content=\"Open source tools for Australian accountants\" />",
            "<meta name=\"twitter:title\" content=\"Different share title\" />",
            "twitter:title is 'Different share title'",
        ),
    ] {
        contract_mutation(
            label,
            &home,
            old,
            new,
            |html, found| check_metadata_text(html, "index.html", found),
            expected,
        );
    }
    let payday = read_text(root(), "tools/payday-super/index.html");
    let long = "Current release payday-super-checker v0.2.2. Inspect a synthetic $120 contribution, its AT_RISK result and fund receipt evidence. Review aid.";
    let short = "Check Payday Super timing from payroll exports and estimate the SG charge for review, with fund receipt status visible.";
    assert_eq!(payday.matches(long).count(), 3);
    let directory = tempfile::tempdir().unwrap();
    let rel = "tools/payday-super/index.html";
    let path = directory.path().join(rel);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(&path, payday.replace(long, short)).unwrap();
    expect_failure(
        "tight description range",
        &page_metadata_failures(directory.path(), rel),
        "outside required 120 to 155",
    );
    contract_mutation(
        "shared skip link",
        &home,
        "class=\"skip-link\" href=\"#main\"",
        "class=\"skip-link\" href=\"#content\"",
        |html, found| contracts::check_shared_shell(html, "index.html", found),
        "expected exactly one .skip-link targeting #main",
    );
    contract_mutation(
        "contact dropped from primary navigation",
        &home,
        "<a href=\"/contact/\">Contact</a>",
        "<a href=\"/contact-us/\">Contact</a>",
        |html, found| contracts::check_shared_shell(html, "index.html", found),
        "index.html: primary navigation is",
    );
}

#[test]
fn public_contracts_calculator_mutations() {
    if !rendered() {
        return;
    }
    let calculator = read_text(root(), contracts::CALCULATOR_REL);
    let module = read_text(root(), contracts::LEVY_PAGE_MODULE);
    let check = |html: &str, found: &mut Vec<String>| {
        contracts::check_calculator_contract(html, found, &module)
    };
    for (label, old, new, expected) in [
        (
            "calculator blank policy",
            contracts::CALCULATOR_COMMON_HELP,
            "Blank monetary amounts are accepted.",
            "form must contain one exact blank-as-zero note",
        ),
        (
            "calculator monetary help",
            "aria-describedby=\"money-blank-help baseRate-help\"",
            "aria-describedby=\"baseRate-help\"",
            "#baseRate aria-describedby must retain common and field-specific help",
        ),
        (
            "calculator reporting month required",
            "id=\"reportingMonth\" name=\"reportingMonth\" required",
            "id=\"reportingMonth\" name=\"reportingMonth\"",
            "#reportingMonth must have required",
        ),
        (
            "calculator print action",
            ">Print working</button>",
            ">Print result</button>",
            "result actions are",
        ),
        (
            "calculator privacy warning",
            contracts::CALCULATOR_PRIVACY_WARNING,
            "Enter an employee name or identifier.",
            "missing visible direct-identifier warning",
        ),
        (
            "calculator CSV action",
            ">Download CSV</button>",
            ">Export CSV</button>",
            "missing visible CSV action",
        ),
        (
            "calculator field name",
            "id=\"sacrificed\" name=\"sacrificed\"",
            "id=\"sacrificed\" name=\"sacrificed-broken\"",
            "#sacrificed name must be 'sacrificed'",
        ),
        (
            "calculator branch values",
            "name=\"branch\" value=\"baseRate\"",
            "name=\"branch\" value=\"wrong\"",
            "branch radio contract changed",
        ),
        (
            "calculator result status",
            "id=\"result\" role=\"status\"",
            "id=\"result\" role=\"region\"",
            "#result must be a polite status region",
        ),
        (
            "calculator wiring inlined",
            contracts::LEVY_PAGE_SCRIPT,
            "<script type=\"module\">import '/assets/levy-page.mjs';</script>",
            "must load the calculator wiring from",
        ),
    ] {
        contract_mutation(label, &calculator, old, new, check, expected);
    }
    let mut failures = Vec::new();
    contracts::check_formula_b_answer(
        &calculator
            .replace("allowances other than expense reimbursements", "allowances")
            .replace(
                "An amount that reimburses an expense is excluded by section 3B(1)(b)(iii). ",
                "",
            ),
        &mut failures,
    );
    expect_failure(
        "formula B exclusion removed from both copies",
        &failures,
        "Formula B answer omits the expense-reimbursement exclusion",
    );
    contract_mutation(
        "formula B structured answer is not a string",
        &calculator,
        "\"text\": \"For a non-casual",
        "\"text\": 42, \"ignored\": \"For a non-casual",
        contracts::check_formula_b_answer,
        "needs acceptedAnswer.text as a string",
    );
    contract_mutation(
        "formula B copies disagree",
        &calculator,
        "$500 of allowances that are not expense reimbursements, Formula B is 75% of $9,500, which is $7,125.00.",
        "$500 of eligible allowances, Formula B is 75% of $9,500, which is $7,125.00.",
        contracts::check_formula_b_answer,
        "structured Formula B answer differs from the visible one",
    );
    for (label, old, new, expected) in [
        (
            "calculator zero explanation",
            contracts::CALCULATOR_BLANK_RESULT_EXPLANATION,
            "Blank values were zero.",
            "zero result needs the blank-as-zero explanation",
        ),
        (
            "calculator engine import",
            "from '/assets/levy.mjs'",
            "from '/assets/levy-copy.mjs'",
            "protected levy engine import changed",
        ),
    ] {
        let mut failures = Vec::new();
        contracts::check_calculator_contract(
            &calculator,
            &mut failures,
            &changed_text(&module, old, new),
        );
        expect_failure(label, &failures, expected);
    }
}

/// Calculators and question topics sit under their hub; the hubs sit under Tools.
#[test]
fn nested_collection_breadcrumbs_name_their_hub() {
    let names = |rel: &str| -> Vec<String> {
        contracts::collection_breadcrumb_shape(rel, "Leaf")
            .unwrap()
            .into_iter()
            .map(|(name, _, _)| name)
            .collect()
    };
    assert_eq!(
        names("tools/business-calculators/margin/index.html"),
        ["Home", "Tools", "Business calculators", "Leaf"]
    );
    assert_eq!(
        names("tools/accounting-questions/gst-bas/index.html"),
        ["Home", "Tools", "Accounting questions", "Leaf"]
    );
    for hub in [
        "tools/business-calculators/index.html",
        "tools/accounting-questions/index.html",
        "tools/xero-trial-balance/index.html",
    ] {
        assert_eq!(names(hub), ["Home", "Tools", "Leaf"], "{hub}");
    }
}

#[test]
fn public_contracts_structure_and_assets() {
    if !rendered() {
        return;
    }
    let evidence = read_text(root(), contracts::EVIDENCE_REL);
    contract_mutation(
        "article contents navigator",
        &evidence,
        "aria-label=\"On this page\"",
        "aria-label=\"Contents\"",
        |html, found| contracts::check_article_pattern(html, contracts::EVIDENCE_REL, found),
        "expected exactly one On this page navigation",
    );
    let xero = read_text(root(), "tools/xero-trial-balance/index.html");
    contract_mutation(
        "tool review date outside header",
        &xero,
        "<p class=\"page-meta\">Published 24 August 2026. Last reviewed 25 October 2026.</p>",
        "<p class=\"moved-page-meta\">Published 24 August 2026. Last reviewed 13 October 2026.</p>",
        |html, found| {
            contracts::check_header_review_date(html, "tools/xero-trial-balance/index.html", found)
        },
        "Published/Last reviewed line must be in the page header",
    );
    let xero_breadcrumb = |root: &Path| -> Result<Vec<String>, String> {
        let mut found = Vec::new();
        contracts::check_collection_breadcrumb(
            &read_text(root, "tools/xero-trial-balance/index.html"),
            "tools/xero-trial-balance/index.html",
            &mut found,
        );
        Ok(found)
    };
    let site = copied_site();
    std::fs::remove_file(site.path().join("tools/index.html")).unwrap();
    expect_failure(
        "missing Tools hub",
        &contracts::check_collection_hubs(site.path()).unwrap(),
        "tools/index.html: missing collection hub",
    );
    let site = copied_site();
    replace_file(
        site.path(),
        "tools/xero-trial-balance/index.html",
        "<li><a href=\"/tools/\">Tools</a></li>",
        "<li><a href=\"/\">Tools</a></li>",
    );
    expect_failure(
        "tool breadcrumb parent",
        &xero_breadcrumb(site.path()).unwrap(),
        "breadcrumb 'Tools' points to '/', expected '/tools/'",
    );
    let site = copied_site();
    replace_file(
        site.path(),
        "tools/index.html",
        "\"numberOfItems\": 12",
        "\"numberOfItems\": 9",
    );
    expect_failure(
        "hub ItemList count",
        &contracts::check_collection_hubs(site.path()).unwrap(),
        "tools/index.html: ItemList count does not match visible entries",
    );

    let card = "assets/social-card-site-20261016.png";
    let site = copied_site();
    let path = site.path().join(card);
    let mut bytes = std::fs::read(&path).unwrap();
    bytes[16..20].copy_from_slice(&1199u32.to_be_bytes());
    std::fs::write(&path, &bytes).unwrap();
    expect_failure(
        "social card dimensions",
        &contracts::check_social_cards(site.path()).unwrap(),
        &format!("{card}: social card dimensions changed"),
    );
    let site = copied_site();
    let path = site.path().join(card);
    let mut bytes = std::fs::read(&path).unwrap();
    bytes.resize(contracts::SOCIAL_CARD_MAX_BYTES, 0);
    std::fs::write(&path, &bytes).unwrap();
    expect_failure(
        "social card byte budget",
        &contracts::check_social_cards(site.path()).unwrap(),
        &format!("{card}: social card must be under 50,000 bytes"),
    );
    let site = copied_site();
    replace_file(
        site.path(),
        "assets/social-cards.json",
        "Australian accountants",
        "Australia accountants",
    );
    expect_failure(
        "social card context copy",
        &contracts::check_social_cards(site.path()).unwrap(),
        "social-card context copy or mapping is stale",
    );
    let site = copied_site();
    let digest = site_tools::sha256(std::fs::read(site.path().join(card)).unwrap());
    replace_file(site.path(), "README.md", &digest, &"0".repeat(64));
    expect_failure(
        "social card checksum",
        &contracts::check_social_cards(site.path()).unwrap(),
        &format!("README.md: stale checksum for {card}"),
    );
}

#[test]
fn sitemap_uses_document_dates_instead_of_software_release_dates() {
    let directory = tempfile::tempdir().unwrap();
    let root = directory.path();
    let site = contracts::SITE;
    let page = root.join("index.html");
    std::fs::write(
        &page,
        r#"<script type="application/ld+json">{"@graph":[
          {"@type":"WebPage","dateModified":"2026-10-21"},
          {"@type":"TechArticle","dateModified":"2026-10-21"},
          {"@type":["SoftwareApplication","SoftwareSourceCode"],"dateModified":"2026-10-20"},
          {"@type":"Dataset","dateModified":"2026-09-22"}
        ]}</script>"#,
    )
    .unwrap();
    let sitemap =
        format!("<urlset><url><loc>{site}/</loc><lastmod>2026-10-21</lastmod></url></urlset>");
    std::fs::write(root.join("sitemap.xml"), &sitemap).unwrap();
    std::fs::write(root.join("llms.txt"), format!("{site}/ {site}/llms.txt")).unwrap();
    std::fs::write(
        root.join("robots.txt"),
        format!("Sitemap: {site}/sitemap.xml"),
    )
    .unwrap();
    let (failures, _) =
        core::check_sitemap(std::slice::from_ref(&page), site, &HashSet::new(), root).unwrap();
    assert_clean("document date after software release", &failures);
    std::fs::write(
        root.join("sitemap.xml"),
        sitemap.replace("2026-10-21", "2026-10-20"),
    )
    .unwrap();
    let (failures, _) = core::check_sitemap(&[page], site, &HashSet::new(), root).unwrap();
    expect_failure(
        "release date used for sitemap",
        &failures,
        "does not match its dateModified",
    );
}

#[test]
fn public_contracts_sitemap() {
    if !rendered() {
        return;
    }
    let site = copied_site();
    replace_file(
        site.path(),
        "sitemap.xml",
        "</urlset>",
        "  <url><loc>https://duguid.com.au/llms.txt</loc></url>\n</urlset>",
    );
    let (failures, _) = core::check_sitemap(
        &core::html_files(site.path()),
        contracts::SITE,
        &not_indexed(),
        site.path(),
    )
    .unwrap();
    expect_failure(
        "machine index in XML sitemap",
        &failures,
        "sitemap.xml: lists https://duguid.com.au/llms.txt",
    );
    let site = copied_site();
    let url = format!("{}/tools/monthly-close-controls/", contracts::SITE);
    let lastmods = core::sitemap_lastmods(&url, site.path()).unwrap();
    assert_eq!(lastmods.len(), 1);
    replace_file(
        site.path(),
        "sitemap.xml",
        &format!("<loc>{url}</loc>\n    <lastmod>{}</lastmod>", lastmods[0]),
        &format!("<loc>{url}</loc>\n    <lastmod>2000-01-01</lastmod>"),
    );
    let (failures, _) = core::check_sitemap(
        &core::html_files(site.path()),
        contracts::SITE,
        &not_indexed(),
        site.path(),
    )
    .unwrap();
    expect_failure(
        "sitemap lastmod drift",
        &failures,
        &format!("sitemap.xml: {url} lastmod ['2000-01-01'] does not match its dateModified"),
    );

    // An unrendered Jekyll page has no structured data until its layout runs.
    let directory = tempfile::tempdir().unwrap();
    let root = directory.path();
    let site = contracts::SITE;
    let stub = root.join("stub").join("index.html");
    let page = root.join("page").join("index.html");
    std::fs::create_dir(stub.parent().unwrap()).unwrap();
    std::fs::create_dir(page.parent().unwrap()).unwrap();
    std::fs::write(&stub, "---\nlayout: calculator\n---\n").unwrap();
    std::fs::write(
        &page,
        "<script type=\"application/ld+json\">{\"@context\": \"https://schema.org\", \"dateModified\": \"2026-09-25\"}</script>",
    )
    .unwrap();
    std::fs::write(
        root.join("sitemap.xml"),
        format!(
            "<urlset><url><loc>{site}/stub/</loc>\n    <lastmod>2026-09-01</lastmod></url><url><loc>{site}/page/</loc>\n    <lastmod>2026-09-12</lastmod></url></urlset>"
        ),
    )
    .unwrap();
    std::fs::write(
        root.join("llms.txt"),
        format!("{site}/stub/ {site}/page/ {site}/llms.txt"),
    )
    .unwrap();
    std::fs::write(
        root.join("robots.txt"),
        format!("Sitemap: {site}/sitemap.xml"),
    )
    .unwrap();
    let (failures, _) = core::check_sitemap(&[stub, page], site, &HashSet::new(), root).unwrap();
    assert_eq!(
        failures,
        [format!(
            "sitemap.xml: {site}/page/ lastmod ['2026-09-12'] does not match its dateModified ['2026-09-25']"
        )]
    );
}

#[test]
fn current_component_metadata() {
    if !rendered() {
        return;
    }
    let mut failures = Vec::new();
    let blocks = core::json_ld_blocks(
        &read_text(root(), "index.html"),
        "index.html",
        &mut failures,
    );
    assert_clean("homepage JSON-LD", &failures);
    let software: Vec<&Json> = blocks
        .iter()
        .flat_map(core::nodes)
        .filter(|n| core::has_type(n, "SoftwareSourceCode"))
        .collect();
    for (name, repository, directory) in [
        (
            "payday-super-checker",
            "australian-accounting",
            "packages/payday-super-checker",
        ),
        (
            "aus-accounting-mcp",
            "australian-accounting",
            "apps/aus-accounting-mcp",
        ),
        (
            "xero-trial-balance-export",
            "accounting-review-pipeline",
            "packages/xero-trial-balance-export",
        ),
        (
            "accounting-excel-toolkit",
            "accounting-review-pipeline",
            "adapters/accounting-excel-toolkit",
        ),
        (
            "review-ready-gate",
            "accounting-review-pipeline",
            "packages/review-ready-gate",
        ),
        (
            "monthly-close-control-plane",
            "accounting-review-pipeline",
            "packages/monthly-close-control-plane",
        ),
        (
            "australian-accounting-power-bi",
            "accounting-review-pipeline",
            "apps/australian-accounting-power-bi",
        ),
    ] {
        let node = software
            .iter()
            .rev()
            .find(|n| n.get("name").and_then(Json::as_str) == Some(name))
            .unwrap_or_else(|| panic!("{name}"));
        let root_url = format!("https://github.com/ryanduguid/{repository}");
        for field in ["url", "codeRepository"] {
            assert_eq!(
                node.get(field).and_then(Json::as_str),
                Some(format!("{root_url}/tree/main/{directory}").as_str()),
                "{name}: {field}"
            );
        }
        assert_eq!(
            node.get("license").and_then(Json::as_str),
            Some(format!("{root_url}/blob/main/{directory}/LICENSE").as_str()),
            "{name}: licence"
        );
    }
}

#[test]
fn consolidation_review_dates() {
    if !rendered() {
        return;
    }
    const MONTHS: [&str; 12] = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
    ];
    for rel in [
        "index.html",
        "about/index.html",
        "contact/index.html",
        "evidence/index.html",
        "privacy/index.html",
        "tools/index.html",
        "tools/ato-benchmarks/index.html",
        "tools/australian-tax-ai-agents/index.html",
        "tools/company-tax-franking/index.html",
        "tools/payday-super/index.html",
        "tools/subcontractor-ledgers/index.html",
        "tools/trust-distributions/index.html",
        "tools/wip-schedule/index.html",
        "tools/workpaper-review-gate/index.html",
        "tools/xero-trial-balance/index.html",
    ] {
        let html = read_text(root(), rel);
        let mut failures = Vec::new();
        let blocks = core::json_ld_blocks(&html, rel, &mut failures);
        assert_clean(rel, &failures);
        let mut modified: Vec<String> = blocks
            .iter()
            .flat_map(core::nodes)
            .filter(|n| {
                !core::has_type(n, "SoftwareApplication")
                    && !core::has_type(n, "SoftwareSourceCode")
            })
            .filter_map(|n| {
                n.get("dateModified")
                    .and_then(Json::as_str)
                    .map(str::to_owned)
            })
            .collect();
        modified.sort();
        modified.dedup();
        assert_eq!(
            modified.len(),
            1,
            "{rel}: inconsistent structured review dates"
        );
        let date = site_tools::py::Date::fromisoformat(&modified[0]).unwrap();
        assert!(
            (date.year, date.month, date.day) >= (2026, 9, 3),
            "{rel}: review predates consolidation"
        );
        let visible = format!(
            "{} {} {}",
            date.day,
            MONTHS[date.month as usize - 1],
            date.year
        );
        assert!(
            core::visible_text(&html).contains(&format!("Last reviewed {visible}.")),
            "{rel}"
        );
        let url = format!(
            "https://duguid.com.au/{}",
            rel.strip_suffix("index.html").unwrap_or(rel)
        );
        assert_eq!(
            core::sitemap_lastmods(&url, root()).unwrap(),
            [date.isoformat()],
            "{rel}"
        );
    }
}

#[test]
fn question_faq_pairs() {
    let html = "<main><details class=\"question\" id=\"q1\"><summary><span class=\"question-number\">1.</span> <h3>When is BAS due?</h3></summary><div class=\"question-answer\"><p><strong>28 October.</strong> Use your account date.</p><ol><li>Step</li></ol></div></details></main>";
    assert_eq!(
        core::visible_faq_pairs(html),
        [(
            "When is BAS due?".to_owned(),
            "28 October. Use your account date.".to_owned()
        )]
    );
}

#[test]
fn question_answers() {
    let rel = "tools/accounting-questions/gst-bas/index.html";
    let checked = "<main><details class=\"question\" id=\"q37\"><summary><h3>When is BAS due?</h3></summary><div class=\"question-answer\"> <p><strong>Quarterly BAS is due on 28 October.</strong> Use your account date.</p><p class=\"question-links\"><a href=\"https://www.ato.gov.au/\">ATO</a></p><p class=\"field-note\">The bold answer was checked on 27 September 2026.</p></div></details></main>";
    let unchecked = changed_text(
        checked,
        "<strong>Quarterly BAS is due on 28 October.</strong> ",
        "",
    );
    let unlinked = changed_text(checked, "href=\"https://www.ato.gov.au/\"", "href=\"\"");
    let question_37 = format!("{rel}: question 37 must open with a checked answer");
    let missing_source = format!("{rel}: question 37 links a source missing from the data");
    let none_found = format!("{rel}: no questions found");
    for (label, html, page, expected) in [
        ("checked answer", checked, rel, None),
        (
            "answer without a checked fact",
            unchecked.as_str(),
            rel,
            Some(question_37.as_str()),
        ),
        (
            "fact source missing from the data",
            unlinked.as_str(),
            rel,
            Some(missing_source.as_str()),
        ),
        (
            "rendered page without questions",
            "<main></main>",
            rel,
            Some(none_found.as_str()),
        ),
        (
            "unrendered source stub",
            "---\nlayout: question-topic\n---\n",
            rel,
            None,
        ),
        (
            "process topic",
            unchecked.as_str(),
            "tools/accounting-questions/cash-flow/index.html",
            None,
        ),
    ] {
        let mut failures = Vec::new();
        contracts::check_question_answers(html, page, &mut failures);
        match expected {
            None => assert_clean(label, &failures),
            Some(expected) => expect_failure(label, &failures, expected),
        }
    }
}

#[test]
fn rendered_checked_tree_command_output() {
    if !rendered() {
        return;
    }
    // check_site.py runs check_seo.py in the checked tree, where every contract holds.
    let output = std::process::Command::new(env!("CARGO_BIN_EXE_site-tools"))
        .arg("check_seo")
        .current_dir(root())
        .env_remove("SITE_ROOT")
        .output()
        .unwrap();
    let stdout = String::from_utf8(output.stdout).unwrap();
    assert_eq!(output.status.code(), Some(0), "{stdout}");
    let eol = if cfg!(windows) { "\r\n" } else { "\n" };
    assert!(
        stdout.starts_with(&format!("checked 404.html{eol}")),
        "{stdout}"
    );
    let listed = core::sitemap_urls(root()).unwrap().len();
    assert!(stdout.ends_with(&format!(
        "checked sitemap.xml ({listed} URLs), llms.txt, robots.txt{eol}{eol}all clear{eol}"
    )));
}
