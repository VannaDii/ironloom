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
    /// Manage lesson content/scope/deletion within the origin project authority.
    Lesson(LessonMutation),
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
            "lesson" => payload(&envelope.data).map(Self::Lesson),
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
    /// Zero or more selected persisted choices; single/multiple policy comes from the pending question.
    choices: Vec<ActorId>,
    /// Optional free-text response, when permitted by the pending question.
    text: Option<String>,
    /// Reject stale/replaced/resolved requests.
    expected_revision: Counter,
} |value| {
    let _ = value;
    positive("expected_revision", value.expected_revision)?;
    if value.choices.is_empty() && value.text.is_none() {
        return Err(ValidationErrors::field("choices", "answer_required"));
    }
    if let Some(text) = &value.text {
        required("text", text)?;
    }
    let unique = value
        .choices
        .iter()
        .collect::<std::collections::BTreeSet<_>>();
    if unique.len() != value.choices.len() {
        return Err(ValidationErrors::field("choices", "duplicate_choice"));
    }
    Ok(())
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
    /// Creates an empty persisted conversation after checking current project operate authority.
    /// Atomically bind authenticated actor/command ID/payload to the new service-assigned ID and
    /// initial snapshot. Identical replay returns that outcome; changed payload conflicts.
    /// No user message, active turn, assignment or inference is started. Initial cursor is zero;
    /// subsequent Input commands retain nonblank validation and independent turn authority.
    fn create_conversation(
        &self,
        session: AuthenticatedSession,
        request: CreateConversation,
    ) -> BoxFuture<'_, Result<ConversationSnapshot, ServiceError>>;
    /// Returns authorized setup/team/profile/device settings and independent execution readiness.
    /// None selects installation settings; Some selects authorized project settings.
    fn configuration(
        &self,
        session: AuthenticatedSession,
        project: Option<ProjectId>,
    ) -> BoxFuture<'_, Result<ConfigurationSnapshot, ServiceError>>;
    /// Atomically persists an actor-scoped idempotent configuration command and its outcome.
    /// Installation setup changes require installation authority; references never grant secret access.
    /// Recheck manage/share/device authority, notify active workers and invalidate relevant readiness.
    fn configure(
        &self,
        session: AuthenticatedSession,
        request: ConfigurationCommand,
    ) -> BoxFuture<'_, Result<ConfigurationSnapshot, ServiceError>>;
    /// Returns only currently viewable lesson content with stable pagination; source records require
    /// independent access. Missing lesson handling setup never delays authorized local application.
    fn lessons(
        &self,
        session: AuthenticatedSession,
        query: LessonQuery,
    ) -> BoxFuture<'_, Result<LessonPage, ServiceError>>;
    /// Returns authorized state and a durable watermark from one consistent snapshot.
    fn snapshot(
        &self,
        session: AuthenticatedSession,
        conversation: ConversationId,
    ) -> BoxFuture<'_, Result<ConversationSnapshot, ServiceError>>;
    /// Returns authorized items at the requested snapshot watermark, oldest first within the page.
    fn history(
        &self,
        session: AuthenticatedSession,
        query: HistoryQuery,
    ) -> BoxFuture<'_, Result<HistoryPage, ServiceError>>;
    /// Atomically bridges durable replay after the cursor into an ordered, bounded live feed.
    /// No gap is allowed between replay and subscription. Recheck live resource grants;
    /// overflow/revocation returns an error and closes the feed. Disconnect/EOF never completes
    /// or cancels background work; reconnect from the last consumed durable cursor.
    fn subscribe(
        &self,
        session: AuthenticatedSession,
        after: ReplayCursor,
    ) -> BoxFuture<'_, Result<EventSubscription, ServiceError>>;
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
    /// Bounded live feed overflowed; reconnect after the last consumed cursor without resubmitting work.
    ResyncRequired,
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

/// Bounded live delivery after durable replay; receiver ownership is not execution ownership.
pub struct EventSubscription {
    /// Durable ordered events, followed by a safe error on revocation/overflow when deliverable.
    /// Abrupt closure is a transport interruption, never an execution terminal outcome.
    pub events: tokio::sync::mpsc::Receiver<Result<ServiceEvent, ServiceError>>,
}
ironloom_core::contract! {
/// Validated factory record.
ConversationSnapshot, ConversationSnapshotData {
    /// Authorized session metadata.
    session: SessionSummary,
    /// Durable watermark of this consistent snapshot.
    cursor: ReplayCursor,
    /// Optimistic command revision at the watermark.
    revision: Counter,
    /// Current execution state; absence means no active assignment.
    execution_state: Option<ironloom_queue::factory::ExecutionState>,
    /// Current visible plan revision.
    plan: Option<ironloom_process_graph::factory::PlanRevision>,
    /// Approval only for the exact visible plan, if approved.
    approval: Option<ironloom_process_graph::factory::PlanApproval>,
    /// Unresolved questions as of the same watermark.
    pending_questions: Vec<ironloom_workers::factory::PendingQuestion>,
    /// Current budget independent of plan approval.
    budget: Option<ironloom_observability::factory::Budget>,
} |value| {
    let _ = value;
    positive("revision", value.revision)?;
    if value.session.conversation_id != value.cursor.conversation_id {
        return Err(ValidationErrors::field(
            "cursor.conversation_id",
            "conversation_mismatch",
        ));
    }
    for question in &value.pending_questions {
        if question.conversation_id != value.session.conversation_id
            || question.resolved_by.is_some()
        {
            return Err(ValidationErrors::field(
                "pending_questions",
                "pending_conversation_required",
            ));
        }
    }
    if let Some(plan) = &value.plan
        && plan.project_id != value.session.project_id
    {
        return Err(ValidationErrors::field(
            "plan.project_id",
            "project_mismatch",
        ));
    }
    if let Some(approval) = &value.approval {
        let matches = value.plan.as_ref().is_some_and(|plan| {
            plan.plan_id == approval.plan_id
                && plan.revision == approval.revision
                && plan.content_hash == approval.content_hash
        });
        if !matches {
            return Err(ValidationErrors::field(
                "approval",
                "plan_revision_mismatch",
            ));
        }
    }
    Ok(())
}
}
ironloom_core::contract! {
/// Validated factory record.
HistoryQuery, HistoryQueryData {
    /// Consistent snapshot watermark and authorized conversation.
    as_of: ReplayCursor,
    /// Exclusive stable item cursor; absent returns latest page at the watermark.
    before: Option<ItemId>,
    /// Bounded page size.
    limit: Counter,
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
HistoryItem, HistoryItemData {
    /// Authorized source conversation.
    conversation_id: ConversationId,
    /// Stable source turn.
    turn_id: TurnId,
    /// Stable item cursor.
    item_id: ItemId,
    /// Role-bearing text/tool content, not raw provider data.
    message: ironloom_models::factory::InferenceMessage,
} |value| {
    let _ = value;
    Ok(())
}
}
ironloom_core::contract! {
/// Validated factory record.
HistoryPage, HistoryPageData {
    /// Same watermark as the request, even if new work arrives.
    as_of: ReplayCursor,
    /// Ordered oldest to newest within this bounded page.
    items: Vec<HistoryItem>,
    /// Exclusive cursor for the next older page; None means history exhausted.
    next_before: Option<ItemId>,
} |value| {
    let _ = value;
    if value.items.len() > MAX_SESSION_PAGE as usize {
        return Err(ValidationErrors::field("items", "page_too_large"));
    }
    let mut ids = std::collections::BTreeSet::new();
    for item in &value.items {
        if item.conversation_id != value.as_of.conversation_id {
            return Err(ValidationErrors::field("items", "conversation_mismatch"));
        }
        if !ids.insert(&item.item_id) {
            return Err(ValidationErrors::field("items", "duplicate_item"));
        }
    }
    if let Some(before) = &value.next_before
        && value
            .items
            .first()
            .is_none_or(|item| &item.item_id != before)
    {
        return Err(ValidationErrors::field(
            "next_before",
            "oldest_item_required",
        ));
    }
    Ok(())
}
}
ironloom_core::contract! {
/// Validated factory record.
ConfigurationChange, ConfigurationChangeData {
    /// Explicit installation setup handling/delivery confirmation.
    setup: Option<ironloom_config::factory::FactorySetup>,
    /// Replace enabled/custom team settings in the chosen scope.
    roles: Option<Vec<ironloom_config::factory::RoleConfiguration>>,
    /// Replace explicitly selected provider/model/engine/billing profiles.
    models: Option<Vec<ironloom_config::factory::ModelProfileConfiguration>>,
    /// Explicit enable/disable choices; never accept client-supplied discovery facts.
    device_preferences: Option<Vec<ironloom_config::factory::DevicePreference>>,
} |value| {
    let _ = value;
    if value.setup.is_none()
        && value.roles.is_none()
        && value.models.is_none()
        && value.device_preferences.is_none()
    {
        return Err(ValidationErrors::field(
            "$",
            "configuration_change_required",
        ));
    }
    Ok(())
}
}
ironloom_core::contract! {
/// Validated factory record.
ConfigurationCommand, ConfigurationCommandData {
    /// Durable idempotency identity scoped to authenticated actor.
    command_id: CommandId,
    /// None for installation settings, Some for project overrides.
    project_id: Option<ProjectId>,
    /// Compare-and-swap configuration revision, independent of plan approval.
    expected_revision: Counter,
    /// Typed settings mutation, never arbitrary filesystem paths or secrets.
    changes: ConfigurationChange,
} |value| {
    let _ = value;
    positive("expected_revision", value.expected_revision)?;
    if value.project_id.is_some() && value.changes.setup.is_some() {
        return Err(ValidationErrors::field(
            "changes.setup",
            "installation_scope_required",
        ));
    }
    Ok(())
}
}
ironloom_core::contract! {
/// Validated factory record.
ConfigurationSnapshot, ConfigurationSnapshotData {
    /// Installation or project settings scope.
    project_id: Option<ProjectId>,
    /// Durable configuration revision for subsequent mutations.
    revision: Counter,
    /// Absent until required lesson handling and delivery mode have been saved.
    setup: Option<ironloom_config::factory::FactorySetup>,
    /// Configured team, including orchestration.
    roles: Vec<ironloom_config::factory::RoleConfiguration>,
    /// Human-selected model profiles visible to this account.
    models: Vec<ironloom_config::factory::ModelProfileConfiguration>,
    /// Explicit enable/disable settings.
    device_preferences: Vec<ironloom_config::factory::DevicePreference>,
    /// Server-resolved device identities; simulations remain unqualified.
    discovered_devices: Vec<ironloom_models::factory::DeviceIdentity>,
    /// Execution readiness independent of functioning setup/web readiness.
    execution_ready: bool,
    /// Visible configuration/capability/permission blockers.
    unmet_prerequisites: Vec<ActorId>,
} |value| {
    let _ = value;
    positive("revision", value.revision)?;
    if value.execution_ready != value.unmet_prerequisites.is_empty() {
        return Err(ValidationErrors::field(
            "execution_ready",
            "prerequisite_mismatch",
        ));
    }
    if value.execution_ready && value.setup.is_none() {
        return Err(ValidationErrors::field("setup", "setup_required"));
    }
    let model_ids = value
        .models
        .iter()
        .map(|model| &model.profile_id)
        .collect::<std::collections::BTreeSet<_>>();
    if model_ids.len() != value.models.len() {
        return Err(ValidationErrors::field("models", "duplicate_profile"));
    }
    if value.roles.iter().any(|role| {
        role.enabled
            && role
                .model_profile_id
                .as_ref()
                .is_none_or(|profile| !model_ids.contains(profile))
    }) {
        return Err(ValidationErrors::field("roles", "unknown_model_profile"));
    }
    Ok(())
}
}
/// Lesson management operation; no action grants approval or private-source access.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum LessonOperation {
    /// Update stored lesson content at an expected revision.
    Edit,
    /// Restrict or promote scope; broadening requires share authority.
    SetScope,
    /// Explicit authorized deletion independent of worktree cleanup.
    Delete,
}
ironloom_core::contract! {
/// Validated factory record.
LessonMutation, LessonMutationData {
    /// Stored lesson in the outer command origin project.
    lesson_id: LessonId,
    /// Reject stale concurrent updates.
    expected_revision: Counter,
    /// Content/scope/delete action.
    operation: LessonOperation,
    /// Present exactly for edit.
    content: Option<String>,
    /// Present exactly for scope changes; installation promotes sharing.
    scope: Option<ironloom_storage::factory::RecordScope>,
} |value| {
    let _ = value;
    positive("expected_revision", value.expected_revision)?;
    if (value.operation == LessonOperation::Edit) != value.content.is_some() {
        return Err(ValidationErrors::field(
            "content",
            "edit_content_required_only",
        ));
    }
    if (value.operation == LessonOperation::SetScope) != value.scope.is_some() {
        return Err(ValidationErrors::field(
            "scope",
            "scope_change_required_only",
        ));
    }
    if let Some(content) = &value.content {
        required("content", content)?;
    }
    Ok(())
}
}
ironloom_core::contract! {
/// Validated factory record.
LessonQuery, LessonQueryData {
    /// Authorized project including its applicable shared lessons.
    project_id: ProjectId,
    /// Optional authorized assignment scope.
    assignment_id: Option<AssignmentId>,
    /// Optional current-scope filter.
    scope: Option<ironloom_storage::factory::RecordScope>,
    /// Exclusive stable lesson cursor.
    after: Option<LessonId>,
    /// Bounded page size.
    limit: Counter,
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
LessonPage, LessonPageData {
    /// Authorized lesson content only; origin references do not reveal source contents.
    lessons: Vec<ironloom_storage::factory::Lesson>,
    /// Next cursor, absent when exhausted.
    next_after: Option<LessonId>,
} |value| {
    let _ = value;
    if value.lessons.len() > MAX_SESSION_PAGE as usize {
        return Err(ValidationErrors::field("lessons", "page_too_large"));
    }
    let ids = value
        .lessons
        .iter()
        .map(|lesson| &lesson.lesson_id)
        .collect::<std::collections::BTreeSet<_>>();
    if ids.len() != value.lessons.len() {
        return Err(ValidationErrors::field("lessons", "duplicate_lesson"));
    }
    Ok(())
}
}
ironloom_core::contract! {
/// Creates an empty service-owned conversation before any user input or turn.
CreateConversation, CreateConversationData {
    /// Durable authenticated-actor-scoped idempotency identity.
    command_id: CommandId,
    /// Existing project requiring current operate authority.
    project_id: ProjectId,
} |value| {
    let _ = value;
    Ok(())
}
}
