// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

//! Coverage tests for site_contracts, seo_core, rates_register, release_record
//! and agent_skills failure branches.
mod common;

use site_tools::agent_skills;
use site_tools::py::Date;
use site_tools::pyjson::{self, Json};
use site_tools::rates_register;
use site_tools::release_record::{self, Live};
use site_tools::seo_core;
use site_tools::site_contracts as site_contract;

#[test]
fn rates_register_validation_failure_branches() {
    let dir = tempfile::tempdir().unwrap();
    let reg = dir.path().join("rates");
    std::fs::create_dir_all(&reg).unwrap();
    std::fs::create_dir_all(reg.join("series")).unwrap();
    let bad_series = serde_json::json!({
            "series_id": "BAD ID",
            "title": "T",
            "unit": "AUD",
            "rows": [
                "not-an-object",
                {},
                {
                    "row_id": "BAD SLUG",
                    "status": "unknown",
                    "review": "unknown",
                    "value": "not-decimal",
                    "period_start": "2026-07-01",
                    "period_end": "2026-06-30",
                    "primary_source": {
                        "url": "http://insecure.example/x",
                        "title": "Src",
                        "read": "2026-99-99"
                    }
                },
                {
                    "row_id": "ok-slug",
                    "status": "current",
                    "review": "annual",
                    "value": "100.00",
                    "period_start": "2026-07-01",
                    "period_end": null,
                    "primary_source": {
                        "url": "https://user:pass@ato.gov.au/x",
                        "title": "Src",
                        "read": "2026-11-24"
                    }
                },
                {
                    "row_id": "ok-slug-2",
                    "status": "current",
                    "review": "annual",
                    "value": "100.00",
                    "period_start": "2026-07-01",
                    "period_end": null,
                    "primary_source": {
                        "url": "https://ato.gov.au\\bad",
                        "title": "Src",
                        "read": "2026-11-24"
                    }
                },
                {
                    "row_id": "ok-slug-3",
                    "status": "current",
                    "review": "annual",
                    "value": "100.00",
                    "period_start": "2026-07-01",
                    "period_end": null,
                    "primary_source": {
                        "url": "https://example.com/non-primary",
                        "title": "Src",
                        "read": "2026-11-24"
                    }
                }
            ]
    });
    std::fs::write(reg.join("series/bad.json"), bad_series.to_string()).unwrap();
    let bad_register = serde_json::json!({
        "schema_version": 1,
        "register_version": "2026-11-24",
        "advice_status": "Not advice",
        "series": ["series/bad.json"]
    });
    std::fs::write(reg.join("register.json"), bad_register.to_string()).unwrap();
    let failures =
        rates_register::check_register(&reg, Some(Date::new(2026, 11, 24).unwrap())).unwrap();
    assert!(failures.len() >= 8, "{failures:?}");
}

#[test]
fn release_record_network_url_and_type_errors() {
    let mut net = release_record::Network;
    // Triggers request_url_error branches (<...>, URL:, fragment, missing scheme)
    assert!(net.json("  <URL:no-scheme-here#frag>  ").is_err());
    assert!(net.json("/relative/path").is_err());

    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join("scripts")).unwrap();
    std::fs::write(dir.path().join("scripts/release_record.json"), "not json").unwrap();
    assert!(release_record::load(dir.path()).is_err());

    // Wrong JSON shapes trigger item/get_key/text/contains/dict_items error paths
    for bad in [
        "[]",
        "123",
        r#"{"releases":"not-a-dict"}"#,
        r#"{"releases":{"pkg":123}}"#,
        r#"{"releases":{"pkg":{"tag":123}}}"#,
    ] {
        let doc = pyjson::loads(bad).unwrap();
        let _ = release_record::check_record(dir.path(), &doc);
    }
}

#[test]
fn site_contracts_person_authority_and_robots_failures() {
    let bad_person = pyjson::loads(
        r#"{"@type":"Person","name":"Wrong","url":"http://bad","sameAs":["https://linkedin.com/in/x"]}"#,
    )
    .unwrap();
    let pf = site_contract::check_canonical_person(&bad_person);
    assert!(!pf.is_empty());

    let stub_f = site_contract::check_person_stub("a.html", &Json::Object(vec![]), &bad_person);
    assert!(!stub_f.is_empty());

    let llms_f = site_contract::check_llms_authority_surface("# Empty\n");
    assert!(!llms_f.is_empty());

    let mcp_f = site_contract::check_mcp_review_dates("<html><body><p>no date</p></body></html>");
    let _ = mcp_f;

    let robots_f = site_contract::check_robots_policy("User-agent: *\nDisallow: /\n");
    assert!(!robots_f.is_empty());

    let forbidden =
        site_contract::forbidden_identity_url_labels("https://github.com/EquityBot/x").unwrap();
    let _ = forbidden;

    let empty = tempfile::tempdir().unwrap();
    assert!(
        site_contract::check_evidence_page(empty.path()).is_err()
            || !site_contract::check_evidence_page(empty.path())
                .unwrap()
                .is_empty()
    );
    assert!(
        site_contract::check_authority_surface(empty.path()).is_err()
            || !site_contract::check_authority_surface(empty.path())
                .unwrap()
                .is_empty()
    );
    assert!(
        site_contract::check_crawler_classes(empty.path()).is_err()
            || !site_contract::check_crawler_classes(empty.path())
                .unwrap()
                .is_empty()
    );
    assert!(
        site_contract::check_collection_hubs(empty.path()).is_err()
            || !site_contract::check_collection_hubs(empty.path())
                .unwrap()
                .is_empty()
    );
    assert!(
        site_contract::check_task_routes(empty.path()).is_err()
            || !site_contract::check_task_routes(empty.path())
                .unwrap()
                .is_empty()
    );
    let _ = site_contract::check_privacy_delivery_claims(empty.path());
}

