//! Fabricated changelogs to the Atom feed builder: every refusal names the changelog and
//! every built feed is well-formed XML.
#![no_main]

libfuzzer_sys::fuzz_target!(|data: &[u8]| {
    if let Err(problem) = site_tools::feed::fuzz_check(data) {
        panic!("{problem}");
    }
});
