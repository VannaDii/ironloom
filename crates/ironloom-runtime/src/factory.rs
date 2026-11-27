//! Shared software factory contracts.
use ironloom_core::validation::{ValidationErrors, positive, required};
use ironloom_core::*;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
ironloom_core::contract! {
/// Validated factory record.
ApprovalCommand, ApprovalCommandData {
    /// Approval tied to exact revision and content.
    plan: ironloom_process_graph::factory::PlanApproval,
} |value| {
    let _ = value;
    Ok(())
}
}
/// Assignment controls shared by web and native.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ControlAction {
    /// Pause at next controllable boundary.
    Pause,
    /// Recheck current authority before dispatch.
    Resume,
    /// Persist cancellation request, never assume stopped.
    Cancel,
}
ironloom_core::contract! {
/// Validated factory record.
InputCommand, InputCommandData {
    /// Authorized target conversation.
    conversation_id: ConversationId,
    /// Human chat input.
    text: String,
} |value| {
    let _ = value;
    required("text", &value.text)
}
}
ironloom_core::contract! {
/// Validated factory record.
ControlCommand, ControlCommandData {
    /// Assignment to control.
    assignment_id: AssignmentId,
    /// Requested boundary action.
    action: ControlAction,
} |value| {
    let _ = value;
    Ok(())
}
}
/// Command payload shared by web/native. Every payload is validated before construction.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(
    tag = "type",
    content = "data",
    rename_all = "snake_case",
    deny_unknown_fields
)]
pub enum CommandAction {
    /// Submit human chat input.
    Input(InputCommand),
    /// Steer only expected active turn.
    Steer(SteeringInput),
    /// Resolve pending item-bound request.
    Answer(QuestionAnswer),
    /// Approve exact plan/scope revision.
    Approve(ApprovalCommand),
    /// Pause/resume/cancel assignment.
    Control(ControlCommand),
    /// Edit budget independently of plan revision.
    Budget(ironloom_observability::factory::Budget),
}
impl<'de> Deserialize<'de> for CommandAction {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        #[derive(Deserialize)]
        #[serde(deny_unknown_fields)]
        struct Envelope {
            #[serde(rename = "type")]
            kind: String,
            data: serde_json::Value,
        }
        let envelope = Envelope::deserialize(deserializer)?;
        fn payload<T: ironloom_core::validation::Wire, E: serde::de::Error>(
            data: &serde_json::Value,
        ) -> Result<T, E> {
            let bytes =
                serde_json::to_vec(data).map_err(|_| E::custom("invalid command structure"))?;
            ironloom_core::validation::decode(&bytes).map_err(|mut errors| {
                for error in &mut errors.fields {
                    error.field = if error.field == "$" {
                        "data".into()
                    } else {
                        format!("data.{}", error.field)
                    };
                }
                E::custom(errors)
            })
        }
        match envelope.kind.as_str() {
            "input" => payload(&envelope.data).map(Self::Input),
            "steer" => payload(&envelope.data).map(Self::Steer),
            "answer" => payload(&envelope.data).map(Self::Answer),
            "approve" => payload(&envelope.data).map(Self::Approve),
            "control" => payload(&envelope.data).map(Self::Control),
            "budget" => payload(&envelope.data).map(Self::Budget),
            _ => Err(serde::de::Error::custom(ValidationErrors::field(
                "type",
                "invalid_structure",
            ))),
        }
    }
}
ironloom_core::contract! {
/// Validated factory record.
Command, CommandData {
    /// Persisted idempotency key scoped to authenticated operator.
    command_id: CommandId,
    /// Explicit project authority boundary.
    project_id: ProjectId,
    /// Optimistic concurrency revision.
    expected_revision: Counter,
    /// Validated service operation.
    action: CommandAction,
} |value| {
    let _ = value;
    positive("expected_revision", value.expected_revision)?;
    Ok(())
}
}
ironloom_core::contract! {
/// Validated factory record.
ReplayCursor, ReplayCursorData {
    /// Stream scope; cursor cannot grant access.
    conversation_id: ConversationId,
    /// Persisted monotonically increasing sequence; zero requests from start.
    sequence: Counter,
} |value| {
    let _ = value;
    Ok(())
}
}
ironloom_core::contract! {
/// Validated factory record.
ServiceEvent, ServiceEventData {
    /// Durable SSE id and native reconnect position.
    cursor: ReplayCursor,
    /// Origin command identity.
    command_id: CommandId,
    /// Authorization scope.
    project_id: ProjectId,
    /// Normalized streamed output.
    event: ironloom_workers::factory::WorkerEvent,
} |value| {
    let _ = value;
    positive("cursor.sequence", value.cursor.sequence)
}
}
/// Durable duplicate handling contract.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum CommandDisposition {
    /// New command and initial event committed atomically.
    Accepted,
    /// Same actor/key/payload returns existing receipt without dispatch.
    Replayed,
    /// Same key with changed payload or revision mismatch; no dispatch.
    Conflict,
}
ironloom_core::contract! {
/// Validated factory record.
CommandReceipt, CommandReceiptData {
    /// Original command ID.
    command_id: CommandId,
    /// Duplicate/conflict result.
    disposition: CommandDisposition,
    /// First committed event or current replay position.
    cursor: ReplayCursor,
} |value| {
    let _ = value;
    Ok(())
}
}
/// Service login separate from inference credentials.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum LoginMethod {
    /// Password-backed local account authentication.
    Local,
    /// Validated external issuer/subject; never automatic administrator.
    Oidc,
}
ironloom_core::contract! {
/// Validated factory record.
AuthenticatedSession, AuthenticatedSessionData {
    /// Server-resolved human identity.
    operator_id: OperatorId,
    /// Opaque server-managed session; not a provider token.
    session_id: ActorId,
    /// Service authentication method.
    method: LoginMethod,
    /// Session expiry.
    expires_at_ms: Counter,
} |value| {
    let _ = value;
    positive("expires_at_ms", value.expires_at_ms)
}
}
/// Stable HTTP command path relative to the deployment base.
pub const COMMANDS_PATH: &str = "/api/v1/commands";
/// Replayable SSE path; `Last-Event-ID` carries the scoped cursor.
pub const EVENTS_PATH: &str = "/api/v1/events";
/// Public wire revision shared by all enrolled nodes.
pub const API_REVISION: u64 = 1;
/// Fail-closed authentication outcome.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum AuthenticationError {
    /// No valid session.
    Unauthenticated,
    /// Identity lacks current authority.
    Forbidden,
    /// Bootstrap already has its sole administrator.
    BootstrapConsumed,
    /// Invalid local or OIDC proof; no secret details.
    InvalidCredentials,
    /// Storage or authentication unavailable; do not reset identity.
    Unavailable,
}
ironloom_core::contract! {
/// Validated factory record.
LoginRequest, LoginRequestData {
    /// Local account identity.
    username: ActorId,
    /// Only accepted by local authentication; never logged.
    password: SecretInput,
} |value| {
    let _ = value;
    Ok(())
}
}
ironloom_core::contract! {
/// Validated factory record.
OidcStart, OidcStartData {
    /// Configured issuer/client connection, not arbitrary URL.
    connection: ActorId,
    /// Server allowlisted callback identifier.
    redirect_id: ActorId,
} |value| {
    let _ = value;
    Ok(())
}
}
ironloom_core::contract! {
/// Validated factory record.
OidcCallback, OidcCallbackData {
    /// One-time CSRF and connection-bound state.
    state: SecretInput,
    /// Single-use issuer authorization code.
    code: SecretInput,
} |value| {
    let _ = value;
    Ok(())
}
}
ironloom_core::contract! {
/// Validated factory record.
BootstrapRedeem, BootstrapRedeemData {
    /// One-time initial token; authenticated account comes from session.
    token: SecretInput,
} |value| {
    let _ = value;
    Ok(())
}
}
ironloom_core::contract! {
/// Validated factory record.
SteeringInput, SteeringInputData {
    /// Authorized conversation.
    conversation_id: ConversationId,
    /// Reject stale input after another turn starts.
    expected_turn_id: TurnId,
    /// Human steering.
    text: String,
} |value| {
    let _ = value;
    required("text", &value.text)
}
}
ironloom_core::contract! {
/// Validated factory record.
QuestionAnswer, QuestionAnswerData {
    /// Pending request identity.
    question_id: QuestionId,
    /// Expected active turn.
    turn_id: TurnId,
    /// Originating question or approval item.
    item_id: ItemId,
    /// One of the persisted allowed choices.
    choice: ActorId,
    /// Reject stale/replaced/resolved requests.
    expected_revision: Counter,
} |value| {
    let _ = value;
    positive("expected_revision", value.expected_revision)
}
}
ironloom_core::contract! {
/// Validated factory record.
SessionQuery, SessionQueryData {
    /// Exclusive stable pagination cursor.
    after: Option<ConversationId>,
    /// Bounded page size.
    limit: Counter,
    /// Explicit archive state.
    archived: bool,
    /// Provider filter.
    provider: Option<ActorId>,
    /// Source filter.
    source: Option<ActorId>,
} |value| {
    let _ = value;
    positive("limit", value.limit)?;
    if value.limit.get() > MAX_SESSION_PAGE {
        return Err(ValidationErrors::field("limit", "page_too_large"));
    }
    Ok(())
}
}
ironloom_core::contract! {
/// Validated factory record.
SessionSummary, SessionSummaryData {
    /// Stable conversation identity.
    conversation_id: ConversationId,
    /// Current turn for steering.
    active_turn_id: Option<TurnId>,
    /// Current access scope.
    project_id: ProjectId,
    /// Archive state.
    archived: bool,
    /// Background work does not reorder dashboard.
    last_human_interaction_ms: Counter,
} |value| {
    let _ = value;
    Ok(())
}
}

