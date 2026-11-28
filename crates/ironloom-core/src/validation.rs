//! Immutable validated wire values. Raw `*Data` values are drafts, never domain inputs.
use schemars::JsonSchema;
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use std::{fmt, ops::Deref};

/// Redacted validation failure at a model field, without submitted values.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct FieldError {
    /// Dot-separated field path, including nested fields.
    pub field: String,
    /// Stable machine-readable reason; never a raw parser error.
    pub code: String,
}
/// Structured errors safe to return to clients.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct ValidationErrors {
    /// Independent field failures.
    pub fields: Vec<FieldError>,
}
impl ValidationErrors {
    /// Creates a single field failure without including user content.
    pub fn field(field: impl Into<String>, code: impl Into<String>) -> Self {
        Self {
            fields: vec![FieldError {
                field: field.into(),
                code: code.into(),
            }],
        }
    }
}
impl fmt::Display for ValidationErrors {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        // Only service-owned paths/codes; never echo a serde parser message.
        write!(
            f,
            "ironloom-validation:{}",
            serde_json::to_string(self).map_err(|_| fmt::Error)?
        )
    }
}
impl std::error::Error for ValidationErrors {}
/// Model-specific nested and cross-field invariants.
pub trait Validate {
    /// Rejects invalid data before domain use.
    fn validate(&self) -> Result<(), ValidationErrors>;
}
/// A validated immutable model; no mutable dereference or unchecked constructor.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(transparent)]
#[schemars(transparent)]
pub struct Validated<T>(T);
impl<T: Validate> Validated<T> {
    /// Enforces exactly the invariants used by deserialization.
    pub fn new(data: T) -> Result<Self, ValidationErrors> {
        data.validate()?;
        Ok(Self(data))
    }
}
impl<T> Deref for Validated<T> {
    type Target = T;
    fn deref(&self) -> &T {
        &self.0
    }
}
impl<'de, T: Deserialize<'de> + Validate> Deserialize<'de> for Validated<T> {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let data = serde_path_to_error::deserialize(deserializer).map_err(|error| {
            serde::de::Error::custom(nested_failure(
                &error.path().to_string(),
                &error.inner().to_string(),
            ))
        })?;
        Self::new(data).map_err(serde::de::Error::custom)
    }
}
/// Shared wire decode entrypoint. Implemented by validated model aliases.
pub trait Wire: Sized {
    /// Decodes, validates recursively, and redacts structural errors.
    fn decode(bytes: &[u8]) -> Result<Self, ValidationErrors>;
}
impl<T: DeserializeOwned + Validate> Wire for Validated<T> {
    fn decode(bytes: &[u8]) -> Result<Self, ValidationErrors> {
        let mut deserializer = serde_json::Deserializer::from_slice(bytes);
        let data: T = serde_path_to_error::deserialize(&mut deserializer)
            .map_err(|error| nested_error(&error.path().to_string(), &error.inner().to_string()))?;
        deserializer
            .end()
            .map_err(|_| ValidationErrors::field("$", "trailing_data"))?;
        Self::new(data)
    }
}
/// Decodes through the shared validation contract, independently on each boundary.
pub fn decode<T: Wire>(bytes: &[u8]) -> Result<T, ValidationErrors> {
    T::decode(bytes)
}
/// Requires positive counters and revisions.
pub fn positive(field: &str, value: impl Into<u64>) -> Result<(), ValidationErrors> {
    if value.into() == 0 {
        Err(ValidationErrors::field(field, "must_be_positive"))
    } else {
        Ok(())
    }
}
/// Requires nonblank text without returning its submitted contents.
pub fn required(field: &str, value: &str) -> Result<(), ValidationErrors> {
    if value.trim().is_empty() {
        Err(ValidationErrors::field(field, "required"))
    } else {
        Ok(())
    }
}
/// Declares a draft and immutable validated public wire model with one invariant implementation.
#[macro_export]
macro_rules! contract {
    ($(#[$meta:meta])* $name:ident, $data:ident { $($(#[$fm:meta])* $field:ident: $ty:ty),* $(,)? } |$this:ident| $body:block) => {
        $(#[$meta])*
        pub type $name = $crate::validation::Validated<$data>;
        #[doc = concat!("Unchecked construction draft for `", stringify!($name), "`; validate before use.")]
        #[derive(Clone, Debug, Eq, PartialEq, serde::Serialize, serde::Deserialize, schemars::JsonSchema)]
        #[serde(deny_unknown_fields)]
        pub struct $data { $($(#[$fm])* pub $field: $ty),* }
        impl $crate::validation::Validate for $data {
            fn validate(&self) -> Result<(), $crate::validation::ValidationErrors> { let $this = self; $body }
        }
    }
}

// Internal serde error transport records the path already applied by an inner validated
// wrapper. Outer serde_path_to_error trackers also observe that traversal; do not apply it twice.
#[derive(Serialize, Deserialize)]
struct DecodeFailure {
    error: ValidationErrors,
    traversed: String,
}
impl fmt::Display for DecodeFailure {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "ironloom-nested-validation:{}",
            serde_json::to_string(self).map_err(|_| fmt::Error)?
        )
    }
}
fn nested_error(path: &str, message: &str) -> ValidationErrors {
    nested_failure(path, message).error
}
fn nested_failure(path: &str, message: &str) -> DecodeFailure {
    let canonical_path = path.replace('[', ".").replace(']', "");
    let path = canonical_path.trim_matches('.');
    let nested = message
        .strip_prefix("ironloom-nested-validation:")
        .and_then(|json| {
            serde_json::Deserializer::from_str(json)
                .into_iter::<DecodeFailure>()
                .next()?
                .ok()
        });
    let raw = message
        .strip_prefix("ironloom-validation:")
        .and_then(|json| {
            serde_json::Deserializer::from_str(json)
                .into_iter::<ValidationErrors>()
                .next()?
                .ok()
        });
    let (mut errors, applied) = if let Some(nested) = nested {
        (nested.error, nested.traversed)
    } else if let Some(raw) = raw {
        (raw, String::new())
    } else {
        return DecodeFailure {
            error: ValidationErrors::field(
                if path.is_empty() { "$" } else { path },
                "invalid_structure",
            ),
            traversed: path.to_owned(),
        };
    };
    let prefix = if applied.is_empty() {
        path
    } else if path == applied {
        ""
    } else {
        path.strip_suffix(&format!(".{applied}")).unwrap_or(path)
    };
    for error in &mut errors.fields {
        if !prefix.is_empty() {
            error.field = if error.field == "$" {
                prefix.to_owned()
            } else {
                format!("{prefix}.{}", error.field)
            };
        }
    }
    DecodeFailure {
        error: errors,
        traversed: path.to_owned(),
    }
}

#[cfg(test)]
mod nested_tests {
    use super::*;
    crate::contract! { Leaf, LeafData { text: String } |value| { required("text", &value.text) } }
    crate::contract! { Branch, BranchData { children: Vec<Leaf> } |value| { let _=value; Ok(()) } }
    crate::contract! { Root, RootData { children: Vec<Branch> } |value| { let _=value; Ok(()) } }
    #[test]
    fn repeated_nested_names_and_structural_errors_have_one_exact_path() {
        let expected = ValidationErrors::field("children.0.children.0.text", "required");
        let value = serde_json::json!({"children":[{"children":[{"text":" "}]}]});
        assert_eq!(
            decode::<Root>(&serde_json::to_vec(&value).unwrap()).unwrap_err(),
            expected
        );
        let error = serde_json::from_value::<Root>(value)
            .unwrap_err()
            .to_string();
        assert!(error.contains("children.0.children.0.text"));
        assert!(!error.contains("children.0.children.0.children"));
        assert_eq!(
            decode::<Root>(br#"{"children":[{"children":[{"text":17}]}]}"#).unwrap_err(),
            ValidationErrors::field("children.0.children.0.text", "invalid_structure")
        );
        assert!(Leaf::new(LeafData { text: " ".into() }).is_err());
        assert!(Branch::new(BranchData { children: vec![] }).is_ok());
        assert!(Root::new(RootData { children: vec![] }).is_ok());
    }
}
/// Canonical unsigned decimal string. JSON numbers are refused to prevent web precision loss.
#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd, Serialize, Deserialize)]
#[serde(try_from = "String", into = "String")]
pub struct Counter(u64);

const COUNTER_PATTERN: &str = r"^(0|[1-9][0-9]{0,19})$";
impl Counter {
    /// Constructs a counter without a floating point conversion.
    pub const fn new(value: u64) -> Self {
        Self(value)
    }
    /// Returns the exact server-side integer.
    pub const fn get(self) -> u64 {
        self.0
    }
}
impl From<Counter> for u64 {
    fn from(value: Counter) -> Self {
        value.0
    }
}
impl From<Counter> for String {
    fn from(value: Counter) -> Self {
        value.0.to_string()
    }
}
impl TryFrom<String> for Counter {
    type Error = ValidationErrors;
    fn try_from(value: String) -> Result<Self, Self::Error> {
        let number = value
            .parse::<u64>()
            .map_err(|_| ValidationErrors::field("$", "invalid_counter"))?;
        if number.to_string() != value {
            return Err(ValidationErrors::field("$", "noncanonical_counter"));
        }
        Ok(Self(number))
    }
}
impl PartialEq<u64> for Counter {
    fn eq(&self, other: &u64) -> bool {
        self.0 == *other
    }
}

impl JsonSchema for Counter {
    fn schema_name() -> std::borrow::Cow<'static, str> {
        "Counter".into()
    }
    fn json_schema(_: &mut schemars::SchemaGenerator) -> schemars::Schema {
        let mut schema = schemars::schema_for!(String);
        schema.insert("pattern".into(), serde_json::json!(COUNTER_PATTERN));
        schema.insert(
            "description".into(),
            serde_json::json!(
                "Canonical decimal u64; semantic validation also enforces u64 maximum."
            ),
        );
        schema
    }
}
