// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

//! Pass 2 coverage tests for site_contracts, seo_core, check_seo and llms_full.
use crate::common;

use site_tools::check_seo;
use site_tools::llms_full;
use site_tools::pyjson;
use site_tools::seo_core;
use site_tools::site_contracts as contracts;
use std::path::Path;

fn s(items: &[&str]) -> Vec<String> {
    items.iter().map(|v| (*v).to_owned()).collect()
}

fn write(root: &Path, rel: &str, text: &str) {
    let path = root.join(rel);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).unwrap();
    }
    std::fs::write(path, text).unwrap();
}

#[test]
fn site_contracts_pages_cover_article_calculator_shell_and_breadcrumb_failures() {
    // check_article_pattern: TOC outside article, empty TOC, external evaluator link contract,
    // missing local targets and zero valid local links.
    let mut f = Vec::new();
    contracts::check_article_pattern(
        "<article><p>a</p></article><nav aria-label=\"On this page\"></nav>",
        "tools/australian-tax-ai-agents/index.html",
        &mut f,
    );
    assert!(f.iter().any(|m| m.contains("inside the article")));
    assert!(f.iter().any(|m| m.contains("at least one local link")));

    let mut f = Vec::new();
    let (ext_rel, (ext_href, ext_label, _ext_prev)) = contracts::ARTICLE_TOC_EXTERNAL_LINKS[0];
    let bad_toc_html = format!(
        "<article><nav aria-label=\"On this page\">\
         <a href=\"{ext_href}\">Wrong Label</a>\
         <a href=\"#missing-id\">Broken</a>\
         </nav><a href=\"{ext_href}\">dup</a></article>"
    );
    contracts::check_article_pattern(&bad_toc_html, ext_rel, &mut f);
    assert!(f.iter().any(|m| m.contains("must appear once across")));
    assert!(f.iter().any(|m| m.contains("must have label")));
    assert!(
        f.iter()
            .any(|m| m.contains("local contents target does not exist"))
    );
    assert!(
        f.iter()
            .any(|m| m.contains("at least one valid local link"))
    );

    let mut f = Vec::new();
    let missing_ext_html = "<article><nav aria-label=\"On this page\"><a href=\"#ok\">Ok</a></nav><h2 id=\"ok\">Ok</h2></article>";
    contracts::check_article_pattern(missing_ext_html, ext_rel, &mut f);
    assert!(f.iter().any(|m| m.contains("external On this page link")));

    let mut f = Vec::new();
    let bad_order_html = format!(
        "<article><nav aria-label=\"On this page\">\
         <a href=\"{ext_href}\">{ext_label}</a>\
         <a href=\"#ok\">Ok</a>\
         </nav><h2 id=\"ok\">Ok</h2></article>"
    );
    contracts::check_article_pattern(&bad_order_html, ext_rel, &mut f);
    assert!(f.iter().any(|m| m.contains("must immediately follow")));

    // check_calculator_contract: submit count, bonus template sub-elements, result region, id contract
    let mut f = Vec::new();
    let bad_calc_html = r#"<!doctype html><html><body>
        <form id="calc-form"></form>
        <button id="export-csv">Wrong</button>
        <template id="bonus-row-template">
            <input class="bonus-amount" type="text" />
            <span data-help-template="bonus-amount-note" id="fixed-id">help</span>
            <select class="bonus-frequency"><option value="bad">Bad</option></select>
            <button class="bonus-remove" type="submit">Remove</button>
        </template>
        <div id="result" role="region"></div>
    </body></html>"#;
    contracts::check_calculator_contract(bad_calc_html, &mut f, "");
    assert!(
        f.iter()
            .any(|m| m.contains("#calc-form must contain exactly one submit"))
    );
    assert!(f.iter().any(|m| m.contains(".bonus-amount")));
    assert!(f.iter().any(|m| m.contains("unique cloned ID")));
    assert!(f.iter().any(|m| m.contains("bonus frequency values")));
    assert!(f.iter().any(|m| m.contains(".bonus-remove")));
    assert!(f.iter().any(|m| m.contains("polite status region")));

    let mut f = Vec::new();
    let no_bonus_input = r#"<template id="bonus-row-template"></template>"#;
    contracts::check_calculator_contract(no_bonus_input, &mut f, "");
    assert!(
        f.iter()
            .any(|m| m.contains("expected exactly one .bonus-amount"))
    );

    // shared shell: primary navigation current states mismatch + repeated href
    let mut f = Vec::new();
    let bad_nav = r#"<html><body>
        <header class="site-header"><nav aria-label="Primary">
            <a href="/" aria-current="page">Home</a>
            <a href="/" aria-current="true">Home2</a>
        </nav></header>
        <main id="main"><h1>Tools</h1></main>
    </body></html>"#;
    contracts::check_shared_shell(bad_nav, "tools/index.html", &mut f);
    assert!(
        f.iter()
            .any(|m| m.contains("primary navigation current states"))
    );

    // collection breadcrumbs: missing H1, mismatched visible names/links, current linked,
    // missing effective-life group page, non-collection page
    let tmp = tempfile::tempdir().unwrap();
    let mut f = Vec::new();
    contracts::check_collection_breadcrumb("<main></main>", "tools/index.html", tmp.path(), &mut f);
    assert!(
        f.iter()
            .any(|m| m.contains("collection breadcrumb needs exactly one H1"))
    );

    let mut f = Vec::new();
    let bad_bc = r#"<html><body>
        <nav aria-label="Breadcrumb"><ol>
            <li><a href="/wrong/">Home</a></li>
            <li><a href="/tools/">Tools</a></li>
        </ol></nav>
        <main><h1>Tools</h1></main>
    </body></html>"#;
    contracts::check_collection_breadcrumb(bad_bc, "tools/index.html", tmp.path(), &mut f);
    assert!(f.iter().any(|m| m.contains("points to")));
    assert!(
        f.iter()
            .any(|m| m.contains("must be unlinked and aria-current=page"))
    );

    let mut f = Vec::new();
    let short_bc = r#"<html><body>
        <nav aria-label="Breadcrumb"><ol><li><a href="/">Home</a></li></ol></nav>
        <main><h1>Laptop</h1></main>
    </body></html>"#;
    contracts::check_collection_breadcrumb(
        short_bc,
        "tools/depreciation-rates/asset/computers/laptops/index.html",
        tmp.path(),
        &mut f,
    );
    assert!(!f.is_empty());

    // Non-collection page returns early cleanly
    let mut f = Vec::new();
    contracts::check_collection_breadcrumb(
        "<main><h1>About</h1></main>",
        "about/index.html",
        tmp.path(),
        &mut f,
    );
    assert!(f.is_empty());
}