/// Maximum discovery page size.
pub const MAX_SESSION_PAGE: u64 = 100;
/// Secret submitted only to the authentication backend; Debug is always redacted.
#[derive(Clone, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(try_from = "String", into = "String")]
pub struct SecretInput(String);
impl SecretInput {
    /// Constructs a nonblank secret without including it in validation errors.
    pub fn new(value: String) -> Result<Self, ValidationErrors> {
        required("secret", &value)?;
        Ok(Self(value))
    }
    /// Exposes secret material solely to a trusted authentication implementation.
    pub fn expose(&self) -> &str {
        &self.0
    }
}
impl std::fmt::Debug for SecretInput {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("[REDACTED]")
    }
}
impl TryFrom<String> for SecretInput {
    type Error = ValidationErrors;
    fn try_from(value: String) -> Result<Self, Self::Error> {
        Self::new(value)
    }
}
impl From<SecretInput> for String {
    fn from(value: SecretInput) -> Self {
        value.0
    }
}
/// Auth backend boundary. Login alone confers no project or administrator grants.
pub trait Authentication: Send + Sync {
    /// Local account authentication; implementation hashes/verifies passwords.
    fn local(
        &self,
        request: LoginRequest,
    ) -> BoxFuture<'_, Result<AuthenticatedSession, AuthenticationError>>;
    /// Starts issuer-bound OIDC login with state and PKCE.
    fn oidc_start(&self, request: OidcStart) -> BoxFuture<'_, Result<String, AuthenticationError>>;
    /// Validates issuer, audience, nonce, state and code before mapping issuer/subject.
    fn oidc_callback(
        &self,
        request: OidcCallback,
    ) -> BoxFuture<'_, Result<AuthenticatedSession, AuthenticationError>>;
    /// Atomically consumes initial token and fixes sole administrator; retries only its grants.
    fn bootstrap(
        &self,
        session: AuthenticatedSession,
        request: BootstrapRedeem,
    ) -> BoxFuture<'_, Result<ironloom_storage::factory::BootstrapState, AuthenticationError>>;
    /// Logs out only this service connection.
    fn logout(
        &self,
        session: AuthenticatedSession,
    ) -> BoxFuture<'_, Result<(), AuthenticationError>>;
}
/// Web/native service operations. Caller identity must be resolved by trusted authentication.
pub trait FactoryService: Send + Sync {
    /// Persists actor/key/payload identity and initial event in one transaction; replay never dispatches.
    fn command(
        &self,
        session: AuthenticatedSession,
        command: Command,
    ) -> BoxFuture<'_, Result<CommandReceipt, ServiceError>>;
    /// Returns authorized durable events after cursor; expired cursors require explicit resync.
    fn replay(
        &self,
        session: AuthenticatedSession,
        cursor: ReplayCursor,
    ) -> BoxFuture<'_, Result<Vec<ServiceEvent>, ServiceError>>;
    /// Discovery/history checks current resource grants, including private administrator self-grants.
    fn sessions(
        &self,
        session: AuthenticatedSession,
        query: SessionQuery,
    ) -> BoxFuture<'_, Result<Vec<SessionSummary>, ServiceError>>;
}
/// Safe public service errors; no internal SQL, arguments or secrets.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ServiceError {
    /// Typed request invalid.
    Validation(ValidationErrors),
    /// Missing or stale authentication/authority.
    Authentication(AuthenticationError),
    /// Same command identity with changed payload or stale revision.
    Conflict,
    /// Requested history no longer retained; fetch snapshot before reconnect.
    CursorExpired,
    /// Dependencies unavailable; never initialize replacement state.
    Unavailable,
}

