//! `csv.DictReader` over a file opened with `encoding="utf-8-sig", newline=""`, as
//! CPython 3.15's _csv reader parses the excel dialect (comma, double quote, doubled
//! quotes, no escape character, not strict).

const FIELD_LIMIT: usize = 131_072;

#[derive(Clone, Copy, PartialEq)]
enum State {
    StartRecord,
    StartField,
    InField,
    InQuotedField,
    QuoteInQuotedField,
    EatCrnl,
}

/// Lines as text-mode reading with `newline=""` yields them: split after `\n`, `\r\n`
/// or a lone `\r`, endings kept.
fn lines(text: &str) -> Vec<&str> {
    let bytes = text.as_bytes();
    let mut out = Vec::new();
    let mut start = 0;
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'\n' => {
                out.push(&text[start..=i]);
                start = i + 1;
            }
            b'\r' => {
                let end = if bytes.get(i + 1) == Some(&b'\n') {
                    i + 2
                } else {
                    i + 1
                };
                out.push(&text[start..end]);
                start = end;
                i = end;
                continue;
            }
            _ => {}
        }
        i += 1;
    }
    if start < text.len() {
        out.push(&text[start..]);
    }
    out
}

struct Reader {
    state: State,
    field: String,
    field_len: usize,
    fields: Vec<String>,
}

impl Reader {
    fn save_field(&mut self) {
        self.fields.push(std::mem::take(&mut self.field));
        self.field_len = 0;
    }

    fn add_char(&mut self, c: char) -> Result<(), String> {
        if self.field_len >= FIELD_LIMIT {
            return Err(format!(
                "_csv.Error: field larger than field limit ({FIELD_LIMIT})"
            ));
        }
        self.field.push(c);
        self.field_len += 1;
        Ok(())
    }

    /// `parse_process_char`; `None` is the end of a line.
    fn process(&mut self, c: Option<char>) -> Result<(), String> {
        let newline = matches!(c, Some('\n' | '\r'));
        match self.state {
            State::StartRecord | State::StartField => {
                if self.state == State::StartRecord {
                    if c.is_none() {
                        return Ok(());
                    }
                    if newline {
                        self.state = State::EatCrnl;
                        return Ok(());
                    }
                }
                match c {
                    None | Some('\n' | '\r') => {
                        self.save_field();
                        self.state = if c.is_none() {
                            State::StartRecord
                        } else {
                            State::EatCrnl
                        };
                    }
                    Some('"') => self.state = State::InQuotedField,
                    Some(',') => {
                        self.save_field();
                        self.state = State::StartField;
                    }
                    Some(other) => {
                        self.add_char(other)?;
                        self.state = State::InField;
                    }
                }
            }
            State::InField => match c {
                None | Some('\n' | '\r') => {
                    self.save_field();
                    self.state = if c.is_none() {
                        State::StartRecord
                    } else {
                        State::EatCrnl
                    };
                }
                Some(',') => {
                    self.save_field();
                    self.state = State::StartField;
                }
                Some(other) => self.add_char(other)?,
            },
            State::InQuotedField => match c {
                None => {}
                Some('"') => self.state = State::QuoteInQuotedField,
                Some(other) => self.add_char(other)?,
            },
            State::QuoteInQuotedField => match c {
                Some('"') => {
                    self.add_char('"')?;
                    self.state = State::InQuotedField;
                }
                Some(',') => {
                    self.save_field();
                    self.state = State::StartField;
                }
                None | Some('\n' | '\r') => {
                    self.save_field();
                    self.state = if c.is_none() {
                        State::StartRecord
                    } else {
                        State::EatCrnl
                    };
                }
                Some(other) => {
                    self.add_char(other)?;
                    self.state = State::InField;
                }
            },
            State::EatCrnl => match c {
                Some('\n' | '\r') => {}
                None => self.state = State::StartRecord,
                Some(_) => {
                    return Err("_csv.Error: new-line character seen in unquoted field - \
                                do you need to open the file with newline=''?"
                        .into());
                }
            },
        }
        Ok(())
    }
}

/// `list(csv.reader(lines))`.
pub fn reader(text: &str) -> Result<Vec<Vec<String>>, String> {
    let mut rows = Vec::new();
    let mut reader = Reader {
        state: State::StartRecord,
        field: String::new(),
        field_len: 0,
        fields: Vec::new(),
    };
    for line in lines(text) {
        for c in line.chars() {
            reader.process(Some(c))?;
        }
        reader.process(None)?;
        if reader.state == State::StartRecord {
            rows.push(std::mem::take(&mut reader.fields));
        }
    }
    // End of input inside a quoted field: the field so far ends the last row.
    if reader.field_len != 0 || reader.state == State::InQuotedField {
        reader.save_field();
        rows.push(reader.fields);
    }
    Ok(rows)
}

/// One `csv.DictReader` row: fields by name (a repeated name keeps its first position and
/// last value); `None` fills names past the end of a short row.
pub type DictRow = Vec<(String, Option<String>)>;

/// `list(csv.DictReader(handle))` for the text of a `utf-8-sig` file.
pub fn dict_reader(text: &str) -> Result<Vec<DictRow>, String> {
    let text = text.strip_prefix('\u{feff}').unwrap_or(text);
    let mut rows = reader(text)?.into_iter();
    let Some(names) = rows.next() else {
        return Ok(Vec::new());
    };
    let mut out = Vec::new();
    for row in rows.filter(|r| !r.is_empty()) {
        let mut dict: DictRow = Vec::new();
        for (i, name) in names.iter().enumerate() {
            let value = row.get(i).cloned();
            match dict.iter_mut().find(|(k, _)| k == name) {
                Some(entry) => entry.1 = value,
                None => dict.push((name.clone(), value)),
            }
        }
        out.push(dict);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_like_csv() {
        let rows =
            reader("a,\"b,\"\"c\"\"\"\r\nx\"y,\"q\"z\n\n\"multi\nline\",end\r\"open").unwrap();
        assert_eq!(
            rows,
            vec![
                vec!["a".to_string(), "b,\"c\"".into()],
                vec!["x\"y".into(), "qz".into()],
                vec![],
                vec!["multi\nline".into(), "end".into()],
                vec!["open".into()],
            ]
        );
        let dicts = dict_reader("\u{feff}k,v,k\n1,2,3\n\n4\n").unwrap();
        assert_eq!(
            dicts,
            vec![
                vec![
                    ("k".to_string(), Some("3".to_string())),
                    ("v".into(), Some("2".into()))
                ],
                vec![("k".to_string(), None), ("v".into(), None)],
            ]
        );
    }
}
