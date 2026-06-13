#![forbid(unsafe_code)]

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Shared result type for Ironloom domain validation.
pub type IronloomResult<T> = Result<T, IronloomError>;

/// Domain errors that fail closed before side effects.
#[derive(Debug, Error, Eq, PartialEq)]
pub enum IronloomError {
    /// A required domain value was empty after trimming.
    #[error("{field} must not be empty")]
    EmptyDomainValue { field: &'static str },
    /// A domain value used characters or structure that Ironloom refuses.
    #[error("{field} is invalid: {reason}")]
    InvalidDomainValue {
        field: &'static str,
        reason: &'static str,
    },
}

macro_rules! typed_id {
    ($name:ident, $field:literal) => {
        #[doc = concat!("Validated Ironloom ", stringify!($name), " value.")]
        #[derive(
            Clone, Debug, Eq, Hash, JsonSchema, Ord, PartialEq, PartialOrd, Deserialize, Serialize,
        )]
        #[serde(transparent)]
        pub struct $name(#[schemars(length(min = 1))] String);

        impl $name {
            /// Builds a validated typed value.
            pub fn new(value: impl Into<String>) -> IronloomResult<Self> {
                let value = value.into();
                validate_non_empty($field, &value)?;
                Ok(Self(value))
            }

            /// Returns the underlying string value.
            #[must_use]
            pub fn as_str(&self) -> &str {
                &self.0
            }
        }
    };
}

typed_id!(ActorId, "actor_id");
typed_id!(ArtifactId, "artifact_id");
typed_id!(CorrelationId, "correlation_id");
typed_id!(RunId, "run_id");
typed_id!(ThreadId, "thread_id");
typed_id!(WorkItemId, "work_item_id");

/// Validated Git branch reference.
#[derive(
    Clone, Debug, Eq, Hash, JsonSchema, Ord, PartialEq, PartialOrd, Deserialize, Serialize,
)]
#[serde(transparent)]
pub struct BranchName(#[schemars(length(min = 1))] String);

impl BranchName {
    /// Builds a branch name that is safe for local git worktree use.
    pub fn new(value: impl Into<String>) -> IronloomResult<Self> {
        let value = value.into();
        validate_non_empty("branch_name", &value)?;
        if value.contains("..")
            || value.contains("//")
            || value.contains('\\')
            || value.starts_with('/')
            || value.ends_with('/')
            || value.ends_with(".lock")
            || value.chars().any(char::is_whitespace)
        {
            return Err(IronloomError::InvalidDomainValue {
                field: "branch_name",
                reason: "unsafe git branch syntax",
            });
        }
        Ok(Self(value))
    }

    /// Returns the branch name text.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// Validated `owner/repository` GitHub repository slug.
#[derive(
    Clone, Debug, Eq, Hash, JsonSchema, Ord, PartialEq, PartialOrd, Deserialize, Serialize,
)]
#[serde(transparent)]
pub struct RepositorySlug(#[schemars(length(min = 1))] String);

impl RepositorySlug {
    /// Builds a repository slug with exactly one owner and one repository segment.
    pub fn new(value: impl Into<String>) -> IronloomResult<Self> {
        let value = value.into();
        validate_non_empty("repository_slug", &value)?;
        let parts = value.split('/').collect::<Vec<_>>();
        if parts.len() != 2 || parts.iter().any(|part| part.is_empty()) {
            return Err(IronloomError::InvalidDomainValue {
                field: "repository_slug",
                reason: "expected owner/repository",
            });
        }
        if parts.iter().flat_map(|part| part.chars()).any(
            |character| !matches!(character, 'A'..='Z' | 'a'..='z' | '0'..='9' | '_' | '-' | '.'),
        ) {
            return Err(IronloomError::InvalidDomainValue {
                field: "repository_slug",
                reason: "contains unsupported characters",
            });
        }
        Ok(Self(value))
    }

    /// Returns the repository slug text.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

fn validate_non_empty(field: &'static str, value: &str) -> IronloomResult<()> {
    if value.trim().is_empty() {
        Err(IronloomError::EmptyDomainValue { field })
    } else {
        Ok(())
    }
}