#[test]
fn site_contracts_site_covers_person_evidence_examples_evaluations_hubs_cards_and_routes() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path();

    // 1. check_person_graph: SoftwareSourceCode field mismatches and missing Person
    let first_sw = contracts::AUTHORED_SOFTWARE[0].name;
    let home_html = format!(
        r#"<!doctype html><html><head>
        <script type="application/ld+json">{{"@context":"https://schema.org","@graph":[
            {{"@type":"SoftwareSourceCode","name":"{first_sw}","@id":"wrong","author":{{"@id":"wrong"}},"url":"https://bad","codeRepository":"https://bad","license":"https://bad","description":"bad"}}
        ]}}</script>
        </head><body><main><a href="https://ryanduguid.github.io/">old</a><a href="https://www.linkedin.com/in/ryanduguid/">dup</a></main></body></html>"#
    );
    write(root, "index.html", &home_html);
    write(
        root,
        "about/index.html",
        "<html><body><p>no person</p></body></html>",
    );
    let paths = vec![root.join("index.html"), root.join("about/index.html")];
    let pg = contracts::check_person_graph(&paths, root).unwrap();
    assert!(pg.iter().any(|m| m.contains("stable homepage @id")));
    assert!(pg.iter().any(|m| m.contains("not authored by")));
    assert!(pg.iter().any(|m| m.contains("GitHub URL")));
    assert!(pg.iter().any(|m| m.contains("GitHub repository")));
    assert!(pg.iter().any(|m| m.contains("licence URL")));
    assert!(pg.iter().any(|m| m.contains("current description")));

    // check_canonical_identity_urls finds retired host and namesake LinkedIn
    write(root, "README.md", "https://ryanduguid.github.io/x");
    write(root, "llms.txt", "https://linkedin.com/in/ryanduguid");
    let id_fail = contracts::check_canonical_identity_urls(&paths, root).unwrap();
    assert!(id_fail.iter().any(|m| m.contains("retired github.io")));
    assert!(id_fail.iter().any(|m| m.contains("namesake")));

    // 2. check_evidence_page with missing file vs invalid content
    write(root, "sitemap.xml", "<urlset></urlset>");
    let ev_missing = contracts::check_evidence_page(root).unwrap();
    assert!(ev_missing.iter().any(|m| m.contains("does not exist")));

    write(
        root,
        contracts::EVIDENCE_REL,
        r#"<html><head><link rel="canonical" href="https://wrong"><script type="application/ld+json">{"@type":"Person","name":"Local"}</script></head><body><main><p>minimal</p></main></body></html>"#,
    );
    let ev_bad = contracts::check_evidence_page(root).unwrap();
    assert!(ev_bad.iter().any(|m| m.contains("canonical is")));
    assert!(ev_bad.iter().any(|m| m.contains("not authored by")));
    assert!(ev_bad.iter().any(|m| m.contains("local Person node")));
    assert!(
        ev_bad
            .iter()
            .any(|m| m.contains("visible text does not name"))
    );

    // 3. check_worked_examples: missing heading, unpinned /blob/main/, missing labels, bad payday provenance
    for ex in &contracts::WORKED_EXAMPLES {
        write(
            root,
            ex.rel,
            "<html><body><main><h2>Fictional worked example</h2><a href=\"https://github.com/ryanduguid/Ozzit/blob/main/x\">bad</a></main></body></html>",
        );
    }
    write(root, "tools/payday-super/example-provenance.json", "[]");
    let we = contracts::check_worked_examples(root).unwrap();
    assert!(we.iter().any(|m| m.contains("unpinned main URL")));
    assert!(we.iter().any(|m| m.contains("invalid provenance record")));

    // Missing heading branch
    write(
        root,
        contracts::WORKED_EXAMPLES[0].rel,
        "<html><body><main><p>none</p></main></body></html>",
    );
    let we2 = contracts::check_worked_examples(root).unwrap();
    assert!(
        we2.iter()
            .any(|m| m.contains("no visible Fictional worked example heading"))
    );

    // 4. evaluation_article_html and check_evaluation_structure and check_evaluation_packs
    let mut ef = Vec::new();
    assert!(contracts::evaluation_article_html("<p>no main</p>", "e.html", &mut ef).is_none());
    assert!(
        contracts::evaluation_article_html(
            "<main id=\"other\"><article></article></main>",
            "e.html",
            &mut ef
        )
        .is_none()
    );
    assert!(
        contracts::evaluation_article_html("<main id=\"main\"></main>", "e.html", &mut ef)
            .is_none()
    );
    assert!(
        contracts::evaluation_article_html(
            "<main id=\"main\"><article></article></main><article></article>",
            "e.html",
            &mut ef
        )
        .is_none()
    );
    assert!(ef.len() >= 4);

    // Populate evaluation packs with minimal bad articles so all inner checks run
    for pack in &contracts::EVALUATION_PACKS {
        let mut secs = String::new();
        for (id, _) in pack.sections {
            if *id == "versions" || *id == "reproduce" {
                continue;
            }
            secs.push_str(&format!("<section id=\"{id}\"><h2>Wrong</h2></section>"));
        }
        let page = format!(
            r#"<html><head><script type="application/ld+json">{{"@type":"TechArticle","author":{{"@id":"wrong"}}}}</script></head>
            <body><main id="main"><article>
            {secs}
            <section id="versions">
                <a href="{repo}/blob/main/a.py">main</a>
                <a href="{repo}/blob/notacommit/a.py">short</a>
                <a href="{repo}/blob/0000000000000000000000000000000000000000/a.py">wrong</a>
            </section>
            <section id="reproduce"><code>line1</code></section>
            <p>v0.1.0 case study</p>
            </article></main></body></html>"#,
            repo = pack.product_repository
        );
        write(root, pack.rel, &page);
    }
    let ep = contracts::check_evaluation_packs(root).unwrap();
    assert!(ep.iter().any(|m| m.contains("evaluation URL")));
    assert!(ep.iter().any(|m| m.contains("must not name v0.1.0")));
    assert!(ep.iter().any(|m| m.contains("must not use /blob/main/")));
    assert!(ep.iter().any(|m| m.contains("40-character commit")));
    assert!(ep.iter().any(|m| m.contains("commit must be")));
    assert!(ep.iter().any(|m| m.contains("case-study wording")));
    assert!(
        ep.iter()
            .any(|m| m.contains("no visible link to /evidence/"))
    );

    // Also trigger wrong line content in #reproduce (same line count as configured)
    let pack0 = &contracts::EVALUATION_PACKS[0];
    let bad_lines: Vec<&str> = vec!["wrong-line"; pack0.reproduction_recipe.len()];
    let bad_recipe_page = format!(
        "<html><body><main id=\"main\"><article><section id=\"reproduce\"><code>{}</code></section></article></main></body></html>",
        bad_lines.join("\n")
    );
    write(root, pack0.rel, &bad_recipe_page);
    let ep2 = contracts::check_evaluation_packs(root).unwrap();
    assert!(ep2.iter().any(|m| m.contains("#reproduce line 1 must be")));

    // 5. check_collection_hubs: bad H1, bad register entries, missing WebPage/ItemList, mismatched ItemList
    for hub in &contracts::COLLECTION_HUBS {
        write(
            root,
            hub.rel,
            r#"<html><head><script type="application/ld+json">{"@graph":[
                {"@type":"WebPage","author":{"@id":"bad"},"publisher":{"@id":"bad"}},
                {"@type":"ItemList","numberOfItems":0,"itemListElement":[]}
            ]}</script></head><body><h1>Wrong</h1><div class="collection-register">
            <div class="collection-entry"><a class="collection-entry__title" href="/x">X</a></div>
            </div></body></html>"#,
        );
    }
    let ch = contracts::check_collection_hubs(root).unwrap();
    assert!(ch.iter().any(|m| m.contains("collection H1 must be")));
    assert!(ch.iter().any(|m| m.contains("collection entries are")));
    assert!(
        ch.iter()
            .any(|m| m.contains("WebPage author must reference"))
    );
    assert!(
        ch.iter()
            .any(|m| m.contains("ItemList count does not match"))
    );
    assert!(
        ch.iter()
            .any(|m| m.contains("ItemList entries do not match"))
    );

    // Missing register + missing WebPage/ItemList
    write(
        root,
        contracts::COLLECTION_HUBS[0].rel,
        "<html><body><h1>X</h1></body></html>",
    );
    let ch2 = contracts::check_collection_hubs(root).unwrap();
    assert!(
        ch2.iter()
            .any(|m| m.contains("expected one collection register"))
    );
    assert!(
        ch2.iter()
            .any(|m| m.contains("expected exactly one WebPage"))
    );
    assert!(
        ch2.iter()
            .any(|m| m.contains("expected exactly one ItemList"))
    );

    // 6. check_social_cards_for: invalid SVG, wrong dimensions/colours/image/placeholders, invalid JSON, bad PNG, oversized PNG, stale checksum
    write(root, "assets/social-card-template.svg", "<svg not valid");
    write(root, "assets/social-cards.json", "{bad json");
    write(root, "README.md", "");
    let card0 = &contracts::SOCIAL_CARD_CONTEXTS[0];
    write(root, &format!("assets/{}", card0.output), "not-a-png");
    let sc1 = contracts::check_social_cards_for(root, "Wrong Heading").unwrap();
    assert!(sc1.iter().any(|m| m.contains("invalid SVG")));
    assert!(sc1.iter().any(|m| m.contains("invalid JSON")));
    assert!(sc1.iter().any(|m| m.contains("is not PNG")));

    write(
        root,
        "assets/social-card-template.svg",
        r##"<svg width="100" height="100" viewBox="0 0 100 100"><rect fill="#ffffff"/><image href="x"/></svg>"##,
    );
    // Valid PNG header with wrong dimensions (10x10) and > 50_000 bytes
    let mut big_png = vec![0u8; 50_010];
    big_png[..8].copy_from_slice(b"\x89PNG\r\n\x1a\n");
    big_png[16..20].copy_from_slice(&10u32.to_be_bytes());
    big_png[20..24].copy_from_slice(&10u32.to_be_bytes());
    std::fs::write(root.join("assets").join(card0.output), &big_png).unwrap();
    write(
        root,
        "README.md",
        &format!(
            "Every card below shares one provenance record.\n- `assets/{}` sha256:0000\n",
            card0.output
        ),
    );
    let sc2 = contracts::check_social_cards_for(root, contracts::HOMEPAGE_HEADING).unwrap();
    assert!(
        sc2.iter()
            .any(|m| m.contains("template dimensions changed"))
    );
    assert!(sc2.iter().any(|m| m.contains("OLED palette is incomplete")));
    assert!(sc2.iter().any(|m| m.contains("portrait imagery")));
    assert!(
        sc2.iter()
            .any(|m| m.contains("missing renderer placeholders"))
    );
    assert!(sc2.iter().any(|m| m.contains("dimensions changed")));
    assert!(sc2.iter().any(|m| m.contains("under 50,000 bytes")));
    assert!(sc2.iter().any(|m| m.contains("stale checksum")));

    // 7. check_task_routes: non-iterable itemListElement TypeError + mismatched routes
    write(
        root,
        contracts::TASK_ROUTES_REL,
        "<nav class=\"task-routes\"><a href=\"/wrong/\"><strong>Wrong</strong></a></nav>",
    );
    write(
        root,
        "index.html",
        &format!(
            r#"<script type="application/ld+json">{{"@id":"{}/#home-preview","itemListElement":[{{"name":"Wrong","url":"https://bad"}}]}}</script>"#,
            contracts::SITE
        ),
    );
    let tr = contracts::check_task_routes(root).unwrap();
    assert!(tr.iter().any(|m| m.contains("task routes are")));
    assert!(tr.iter().any(|m| m.contains("starting-route ItemList")));

    for bad_val in ["null", "true", "42", "3.14"] {
        write(
            root,
            "index.html",
            &format!(
                r#"<script type="application/ld+json">{{"@id":"{}/#home-preview","itemListElement":{bad_val}}}</script>"#,
                contracts::SITE
            ),
        );
        assert!(contracts::check_task_routes(root).is_err());
    }
    write(
        root,
        "index.html",
        &format!(
            r#"<script type="application/ld+json">{{"@id":"{}/#home-preview","itemListElement":{{}}}}</script>"#,
            contracts::SITE
        ),
    );
    assert!(!contracts::check_task_routes(root).unwrap().is_empty());

    // 8. check_privacy_delivery_claims
    write(
        root,
        "privacy/index.html",
        contracts::PRIVACY_FORBIDDEN_ABSOLUTES[0],
    );
    let pd = contracts::check_privacy_delivery_claims(root).unwrap();
    assert!(pd.iter().any(|m| m.contains("unsupported delivery claim")));
}

