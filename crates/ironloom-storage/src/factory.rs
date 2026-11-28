//! Shared software factory contracts.
use ironloom_core::validation::{ValidationErrors, positive, required};
use ironloom_core::*;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
/// Stored scope; similarity and shared lessons are never approval.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum RecordScope {
    /// Restricted to the origin assignment.
    Assignment,
    /// Available in the origin project.
    Project,
    /// Explicitly shared content; source access is still checked separately.
    Installation,
}
ironloom_core::contract! {
/// Validated factory record.
Lesson, LessonData {
    /// Durable independent record.
    lesson_id: LessonId,
    /// Invalidates worker context at next decision boundary.
    revision: Counter,
    /// Origin retained after cleanup.
    origin_project: ProjectId,
    /// Origin retained after cleanup.
    origin_assignment: AssignmentId,
    /// Opaque provenance reference, no implicit source access.
    source: ActorId,
    /// Per-lesson override beats setup default.
    scope: RecordScope,
    /// Approved lesson content.
    content: String,
} |value| {
    let _ = value;
    positive("revision", value.revision)?;
    required("content", &value.content)
}
}
ironloom_core::contract! {
/// Validated factory record.
RememberedAnswer, RememberedAnswerData {
    /// Stable answer identity.
    answer_id: AnswerId,
    /// Original question.
    question: String,
    /// Original answer, distinct from a derived lesson.
    answer: String,
    /// Answering human.
    operator_id: OperatorId,
    /// Source conversation.
    conversation_id: ConversationId,
    /// Origin project.
    project_id: ProjectId,
    /// Origin assignment if scoped.
    assignment_id: Option<AssignmentId>,
    /// Explicit scope; not inferred from similarity.
    scope: RecordScope,
    /// Answer time.
    answered_at_ms: Counter,
    /// Correction reference preserving earlier records.
    supersedes: Option<AnswerId>,
} |value| {
    let _ = value;
    required("question", &value.question)?;
    required("answer", &value.answer)?;
    if value.scope == RecordScope::Assignment && value.assignment_id.is_none() {
        return Err(ValidationErrors::field(
            "assignment_id",
            "scope_requires_assignment",
        ));
    }
    Ok(())
}
}
ironloom_core::contract! {
/// Validated factory record.
NodeEnrollment, NodeEnrollmentData {
    /// Existing installation, not a new bootstrap.
    installation_id: InstallationId,
    /// Stable service identity.
    node_id: NodeId,
    /// Provisioned physical host identity shared across containers.
    host_id: HostId,
    /// Administrator with EnrollNode permission.
    approved_by: OperatorId,
    /// Node authentication public key; no private key on wire.
    public_key: ActorId,
    /// Infrastructure-controlled wrapped key access reference.
    key_access_ref: CredentialId,
    /// Coordinated installation protocol version.
    protocol_revision: Counter,
} |value| {
    let _ = value;
    positive("protocol_revision", value.protocol_revision)
}
}
ironloom_core::contract! {
/// Validated factory record.
BootstrapState, BootstrapStateData {
    /// Durable installation identity.
    installation_id: InstallationId,
    /// Sole first administrator; never reopened.
    administrator: OperatorId,
    /// Retry OpenFGA grants for this account when false.
    grants_initialized: bool,
} |value| {
    let _ = value;
    Ok(())
}
}

/// PostgreSQL pool selected by runtime; no SQLite or fallback connection path.
pub type FactoryPool = sqlx::PgPool;
const DUPLICATE_SCHEMA_SQLSTATE: &str = "42P06";
const INITIAL_SCHEMA: &str = include_str!("../schema.sql");

/// Fresh-install initialization failure; no database error text or secret material is exposed.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum InitializationError {
    /// The schema already exists. Open the configured installation; never upgrade or replace it here.
    AlreadyInitialized,
    /// The selected database could not complete the operation; never create a fallback database.
    DatabaseUnavailable,
    /// Fresh DDL failed and was rolled back; no conversion or repair is attempted.
    InitializationFailed,
}