#[test]
fn site_contracts_payday_evaluation_and_cards_failures() {
    let payday_f = site_contract::check_payday_receipt_boundary("<main><p>minimal</p></main>");
    assert!(!payday_f.is_empty());

    let empty_rec = pyjson::loads(r#"{"releases":{}}"#).unwrap();
    let pe_f = site_contract::check_payday_example("<main><p>minimal</p></main>", &empty_rec);
    assert!(!pe_f.is_empty());

    let empty = tempfile::tempdir().unwrap();
    assert!(
        site_contract::check_worked_examples(empty.path()).is_err()
            || !site_contract::check_worked_examples(empty.path())
                .unwrap()
                .is_empty()
    );
    assert!(
        site_contract::check_evaluation_packs(empty.path()).is_err()
            || !site_contract::check_evaluation_packs(empty.path())
                .unwrap()
                .is_empty()
    );
    assert!(
        site_contract::check_xero_evaluation_summary(empty.path()).is_err()
            || !site_contract::check_xero_evaluation_summary(empty.path())
                .unwrap()
                .is_empty()
    );
    assert!(
        site_contract::check_social_cards_for(empty.path(), "Heading").is_err()
            || !site_contract::check_social_cards_for(empty.path(), "Heading")
                .unwrap()
                .is_empty()
    );
    let _ = site_contract::check_calculator_dates(empty.path());
}

#[test]
fn seo_core_metadata_faq_and_item_list_failures() {
    let mut failures = Vec::new();
    let bad_html = r#"<!doctype html><html><head>
        <title>X</title>
        <script type="application/ld+json">{not valid json}</script>
    </head><body><main><h1>X</h1></main></body></html>"#;
    let _ = seo_core::json_ld_blocks(bad_html, "bad.html", &mut failures);
    assert!(!failures.is_empty());

    let mut faq_fail = Vec::new();
    let faq_node = pyjson::loads(
        r#"{"@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Unseen Q?","acceptedAnswer":{"@type":"Answer","text":"Unseen A."}}]}"#,
    )
    .unwrap();
    seo_core::check_faq_visible(
        &faq_node,
        "<main><p>Other</p></main>",
        "p.html",
        &mut faq_fail,
    );
    assert!(!faq_fail.is_empty());

    let mut list_fail = Vec::new();
    let bad_list = pyjson::loads(
        r#"{"@type":"ItemList","itemListElement":[{"@type":"ListItem","position":2,"name":"","url":"http://bad"}]}"#,
    )
    .unwrap();
    seo_core::check_item_lists(&bad_list, "p.html", &mut list_fail);
    assert!(!list_fail.is_empty());

    let mut app_fail = Vec::new();
    let bad_app = pyjson::loads(r#"{"@type":"SoftwareApplication","name":""}"#).unwrap();
    seo_core::check_software_apps(&bad_app, "p.html", &mut app_fail);
    assert!(!app_fail.is_empty());

    let mut ds_fail = Vec::new();
    let bad_ds = pyjson::loads(r#"{"@type":"Dataset","name":""}"#).unwrap();
    seo_core::check_datasets(&bad_ds, "p.html", &mut ds_fail);
    assert!(!ds_fail.is_empty());
}

#[test]
fn agent_skills_unhashable_and_duplicate_names() {
    let dir = tempfile::tempdir().unwrap();
    let well_known = dir.path().join(".well-known/agent-skills");
    std::fs::create_dir_all(&well_known).unwrap();
    let commit = "0123456789abcdef0123456789abcdef01234567";
    let dup = serde_json::json!({
        "format": "duguid.com.au/agent-skills-index/1",
        "source": {
            "release": "v0.4.0",
            "commit": commit,
            "install": [
                "git clone https://github.com/ryanduguid/skills.git",
                format!("git checkout {commit}"),
                "npx skills add ./skills"
            ]
        },
        "note": "v0.4.0 is pinned as the latest release under Apache-2.0",
        "skills": [
            {"name": "alpha", "description": "d", "url": "https://bad", "digest": "bad"},
            {"name": "alpha", "description": "", "url": "https://bad", "digest": "bad"}
        ]
    });
    std::fs::write(well_known.join("index.json"), dup.to_string()).unwrap();
    assert_eq!(
        agent_skills::run(dir.path(), &["--check".into()]).unwrap(),
        1
    );

    let unhash = serde_json::json!({
        "format": "duguid.com.au/agent-skills-index/1",
        "source": {"release": "v0.4.0", "commit": commit, "install": []},
        "note": "v0.4.0",
        "skills": [{"name": ["unhashable"]}]
    });
    std::fs::write(well_known.join("index.json"), unhash.to_string()).unwrap();
    assert!(agent_skills::run(dir.path(), &["--check".into()]).is_err());

    let repo = common::repository();
    assert_eq!(agent_skills::run(&repo, &["--check".into()]).unwrap(), 0);
}
