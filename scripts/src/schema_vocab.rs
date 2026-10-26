//! JSON-LD terms checked against the pinned schema.org vocabulary in `scripts/schemaorg/`.
//!
//! Every `@type` must be a schema.org class and every property a schema.org property
//! whose `domainIncludes` covers one of the node's types or their ancestors. A value
//! naming a schema.org term by URL, such as `https://schema.org/InStock`, must name a
//! real one. Pending, superseded and attic terms fail too. The vocabulary is read from
//! the repository and must match its pinned SHA-256; the check never fetches it.
use crate::pyjson::Json;
use crate::seo_core::nodes;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::path::Path;

pub const VOCABULARY_REL: &str = "scripts/schemaorg/schemaorg-all-https.jsonld";
pub const VOCABULARY_RELEASE: &str = "30.1";
pub const VOCABULARY_SHA256: &str =
    "07e7c663dbc12a0937581745e59a98ed12b8698f38e8e3b03650287d9df88ae5";
const PENDING: &str = "is pending in schema.org";

#[derive(Debug)]
enum Kind {
    Type {
        parents: Vec<String>,
    },
    Property {
        domains: Vec<String>,
    },
    /// Enumeration members and other individuals: neither a type nor a property.
    Other,
}

#[derive(Debug)]
struct Term {
    kind: Kind,
    /// Why the term must not be used, as the end of a sentence.
    status: Option<String>,
}

/// The schema.org terms, keyed by their bare names (`Person`, `name`).
#[derive(Debug)]
pub struct Vocabulary {
    terms: HashMap<String, Term>,
}

/// The schema.org names in a JSON-LD `{"@id": ...}` reference or a list of them.
fn schema_ids(value: Option<&Value>) -> Vec<String> {
    let references = match value {
        Some(Value::Array(items)) => items.iter().collect(),
        Some(item) => vec![item],
        None => vec![],
    };
    references
        .into_iter()
        .filter_map(|r| r.get("@id")?.as_str()?.strip_prefix("schema:"))
        .map(str::to_owned)
        .collect()
}

impl Vocabulary {
    /// Read the pinned vocabulary under `root`, refusing a copy that differs from the pin.
    pub fn load(root: &Path) -> Result<Vocabulary, String> {
        let path = root.join(VOCABULARY_REL);
        let raw = std::fs::read(&path).map_err(|e| format!("{VOCABULARY_REL}: {e}"))?;
        let digest = crate::sha256(&raw);
        if digest != VOCABULARY_SHA256 {
            return Err(format!(
                "{VOCABULARY_REL}: SHA-256 is {digest}, not the pinned schema.org {VOCABULARY_RELEASE} \
                 value {VOCABULARY_SHA256}; update the vocabulary as scripts/schemaorg/README.md describes"
            ));
        }
        Vocabulary::parse(&raw).map_err(|e| format!("{VOCABULARY_REL}: {e}"))
    }

    /// Parse a schema.org JSON-LD release file (`schemaorg-all-https.jsonld`).
    pub fn parse(raw: &[u8]) -> Result<Vocabulary, String> {
        let document: Value = serde_json::from_slice(raw).map_err(|e| e.to_string())?;
        let graph = document
            .get("@graph")
            .and_then(Value::as_array)
            .ok_or("no @graph array")?;
        let mut terms = HashMap::new();
        for entry in graph {
            let Some(name) = entry
                .get("@id")
                .and_then(Value::as_str)
                .and_then(|id| id.strip_prefix("schema:"))
            else {
                continue;
            };
            let classes: Vec<&str> = match entry.get("@type") {
                Some(Value::Array(items)) => items.iter().filter_map(Value::as_str).collect(),
                Some(Value::String(class)) => vec![class],
                _ => return Err(format!("schema:{name} has no @type")),
            };
            let kind = if classes.contains(&"rdfs:Class") {
                Kind::Type {
                    parents: schema_ids(entry.get("rdfs:subClassOf")),
                }
            } else if classes.contains(&"rdf:Property") {
                Kind::Property {
                    domains: schema_ids(entry.get("schema:domainIncludes")),
                }
            } else {
                Kind::Other
            };
            let layer = entry
                .get("schema:isPartOf")
                .and_then(|p| p.get("@id"))
                .and_then(Value::as_str);
            let successors = schema_ids(entry.get("schema:supersededBy"));
            let status = if layer == Some("https://attic.schema.org") {
                Some("is retired to the schema.org attic".to_owned())
            } else if !successors.is_empty() {
                Some(format!("is superseded by {}", successors.join(" and ")))
            } else if layer == Some("https://pending.schema.org") {
                Some(PENDING.to_owned())
            } else {
                None
            };
            terms.insert(name.to_owned(), Term { kind, status });
        }
        Ok(Vocabulary { terms })
    }