#[test]
fn seo_core_check_seo_and_llms_full_cover_remaining_branches() {
    // seo_core: check_datasets (Dataset + DataCatalog with array and single entry)
    let mut f = Vec::new();
    let ds = pyjson::loads(
        r#"{"@graph":[
            {"@type":"Dataset","name":"","description":"too short"},
            {"@type":"DataCatalog","dataset":[{"@id":"https://example.com/#bare"}]},
            {"@type":"DataCatalog","dataset":{"@id":"https://example.com/#single"}}
        ]}"#,
    )
    .unwrap();
    seo_core::check_datasets(&ds, "rates/index.html", &mut f);
    assert!(f.iter().any(|m| m.contains("has no name")));
    assert!(f.iter().any(|m| m.contains("Google asks for 50 to 5,000")));
    assert!(f.iter().any(|m| m.contains("DataCatalog dataset entry 1")));

    // seo_core: check_faq_visible (non-object entity, mismatched question & answer, <details class="question">)
    let mut f = Vec::new();
    let faq = pyjson::loads(
        r#"{"@type":"FAQPage","mainEntity":[
            "not-an-object",
            {"@type":"Question","name":"Q2","acceptedAnswer":{"@type":"Answer","text":"Wrong A"}}
        ]}"#,
    )
    .unwrap();
    let faq_html = r#"<details class="question"><summary><h3>Q1</h3></summary><p>A1</p></details>
        <details class="question"><summary><h3>Q2</h3></summary><p>Right A</p></details>
        <details class="question"><p>no heading</p></details>"#;
    seo_core::check_faq_visible(&faq, faq_html, "faq.html", &mut f);
    assert!(f.iter().any(|m| m.contains("question does not match")));
    assert!(f.iter().any(|m| m.contains("answer does not match")));

    // seo_core: check_item_lists (non-list, non-int count, wrong count, non-int pos, bad order)
    let mut f = Vec::new();
    let lists = pyjson::loads(
        r#"{"@graph":[
            {"@type":"ItemList","itemListElement":"bad"},
            {"@type":"ItemList","numberOfItems":"two","itemListElement":["not-obj"]},
            {"@type":"ItemList","numberOfItems":5,"itemListElement":[{"position":2}]}
        ]}"#,
    )
    .unwrap();
    seo_core::check_item_lists(&lists, "list.html", &mut f);
    assert!(f.iter().any(|m| m.contains("is not a list")));
    assert!(f.iter().any(|m| m.contains("must be an integer")));
    assert!(f.iter().any(|m| m.contains("positions must be integers")));
    assert!(f.iter().any(|m| m.contains("declares 5 items")));
    assert!(f.iter().any(|m| m.contains("positions are")));

    // check_seo::run on a tiny site with warnings + orphan page + failures
    let repo = common::repository();
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path();
    std::fs::create_dir_all(root.join("scripts/schemaorg")).unwrap();
    std::fs::copy(
        repo.join("scripts/schemaorg/schemaorg-all-https.jsonld"),
        root.join("scripts/schemaorg/schemaorg-all-https.jsonld"),
    )
    .unwrap();
    write(
        root,
        "index.html",
        r##"<!doctype html><html><head><title>Short</title></head><body><main><a href="/linked/">L</a><a href="mailto:x@example.com">M</a><a href="#top">T</a></main></body></html>"##,
    );
    write(
        root,
        "linked/index.html",
        "<!doctype html><html><head><title>Linked</title></head><body><main><h1>Linked</h1></main></body></html>",
    );
    write(
        root,
        "orphan/index.html",
        "<!doctype html><html><head><title>Orphan</title></head><body><main><h1>Orphan</h1></main></body></html>",
    );
    write(
        root,
        "about/index.html",
        "<!doctype html><html><head><title>About</title></head><body><main><h1>About</h1></main></body></html>",
    );
    write(
        root,
        contracts::MCP_REL,
        "<!doctype html><html><head><title>MCP</title></head><body><main><h1>MCP</h1></main></body></html>",
    );
    write(
        root,
        contracts::EVIDENCE_REL,
        "<!doctype html><html><head><title>Evidence</title></head><body><main><h1>Evidence</h1></main></body></html>",
    );
    for ex in &contracts::WORKED_EXAMPLES {
        write(
            root,
            ex.rel,
            "<!doctype html><html><head><title>Ex</title></head><body><main><h1>Ex</h1></main></body></html>",
        );
    }
    write(root, contracts::AI_ROBOTS_LIST_REL, "{}");
    write(root, "robots.txt", "User-agent: *\nAllow: /\n");
    write(root, "llms.txt", "# Site\n");
    write(root, "sitemap.xml", "<urlset></urlset>");
    assert_eq!(check_seo::run(root).unwrap(), 1);

    // llms_full: missing PREFORMATTED placeholder, missing <title>, duplicate sitemap URL,
    // section_parts missing title, run --write & --check (stale/missing)
    assert!(
        llms_full::main_text(
            "<main><p>PREFORMATTED-99</p></main>",
            "https://duguid.com.au/"
        )
        .is_err()
    );
    assert!(llms_full::entry("<main><p>no title</p></main>", "https://duguid.com.au/").is_err());
    assert!(
        llms_full::section_parts(&[("https://duguid.com.au/".into(), "no heading".into())])
            .is_err()
    );

    let ltmp = tempfile::tempdir().unwrap();
    let lroot = ltmp.path();
    write(
        lroot,
        "index.html",
        r#"<!doctype html><html><head><title>Home</title><meta name="description" content="Desc"></head><body><main><h1>Home</h1><p>Body</p></main></body></html>"#,
    );
    write(
        lroot,
        "sitemap.xml",
        "<urlset><url><loc>https://duguid.com.au/</loc></url><url><loc>https://duguid.com.au/</loc></url></urlset>",
    );
    write(
        lroot,
        "llms.txt",
        "# Site\n\n> Summary\n\n## Full text by section\n\n- [Old](https://duguid.com.au/old.txt): old\n",
    );
    write(lroot, "llms-full-stale-1.txt", "stale\n");
    assert_eq!(llms_full::run(lroot, &s(&["--check"])).unwrap(), 1);
    assert_eq!(llms_full::run(lroot, &s(&["--write"])).unwrap(), 0);
    assert_eq!(llms_full::run(lroot, &s(&["--check"])).unwrap(), 0);
    // Stale llms-full.txt triggers diff failure
    write(lroot, "llms-full.txt", "stale\n");
    assert_eq!(llms_full::run(lroot, &s(&["--check"])).unwrap(), 1);
    // Gemfile branch error on tiny dir
    write(lroot, "Gemfile", "source 'invalid://'\n");
    assert!(llms_full::build(lroot).is_err());
}

