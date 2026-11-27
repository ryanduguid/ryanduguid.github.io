//! A checkout whose sources cannot be read, and a vocabulary term with no type.
use site_tools::schema_vocab::Vocabulary;
use site_tools::source_identity;

#[test]
fn a_checkout_without_sources_is_reported_unreadable() {
    let root = tempfile::tempdir().unwrap();
    let scripts = root.path().join("scripts");
    std::fs::create_dir(&scripts).unwrap();
    std::fs::write(scripts.join("Cargo.toml"), "[package]\n").unwrap();
    let warning = source_identity::check(root.path(), "0123456789abcdef", false)
        .unwrap()
        .unwrap();
    assert!(
        warning.starts_with(
            "site-tools: warning: this site-tools was built from scripts/ sources 0123456789abcdef, but "
        ) && warning.contains(" holds unreadable sources ("),
        "{warning}"
    );
    let refusal = source_identity::check(root.path(), "0123456789abcdef", true).unwrap_err();
    assert!(
        refusal.starts_with("site-tools: refusing to write: "),
        "{refusal}"
    );
}

#[test]
fn a_term_without_a_type_is_refused() {
    let raw = br#"{"@graph": [{"@id": "schema:price"}]}"#;
    assert_eq!(
        Vocabulary::parse(raw).err(),
        Some("schema:price has no @type".into())
    );
}