/// Creates the factory schema atomically on an explicitly selected fresh database connection.
/// This one-shot initializer has no version tracking, upgrade path, backfill or compatibility logic.
/// An existing schema is rejected without altering its installation identity or records.
pub async fn initialize_schema(
    connection: &mut sqlx::PgConnection,
) -> Result<(), InitializationError> {
    use sqlx::Connection;
    let mut transaction = connection
        .begin()
        .await
        .map_err(|_| InitializationError::DatabaseUnavailable)?;
    match sqlx::raw_sql(INITIAL_SCHEMA)
        .execute(&mut *transaction)
        .await
    {
        Ok(_) => transaction
            .commit()
            .await
            .map_err(|_| InitializationError::DatabaseUnavailable),
        Err(error) => {
            let exists = error
                .as_database_error()
                .is_some_and(|error| error.code().as_deref() == Some(DUPLICATE_SCHEMA_SQLSTATE));
            transaction
                .rollback()
                .await
                .map_err(|_| InitializationError::DatabaseUnavailable)?;
            Err(if exists {
                InitializationError::AlreadyInitialized
            } else {
                InitializationError::InitializationFailed
            })
        }
    }
}
/// Durable execution store; database adapters own transactions and idempotent outbox persistence.
/// Service commands/events use serialized validated payloads at this boundary to avoid
/// reversing the runtime-to-storage dependency. Implementations revalidate on read.
pub trait FactoryStore: Send + Sync {
    /// Atomically fixes administrator, consumes token and creates recoverable grant initialization.
    /// Existing administrator wins every retry; unavailable storage never reopens bootstrap.
    fn redeem_bootstrap(
        &self,
        operator: OperatorId,
        token_hash: ActorId,
    ) -> BoxFuture<'_, Result<BootstrapState, StoreFailure>>;
    /// Registers only an administrator-authorized node in the same installation.
    fn enroll_node(&self, enrollment: NodeEnrollment) -> BoxFuture<'_, Result<(), StoreFailure>>;
    /// Saves a lesson revision and outbox notification in one transaction; local use is immediate.
    fn save_lesson(&self, lesson: Lesson) -> BoxFuture<'_, Result<(), StoreFailure>>;
    /// Atomically commits actor/key/hash, receipt and optional first durable event. Existing keys
    /// return Existing or Conflict without dispatch or a second event. The service dispatches
    /// only from the committed outbox, not from this method's in-memory result.
    fn commit_command(
        &self,
        command: StoredCommand,
    ) -> BoxFuture<'_, Result<CommandClaim, StoreFailure>>;
}
/// Atomically persisted command deduplication result.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum CommandClaim {
    /// First accepted command.
    New,
    /// Same actor/key/hash; return its existing outcome, never redispatch.
    Existing,
    /// Same actor/key with changed hash; refuse.
    Conflict,
}
/// Redacted dependency failure; never include raw SQL or encryption material.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum StoreFailure {
    /// Dependency cannot be reached.
    Unavailable,
    /// Durable state cannot be decoded; never replace it.
    Corrupt,
    /// Encryption key missing or inaccessible; never initialize replacement identity.
    KeyUnavailable,
    /// Optimistic revision or ownership changed.
    Conflict,
}

ironloom_core::contract! {
/// Validated factory record.
StoredCommand, StoredCommandData {
    /// Authenticated actor idempotency scope.
    operator_id: OperatorId,
    /// Client-persisted command identity.
    command_id: CommandId,
    /// Authorized event stream.
    conversation_id: Option<ConversationId>,
    /// Project authority scope; absent for installation commands before any project exists.
    project_id: Option<ProjectId>,
    /// Canonical validated request fingerprint.
    payload_hash: ActorId,
    /// Validated service receipt serialized by composition.
    receipt: serde_json::Value,
    /// Optional validated first event. Empty conversations retain cursor zero and dispatch nothing.
    first_event: Option<serde_json::Value>,
} |value| {
    if !value.receipt.is_object() {
        return Err(ValidationErrors::field("receipt", "object_required"));
    }
    if value.conversation_id.is_some() && value.project_id.is_none() {
        return Err(ValidationErrors::field("project_id", "conversation_requires_project"));
    }
    if let Some(event) = &value.first_event {
        if value.conversation_id.is_none() {
            return Err(ValidationErrors::field("conversation_id", "event_requires_conversation"));
        }
        if !event.is_object() {
            return Err(ValidationErrors::field("first_event", "object_required"));
        }
    }
    Ok(())
}
}