/// Maximum encoded SSE cursor length; rejects oversized untrusted headers before allocation.
pub const MAX_CURSOR_LENGTH: usize = 4096;
/// Encodes the scoped durable cursor as canonical URL-safe base64 JSON, without padding.
pub fn encode_cursor(cursor: &ReplayCursor) -> Result<String, ServiceError> {
    use base64::Engine;
    let json = serde_json::to_vec(cursor).map_err(|_| ServiceError::Unavailable)?;
    Ok(base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(json))
}
/// Decodes `Last-Event-ID` through shared validation; current resource access is checked separately.
pub fn decode_cursor(header: &str) -> Result<ReplayCursor, ServiceError> {
    use base64::Engine;
    if header.len() > MAX_CURSOR_LENGTH {
        return Err(ServiceError::Validation(ValidationErrors::field(
            "cursor", "too_long",
        )));
    }
    let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(header)
        .map_err(|_| {
            ServiceError::Validation(ValidationErrors::field("cursor", "invalid_encoding"))
        })?;
    ironloom_core::validation::decode(&bytes).map_err(ServiceError::Validation)
}
/// Creates one Axum SSE event from an already-persisted service event, without dispatching work.
pub fn sse_event(event: &ServiceEvent) -> Result<axum::response::sse::Event, ServiceError> {
    axum::response::sse::Event::default()
        .id(encode_cursor(&event.cursor)?)
        .event("ironloom.event")
        .json_data(event)
        .map_err(|_| ServiceError::Unavailable)
}
