//! URLs that Python's `urlsplit` refuses stop the register and rate table checks with
//! its error, as the Python checker raised `ValueError`.
mod common;
use site_tools::py::Date;
use site_tools::rates_register::{check_register, check_tables};
use std::path::Path;

const UNSPLITTABLE: &str = "https://[::1/text";

#[test]
fn a_basis_url_python_cannot_split_stops_the_register_check() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("register");
    common::copy_tree(
        &Path::new(env!("CARGO_MANIFEST_DIR")).join("../rates/register"),
        &root,
    );
    let series = root.join("series/coal-lsl-levy.json");
    let text = std::fs::read_to_string(&series).unwrap();
    let basis = text.find("\"basis\"").unwrap();
    let (head, tail) = text.split_at(basis);
    let tail = tail.replacen(
        "https://www.legislation.gov.au/F2018L00217/latest/text",
        UNSPLITTABLE,
        1,
    );
    std::fs::write(&series, format!("{head}{tail}")).unwrap();
    assert_eq!(
        check_register(&root, None),
        Err("ValueError: Invalid IPv6 URL".into())
    );
}

#[test]
fn a_table_source_url_python_cannot_split_stops_the_table_check() {
    let rates = tempfile::tempdir().unwrap();
    std::fs::create_dir(rates.path().join("car-limit")).unwrap();
    std::fs::write(
        rates.path().join("car-limit/car-limit.csv"),
        format!(
            "income_year,car_limit,source_url,checked_at\n2026-27,69883,{UNSPLITTABLE},2026-11-03\n"
        ),
    )
    .unwrap();
    let today = Date::fromisoformat("2026-11-03").unwrap();
    assert_eq!(
        check_tables(rates.path(), today),
        Err("ValueError: Invalid IPv6 URL".into())
    );
}
