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
        #[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd, Deserialize, Serialize)]
        #[serde(try_from = "String", into = "String")]
        pub struct $name(String);

        validated_string!($name);
        impl JsonSchema for $name {
            fn schema_name() -> std::borrow::Cow<'static, str> {
                stringify!($name).into()
            }
            fn json_schema(_: &mut schemars::SchemaGenerator) -> schemars::Schema {
                nonempty_string_schema(concat!("Validated Ironloom ", stringify!($name), " value."))
            }
        }

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

macro_rules! validated_string {
    ($name:ident) => {
        impl TryFrom<String> for $name {
            type Error = IronloomError;
            fn try_from(value: String) -> IronloomResult<Self> {
                Self::new(value)
            }
        }
        impl From<$name> for String {
            fn from(value: $name) -> Self {
                value.0
            }
        }
    };
}

validated_string!(BranchName);
validated_string!(RepositorySlug);

typed_id!(ActorId, "actor_id");
typed_id!(ArtifactId, "artifact_id");
typed_id!(CorrelationId, "correlation_id");
typed_id!(RunId, "run_id");
typed_id!(ThreadId, "thread_id");
typed_id!(WorkItemId, "work_item_id");

/// Validated Git branch reference.
#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd, Deserialize, Serialize)]
#[serde(try_from = "String", into = "String")]
pub struct BranchName(String);

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
#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd, Deserialize, Serialize)]
#[serde(try_from = "String", into = "String")]
pub struct RepositorySlug(String);

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

/// Shared validated wire boundary and structured errors.
pub mod validation;
typed_id!(OperatorId, "operator_id");
typed_id!(InstallationId, "installation_id");
typed_id!(ProjectId, "project_id");
typed_id!(AssignmentId, "assignment_id");
typed_id!(WorkerId, "worker_id");
typed_id!(ConversationId, "conversation_id");
typed_id!(CommandId, "command_id");
typed_id!(EventId, "event_id");
typed_id!(PlanId, "plan_id");
typed_id!(InstructionId, "instruction_id");
typed_id!(LessonId, "lesson_id");
typed_id!(AnswerId, "answer_id");
typed_id!(CredentialId, "credential_id");
typed_id!(NodeId, "node_id");
typed_id!(HostId, "host_id");
typed_id!(DeviceId, "device_id");
typed_id!(ReservationId, "reservation_id");
typed_id!(ModelProfileId, "model_profile_id");
typed_id!(ResidentModelId, "resident_model_id");
typed_id!(InferenceId, "inference_id");
typed_id!(ToolCallId, "tool_call_id");
typed_id!(AttemptId, "attempt_id");

typed_id!(TurnId, "turn_id");
typed_id!(ItemId, "item_id");
typed_id!(QuestionId, "question_id");
/// Browser-safe decimal counters and revisions.
pub use validation::Counter;
/// Sendable asynchronous adapter result without a runtime-specific domain dependency.
pub type BoxFuture<'a, T> = std::pin::Pin<Box<dyn std::future::Future<Output = T> + Send + 'a>>;

fn nonempty_string_schema(description: &str) -> schemars::Schema {
    let mut schema = schemars::schema_for!(String);
    schema.insert("minLength".into(), serde_json::json!(1));
    schema.insert("description".into(), serde_json::json!(description));
    schema
}
impl JsonSchema for BranchName {
    fn schema_name() -> std::borrow::Cow<'static, str> {
        "BranchName".into()
    }
    fn json_schema(_: &mut schemars::SchemaGenerator) -> schemars::Schema {
        nonempty_string_schema("Validated Git branch reference.")
    }
}
impl JsonSchema for RepositorySlug {
    fn schema_name() -> std::borrow::Cow<'static, str> {
        "RepositorySlug".into()
    }
    fn json_schema(_: &mut schemars::SchemaGenerator) -> schemars::Schema {
        nonempty_string_schema("Validated `owner/repository` GitHub repository slug.")
    }
}

typed_id!(ServerId, "server_id");
typed_id!(EnvironmentId, "environment_id");
