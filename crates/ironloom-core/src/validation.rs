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
            serde::de::Error::custom(nested_error(
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

fn nested_error(path: &str, message: &str) -> ValidationErrors {
    if let Some(json) = message.strip_prefix("ironloom-validation:") {
        let mut stream = serde_json::Deserializer::from_str(json).into_iter::<ValidationErrors>();
        if let Some(Ok(mut errors)) = stream.next() {
            for error in &mut errors.fields {
                if !path.is_empty() && path != "." {
                    error.field = if error.field == "$" {
                        path.to_owned()
                    } else {
                        format!("{path}.{}", error.field)
                    };
                }
            }
            return errors;
        }
    }
    ValidationErrors::field(
        if path.is_empty() || path == "." {
            "$"
        } else {
            path
        },
        "invalid_structure",
    )
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