    /// Accept these reviewed pending terms. A listed term that is not pending is refused,
    /// so the list shrinks when schema.org adopts or renames a term.
    pub fn allow_pending(&mut self, names: &[&str]) -> Result<(), String> {
        for name in names {
            match self.terms.get_mut(*name) {
                Some(term) if term.status.as_deref() == Some(PENDING) => term.status = None,
                _ => {
                    return Err(format!(
                        "{VOCABULARY_REL}: allowed term {name} is not pending in schema.org {VOCABULARY_RELEASE}"
                    ));
                }
            }
        }
        Ok(())
    }

    /// Whether `class` is `ancestor` or one of its subtypes.
    fn is_subtype(&self, class: &str, ancestor: &str) -> bool {
        let mut pending = vec![class];
        let mut seen = HashSet::new();
        while let Some(current) = pending.pop() {
            if current == ancestor {
                return true;
            }
            if !seen.insert(current) {
                continue;
            }
            if let Some(Term {
                kind: Kind::Type { parents },
                ..
            }) = self.terms.get(current)
            {
                pending.extend(parents.iter().map(String::as_str));
            }
        }
        false
    }

    /// Check every node of one JSON-LD block.
    pub fn check_block(&self, block: &Json, rel: &str, failures: &mut Vec<String>) {
        for node in nodes(block) {
            self.check_node(node, rel, failures);
        }
    }

    fn check_node(&self, node: &Json, rel: &str, failures: &mut Vec<String>) {
        let Json::Object(pairs) = node else { return };
        let declared = match node.get("@type") {
            Some(Json::Array(items)) => items.iter().collect(),
            Some(item) => vec![item],
            None => vec![],
        };
        let mut types = Vec::new();
        for value in declared {
            let Some(class) = value.as_str() else {
                failures.push(format!(
                    "{rel}: JSON-LD @type {} is not a string",
                    value.repr()
                ));
                continue;
            };
            match self.terms.get(class) {
                Some(Term {
                    kind: Kind::Type { .. },
                    status,
                }) => {
                    if let Some(status) = status {
                        failures.push(format!("{rel}: JSON-LD type {class} {status}"));
                    }
                    types.push(class);
                }
                _ => failures.push(format!(
                    "{rel}: JSON-LD type {class} is not a schema.org {VOCABULARY_RELEASE} type"
                )),
            }
        }
        let on = if types.is_empty() {
            String::new()
        } else {
            format!(" on {}", types.join(", "))
        };
        for (key, value) in pairs {
            if key != "@context" && key != "@type" {
                self.check_values(key, value, &on, rel, failures);
            }
            if key.starts_with('@') {
                continue;
            }
            let Some(Term {
                kind: Kind::Property { domains },
                status,
            }) = self.terms.get(key)
            else {
                failures.push(format!(
                    "{rel}: JSON-LD property {key}{on} is not a schema.org {VOCABULARY_RELEASE} property"
                ));
                continue;
            };
            if let Some(status) = status {
                failures.push(format!("{rel}: JSON-LD property {key}{on} {status}"));
            }
            // An untyped node, or one whose every type was refused, has no domain to test.
            if !types.is_empty()
                && !domains.is_empty()
                && !types
                    .iter()
                    .any(|t| domains.iter().any(|d| self.is_subtype(t, d)))
            {
                failures.push(format!(
                    "{rel}: JSON-LD property {key}{on} is outside its schema.org domain ({})",
                    domains.join(", ")
                ));
            }
        }
    }

    /// Check string values that name a schema.org term by URL, such as enumeration members.
    fn check_values(
        &self,
        key: &str,
        value: &Json,
        on: &str,
        rel: &str,
        failures: &mut Vec<String>,
    ) {
        let values = match value {
            Json::Array(items) => items.iter().collect(),
            item => vec![item],
        };
        for text in values.into_iter().filter_map(Json::as_str) {
            // Other schema.org URLs, such as documentation pages, are ordinary links.
            let Some(name) = ["https://schema.org/", "http://schema.org/"]
                .iter()
                .find_map(|prefix| text.strip_prefix(prefix))
                .filter(|n| !n.is_empty() && n.chars().all(|c| c.is_ascii_alphanumeric()))
            else {
                continue;
            };
            match self.terms.get(name) {
                None => failures.push(format!(
                    "{rel}: JSON-LD value {text} of {key}{on} is not a schema.org {VOCABULARY_RELEASE} term"
                )),
                Some(Term {
                    status: Some(status),
                    ..
                }) => failures.push(format!("{rel}: JSON-LD value {text} of {key}{on} {status}")),
                Some(_) => {}
            }
        }
    }
}
