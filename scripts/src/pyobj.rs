//! Python operations on decoded JSON values, as the scripts apply them to files they
//! read: type names in messages, hashability, `len`, iteration, subscripts, and dicts and
//! sets that compare with Python's `==` (so `1 == 1.0 == True`).
use crate::pyjson::Json;

type Result<T> = std::result::Result<T, String>;

pub fn type_name(value: &Json) -> &'static str {
    match value {
        Json::Null => "NoneType",
        Json::Bool(_) => "bool",
        Json::Int(_) => "int",
        Json::Float(_) => "float",
        Json::Str(_) => "str",
        Json::Array(_) => "list",
        Json::Object(_) => "dict",
    }
}

pub fn hashable(value: &Json) -> Result<&Json> {
    match value {
        Json::Array(_) | Json::Object(_) => Err(format!(
            "TypeError: unhashable type: '{}'",
            type_name(value)
        )),
        other => Ok(other),
    }
}

/// `value[key]`.
pub fn subscript(value: &Json, key: &Json) -> Result<Json> {
    let index = |len: usize| -> Result<usize> {
        let i = match key {
            Json::Int(i) => i.clone(),
            Json::Bool(b) => num_bigint::BigInt::from(u8::from(*b)),
            other => {
                return Err(format!(
                    "TypeError: {} indices must be integers{}, not {}",
                    type_name(value),
                    if matches!(value, Json::Array(_)) {
                        " or slices"
                    } else {
                        ""
                    },
                    if matches!(value, Json::Str(_)) {
                        format!("'{}'", type_name(other))
                    } else {
                        type_name(other).to_owned()
                    }
                ));
            }
        };
        let len = num_bigint::BigInt::from(len);
        let i = if i < num_bigint::BigInt::from(0) {
            i + &len
        } else {
            i
        };
        use num_traits::ToPrimitive;
        i.to_usize()
            .filter(|i| num_bigint::BigInt::from(*i) < len)
            .ok_or_else(|| {
                format!(
                    "IndexError: {} index out of range",
                    if matches!(value, Json::Str(_)) {
                        "string"
                    } else {
                        "list"
                    }
                )
            })
    };
    match value {
        Json::Object(pairs) => {
            let key = hashable(key)?;
            pairs
                .iter()
                .find(|(k, _)| Json::Str(k.clone()).py_eq(key))
                .map(|(_, v)| v.clone())
                .ok_or_else(|| format!("KeyError: {}", key.repr()))
        }
        Json::Array(items) => Ok(items[index(items.len())?].clone()),
        Json::Str(s) => {
            let chars: Vec<char> = s.chars().collect();
            Ok(Json::Str(chars[index(chars.len())?].to_string()))
        }
        other => Err(format!(
            "TypeError: '{}' object is not subscriptable",
            type_name(other)
        )),
    }
}

/// `list(value)`.
pub fn iterate(value: &Json) -> Result<Vec<Json>> {
    match value {
        Json::Array(items) => Ok(items.clone()),
        Json::Object(pairs) => Ok(pairs.iter().map(|(k, _)| Json::Str(k.clone())).collect()),
        Json::Str(s) => Ok(s.chars().map(|c| Json::Str(c.to_string())).collect()),
        other => Err(format!(
            "TypeError: '{}' object is not iterable",
            type_name(other)
        )),
    }
}

/// `len(value)`.
pub fn py_len(value: &Json) -> Result<usize> {
    match value {
        Json::Array(items) => Ok(items.len()),
        Json::Object(pairs) => Ok(pairs.len()),
        Json::Str(s) => Ok(s.chars().count()),
        other => Err(format!(
            "TypeError: object of type '{}' has no len()",
            type_name(other)
        )),
    }
}

/// A Python dict built by assignment: a repeated key keeps its first key and position
/// and takes the last value.
#[derive(Default)]
pub struct Dict(Vec<(Json, Json)>);

impl Dict {
    pub fn insert(&mut self, key: Json, value: Json) -> Result<()> {
        hashable(&key)?;
        match self.0.iter_mut().find(|(k, _)| k.py_eq(&key)) {
            Some(entry) => entry.1 = value,
            None => self.0.push((key, value)),
        }
        Ok(())
    }

    pub fn equals(&self, other: &Dict) -> bool {
        self.0.len() == other.0.len()
            && self
                .0
                .iter()
                .all(|(k, v)| other.0.iter().any(|(k2, v2)| k.py_eq(k2) && v.py_eq(v2)))
    }

    pub fn key_set(&self) -> Vec<Json> {
        self.0.iter().map(|(k, _)| k.clone()).collect()
    }
}

/// `set(values)`, refusing unhashable members.
pub fn set(values: Vec<Json>) -> Result<Vec<Json>> {
    let mut out: Vec<Json> = Vec::new();
    for value in values {
        hashable(&value)?;
        if !out.iter().any(|v| v.py_eq(&value)) {
            out.push(value);
        }
    }
    Ok(out)
}

pub fn set_eq(a: &[Json], b: &[Json]) -> bool {
    a.len() == b.len() && a.iter().all(|x| b.iter().any(|y| x.py_eq(y)))
}
