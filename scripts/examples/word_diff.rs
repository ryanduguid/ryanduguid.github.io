//! Generator: the code points where Python's str `\w` and the regex crate's `\w` disagree,
//! as a Rust range table for src/pyunicode.rs (WORD_DIFF).
fn main() {
    let rust = regex::Regex::new(r"^\w$").unwrap();
    let python = regex::Regex::new(&format!("^{}$", *site_tools::py::W)).unwrap();
    let mut ranges: Vec<(u32, u32)> = Vec::new();
    let mut buffer = [0u8; 4];
    for cp in 0..=0x10FFFFu32 {
        let Some(c) = char::from_u32(cp) else {
            continue;
        };
        let text = c.encode_utf8(&mut buffer);
        if rust.is_match(text) != python.is_match(text) {
            match ranges.last_mut() {
                Some(last) if last.1 + 1 == cp => last.1 = cp,
                _ => ranges.push((cp, cp)),
            }
        }
    }
    println!(
        "/// Code points whose `\\w` membership differs between Python `str` patterns and the"
    );
    println!("/// regex crate; text without them can use the regex crate's own `\\b`.");
    println!("pub static WORD_DIFF: &[(u32, u32)] = &[");
    for chunk in ranges.chunks(6) {
        let row: Vec<String> = chunk
            .iter()
            .map(|(a, b)| format!("(0x{a:04X}, 0x{b:04X})"))
            .collect();
        println!("    {},", row.join(", "));
    }
    println!("];");
    eprintln!("{} ranges", ranges.len());
}
