//! Depreciation-rate page addresses that cannot be told apart stop the build.
use site_tools::effective_life::Life;
use site_tools::effective_life_pages::address;
use site_tools::effective_life_pages::load::{Entry, Group, Table};

fn entry(path: &[&str]) -> Entry {
    Entry {
        path: path.iter().map(|text| (*text).to_owned()).collect(),
        life: Some(Life {
            years: "5".into(),
            months: 60,
        }),
        flags: "*".into(),
        last_updated: Some("2008-07-01".into()),
    }
}

fn group(table: Table, heading: &str) -> Group {
    Group {
        table,
        heading: heading.into(),
        parent: "A".into(),
        anzsic: None,
        note: None,
        general: false,
        top: None,
        entries: Vec::new(),
    }
}

#[test]
fn two_rows_with_the_same_path_cannot_share_a_digest_address() {
    let rows = [entry(&["Pumps:", "Pumps"]), entry(&["Pumps:", "Pumps"])];
    let error = address::entry_slugs("farming", &rows).unwrap_err();
    assert!(
        error.starts_with("two rows of farming share the address pumps-"),
        "{error}"
    );
}

#[test]
fn a_group_heading_with_no_words_gives_no_address() {
    assert_eq!(
        address::group_slugs(&[group(Table::A, "(*)")]),
        Err("'(*)' gives an empty address".into())
    );
}

#[test]
fn two_groups_of_a_table_cannot_share_an_address() {
    let groups = [
        group(Table::A, "Bakery product manufacturing"),
        group(Table::B, "Bakery product manufacturing"),
        group(Table::A, "Bakery product manufacturing:"),
    ];
    assert_eq!(
        address::group_slugs(&groups),
        Err(
            "'Bakery product manufacturing' and 'Bakery product manufacturing:' share the address bakery-product-manufacturing"
                .into()
        )
    );
}