#[test]
fn seo_core_metadata_authority_surface_calculator_dates_and_pages_cover_edges() {
    use site_tools::schema_vocab::Vocabulary;
    use site_tools::seo_core::MetadataContext;
    use std::collections::HashSet;

    let repo = common::repository();
    let mut vocab = Vocabulary::load(&repo).unwrap();
    vocab
        .allow_pending(&contracts::ALLOWED_PENDING_SCHEMA_TERMS)
        .unwrap();

    // seo_core::check_file_metadata across missing/long title, short/warn/tight desc,
    // noindex robots, wrong canonical, missing social context, array JSON-LD bad @context
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path();
    let long_title = "T".repeat(120);
    let warn_desc = "D".repeat(175);
    write(
        root,
        "bad-meta.html",
        &format!(
            r#"<!doctype html><html><head>
            <title>{long_title}</title>
            <meta name="description" content="{warn_desc}">
            <meta name="robots" content="noindex, follow">
            <link rel="stylesheet" href="/assets/site.css">
            <link rel="canonical" href="https://duguid.com.au/wrong/">
            <script type="application/ld+json">[{{"@context":"http://wrong","@type":"WebPage"}}]</script>
            </head><body><h1>One</h1></body></html>"#
        ),
    );
    let mut warnings = Vec::new();
    let ctx = MetadataContext {
        expected_social_image: None,
        expected_social_alt: None,
        description_limits: Some((100, 140)),
    };
    let mf = seo_core::check_file_metadata(
        &root.join("bad-meta.html"),
        contracts::SITE,
        &HashSet::new(),
        &mut warnings,
        &ctx,
        &vocab,
        root,
    )
    .unwrap();
    assert!(!warnings.is_empty());
    assert!(mf.iter().any(|m| m.contains("over the")));
    assert!(mf.iter().any(|m| m.contains("outside required")));
    assert!(mf.iter().any(|m| m.contains("noindex")));
    assert!(mf.iter().any(|m| m.contains("canonical is")));
    assert!(mf.iter().any(|m| m.contains("no configured social-card")));
    assert!(mf.iter().any(|m| m.contains("@context is not")));

    write(
        root,
        "empty-meta.html",
        r#"<html><head><title>   </title><meta name="description" content="tiny"></head><body></body></html>"#,
    );
    let mf2 = seo_core::check_file_metadata(
        &root.join("empty-meta.html"),
        contracts::SITE,
        &HashSet::new(),
        &mut warnings,
        &ctx,
        &vocab,
        root,
    )
    .unwrap();
    assert!(mf2.iter().any(|m| m.contains("non-empty <title>")));
    assert!(mf2.iter().any(|m| m.contains("outside")));

    // site_contracts::check_authority_surface: retired #engage, install commands in llms.txt & other pages
    write(
        root,
        "index.html",
        "<main><section id=\"engage\">old</section><a href=\"/#engage\">old</a></main>",
    );
    write(
        root,
        "llms.txt",
        "claude mcp add aus-accounting -- uvx aus-accounting-mcp\nclaude mcp add aus-accounting -- uvx --from git+https://github.com/ryanduguid/aus-accounting-mcp aus-accounting-mcp\n",
    );
    write(root, contracts::MCP_REL, "<main><p>minimal mcp</p></main>");
    write(
        root,
        contracts::EVIDENCE_REL,
        "<main><p>minimal ev</p></main>",
    );
    write(
        root,
        "other/index.html",
        "<main><p>claude mcp add aus-accounting -- uvx aus-accounting-mcp</p><p>claude mcp add aus-accounting -- uvx --from git+https://github.com/ryanduguid/aus-accounting-mcp aus-accounting-mcp</p></main>",
    );
    let auth_f = contracts::check_authority_surface(root).unwrap();
    assert!(auth_f.iter().any(|m| m.contains("retired Engage route")));
    assert!(
        auth_f
            .iter()
            .any(|m| m.contains("retired GitHub-source install"))
    );
    assert!(
        auth_f
            .iter()
            .any(|m| m.contains("supported install commands must link"))
    );

    // site_contracts::check_calculator_dates: hub listing missing slug, unlisted page, mismatched dates
    write(
        root,
        contracts::CALCULATOR_HUB_REL,
        r#"<html><head><script type="application/ld+json">{"@type":"WebPage","dateModified":"bad-date"}</script></head>
        <body><p class="page-meta">Last checked <time datetime="2026-11-20">1 November 2026</time></p>
        <a href="/tools/business-calculators/ghost/">Ghost</a></body></html>"#,
    );
    write(
        root,
        "tools/business-calculators/unlisted/index.html",
        r#"<html><body><p>no header date or json-ld</p></body></html>"#,
    );
    let cd = contracts::check_calculator_dates(root).unwrap();
    assert!(cd.iter().any(|m| m.contains("not listed")));
    assert!(cd.iter().any(|m| m.contains("which has no page")));
    assert!(cd.iter().any(|m| m.contains("no calculator shows")));
    assert!(cd.iter().any(|m| m.contains("but its datetime is")));
    assert!(
        cd.iter()
            .any(|m| m.contains("expected one WebPage dateModified"))
    );

    // site_contracts::pages: check_id_contract wrong tag/attr/missing present + homepage preview empty h3
    let tree = seo_core::parse_structure(r#"<span id="x">hi</span><input id="y" type="bad">"#);
    let mut pf = Vec::new();
    contracts::check_id_contract(&tree, "x", "input", &[], &mut pf, &[]);
    contracts::check_id_contract(&tree, "y", "input", &[("type", "text")], &mut pf, &["name"]);
    assert!(pf.iter().any(|m| m.contains("#x must be input")));
    assert!(pf.iter().any(|m| m.contains("type must be")));
    assert!(pf.iter().any(|m| m.contains("must have name")));

    let mut hf = Vec::new();
    contracts::check_homepage_contract(
        "<div class=\"home-tool-preview\"><div class=\"home-tool-preview__entry\"><a href=\"/a/\">A</a></div></div>",
        &mut hf,
    );
    assert!(!hf.is_empty());

    // social_metadata_for_page across every route branch
    for rel in [
        "index.html",
        contracts::EVIDENCE_REL,
        "tools/business-calculators/coal-lsl/index.html",
        "tools/individual-tax/income-tax/index.html",
        "tools/depreciation-rates/index.html",
        "tools/accounting-questions/gst/index.html",
        "works-with/xero/index.html",
        "examples/demo/index.html",
        "rates/index.html",
    ] {
        assert!(
            contracts::social_metadata_for_page(rel).0.is_some(),
            "{rel}"
        );
    }
    assert!(
        contracts::social_metadata_for_page("unmapped/page.html")
            .0
            .is_none()
    );
}
