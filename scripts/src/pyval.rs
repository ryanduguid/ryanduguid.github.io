//! Python values the checks quote with `repr`: tuples, lists and dicts of strings,
//! integers, booleans, `None` and decoded JSON.
use crate::py;
use crate::pyjson::Json;

#[derive(Clone, Debug, PartialEq)]
pub enum Val {
    None,
    Bool(bool),
    Int(i64),
    Str(String),
    Tuple(Vec<Val>),
    List(Vec<Val>),
    Dict(Vec<(Val, Val)>),
    Json(Json),
}

impl Val {
    pub fn repr(&self) -> String {
        let join = |items: &[Val]| items.iter().map(Val::repr).collect::<Vec<_>>().join(", ");
        match self {
            Val::None => "None".into(),
            Val::Bool(true) => "True".into(),
            Val::Bool(false) => "False".into(),
            Val::Int(i) => i.to_string(),
            Val::Str(s) => py::repr_str(s),
            Val::Tuple(items) if items.len() == 1 => format!("({},)", items[0].repr()),
            Val::Tuple(items) => format!("({})", join(items)),
            Val::List(items) => format!("[{}]", join(items)),
            Val::Dict(pairs) => format!(
                "{{{}}}",
                pairs
                    .iter()
                    .map(|(k, v)| format!("{}: {}", k.repr(), v.repr()))
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
            Val::Json(value) => value.repr(),
        }
    }

    /// `str(value)`.
    pub fn str(&self) -> String {
        match self {
            Val::Str(s) => s.clone(),
            other => other.repr(),
        }
    }

    pub fn list<T: Into<Val>>(items: impl IntoIterator<Item = T>) -> Val {
        Val::List(items.into_iter().map(Into::into).collect())
    }
}

impl From<&str> for Val {
    fn from(s: &str) -> Val {
        Val::Str(s.to_owned())
    }
}

impl From<String> for Val {
    fn from(s: String) -> Val {
        Val::Str(s)
    }
}

impl From<&String> for Val {
    fn from(s: &String) -> Val {
        Val::Str(s.clone())
    }
}

impl<T: Into<Val>> From<Option<T>> for Val {
    fn from(value: Option<T>) -> Val {
        value.map_or(Val::None, Into::into)
    }
}

impl From<bool> for Val {
    fn from(b: bool) -> Val {
        Val::Bool(b)
    }
}

impl From<usize> for Val {
    fn from(i: usize) -> Val {
        Val::Int(i as i64)
    }
}

impl From<i64> for Val {
    fn from(i: i64) -> Val {
        Val::Int(i)
    }
}

impl<A: Into<Val>, B: Into<Val>> From<(A, B)> for Val {
    fn from((a, b): (A, B)) -> Val {
        Val::Tuple(vec![a.into(), b.into()])
    }
}

impl<A: Into<Val>, B: Into<Val>, C: Into<Val>> From<(A, B, C)> for Val {
    fn from((a, b, c): (A, B, C)) -> Val {
        Val::Tuple(vec![a.into(), b.into(), c.into()])
    }
}

/// `repr` of a list built from Rust values.
pub fn repr_list<T: Into<Val>>(items: impl IntoIterator<Item = T>) -> String {
    Val::list(items).repr()
}

/// `list((Counter(a) - Counter(b)).elements())`: first-seen order, repeated by count.
pub fn counter_sub(a: &[String], b: &[String]) -> Vec<String> {
    let mut keys: Vec<&String> = Vec::new();
    for item in a {
        if !keys.contains(&item) {
            keys.push(item);
        }
    }
    let mut out = Vec::new();
    for key in keys {
        let surplus = a.iter().filter(|x| *x == key).count() as i64
            - b.iter().filter(|x| *x == key).count() as i64;
        for _ in 0..surplus.max(0) {
            out.push(key.clone());
        }
    }
    out
}

/// `str.find(sub)` as a code-point index, or -1.
pub fn find(text: &str, sub: &str) -> i64 {
    text.find(sub)
        .map_or(-1, |i| text[..i].chars().count() as i64)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reprs_follow_python() {
        assert_eq!(Val::from(("a", None::<&str>)).repr(), "('a', None)");
        assert_eq!(Val::Tuple(vec!["x".into()]).repr(), "('x',)");
        assert_eq!(repr_list([("/a", "It's")]), "[('/a', \"It's\")]");
        assert_eq!(
            Val::Dict(vec![(Val::None, "page".into())]).repr(),
            "{None: 'page'}"
        );
    }

    #[test]
    fn counter_difference_keeps_first_seen_order() {
        let a: Vec<String> = ["b", "a", "b", "c"].map(String::from).to_vec();
        let b: Vec<String> = ["b", "c", "c"].map(String::from).to_vec();
        assert_eq!(counter_sub(&a, &b), ["b", "a"]);
        assert_eq!(find("é<x", "<"), 1);
    }
}
