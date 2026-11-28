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
    Budget(BudgetCommand),
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
/// Edits a conversation's budget independently of its approved plan.
BudgetCommand, BudgetCommandData {
    /// Authorized target stream; never infer a target from recent activity.
    conversation_id: ConversationId,
    /// Current budget revision, bounds and visible accounting counters.
    budget: ironloom_observability::factory::Budget,
} |value| {
    let _ = value;
    Ok(())
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
    event: Option<ironloom_workers::factory::WorkerEvent>,
    /// Non-worker state update at this exact durable watermark; no invented execution identity.
    snapshot: Option<ConversationSnapshot>,
} |value| {
    let _ = value;
    positive("cursor.sequence", value.cursor.sequence)?;
    if value.event.is_some() == value.snapshot.is_some() {
        return Err(ValidationErrors::field(
            "event",
            "exactly_one_event_or_snapshot",
        ));
    }
    if let Some(snapshot) = &value.snapshot {
        if snapshot.cursor != value.cursor {
            return Err(ValidationErrors::field(
                "snapshot.cursor",
                "watermark_mismatch",
            ));
        }
        if snapshot.session.project_id != value.project_id {
            return Err(ValidationErrors::field(
                "snapshot.session.project_id",
                "project_mismatch",
            ));
        }
    }
    Ok(())
}
}
/// Durable duplicate handling contract.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum CommandDisposition {
    /// New command and outcome committed atomically, including an event when conversation-scoped.
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
    /// First committed event/current replay position for conversation commands. Event-free
    /// resource mutations have no source cursor and never require private conversation access.
    cursor: Option<ReplayCursor>,
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
/// Explicit newest-first conversation ordering, shared by dashboard and native discovery.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum SessionOrder {
    /// Most recent authenticated human interaction; background events do not reorder it.
    HumanInteraction,
    /// Immutable creation time for native thread discovery.
    CreatedAt,
}
ironloom_core::contract! {
/// Validated factory record.
SessionQuery, SessionQueryData {
    /// Explicit ordering; adapters never infer a different default.
    order: SessionOrder,
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
    /// Lists only currently viewable project metadata, ordered by authenticated human interaction.
    fn projects(
        &self,
        session: AuthenticatedSession,
        query: ProjectQuery,
    ) -> BoxFuture<'_, Result<ProjectPage, ServiceError>>;
    /// Creates creator-owned project metadata/backing repository under configured infrastructure roots.
    fn create_project(
        &self,
        session: AuthenticatedSession,
        request: CreateProject,
    ) -> BoxFuture<'_, Result<ProjectSummary, ServiceError>>;
    /// Records an explicit installation-administrator self-grant before returning private content.
    fn self_grant_project(
        &self,
        session: AuthenticatedSession,
        project: ProjectId,
        command: CommandId,
    ) -> BoxFuture<'_, Result<ProjectSummary, ServiceError>>;
    /// Returns opaque credential metadata for current authorized use/management, never plaintext.
    fn credentials(
        &self,
        session: AuthenticatedSession,
    ) -> BoxFuture<'_, Result<Vec<CredentialSummary>, ServiceError>>;
    /// Applies current, distinct create/replace/share/delete authority and revision checks atomically.
    fn credential(
        &self,
        session: AuthenticatedSession,
        request: CredentialCommand,
    ) -> BoxFuture<'_, Result<Option<CredentialSummary>, ServiceError>>;
    /// Returns the authenticated operator's current node connection, without protected registration.
    fn native_connection(
        &self,
        session: AuthenticatedSession,
        node: NodeId,
    ) -> BoxFuture<'_, Result<NativeConnectionState, ServiceError>>;
    /// Imports or manages protected control registration; enrollment completion belongs to native adapter.
    fn configure_native(
        &self,
        session: AuthenticatedSession,
        request: NativeConnectionCommand,
    ) -> BoxFuture<'_, Result<NativeConnectionState, ServiceError>>;
    /// Lists authorized persisted model inventory and independent transfer/integrity/availability state.
    /// Byte completion is never promoted to verified installation. Private source access stays separate.
    fn inventory(
        &self,
        session: AuthenticatedSession,
        query: ModelInventoryQuery,
    ) -> BoxFuture<'_, Result<ModelInventoryPage, ServiceError>>;
    /// Computes metadata/capability/resource assessments for configured engine placements.
    /// Unknown facts stay unknown; no load, warm-up or inference probe is permitted.
    fn assess_model(
        &self,
        session: AuthenticatedSession,
        query: ModelAssessmentQuery,
    ) -> BoxFuture<'_, Result<Vec<EngineAssessment>, ServiceError>>;
    /// Authorized metadata-only source browsing; continuation is scoped to query and source account.
    fn source_search(
        &self,
        session: AuthenticatedSession,
        project: Option<ProjectId>,
        query: ironloom_models::factory::SourceQuery,
    ) -> BoxFuture<'_, Result<ironloom_models::factory::SourcePage, ServiceError>>;
    /// Returns the authorized persisted transfer after reconnect; no request is resubmitted.
    fn download_status(
        &self,
        session: AuthenticatedSession,
        download: ActorId,
    ) -> BoxFuture<'_, Result<ironloom_models::factory::DownloadProgress, ServiceError>>;
    /// Authorized current source access and resumable transfer lifecycle, with durable command identity.
    fn download(
        &self,
        session: AuthenticatedSession,
        request: DownloadCommand,
    ) -> BoxFuture<'_, Result<ironloom_models::factory::DownloadProgress, ServiceError>>;
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
    /// Reads effective editable templates in the authorized installation/project scope.
    fn instructions(
        &self,
        session: AuthenticatedSession,
        query: InstructionQuery,
    ) -> BoxFuture<'_, Result<InstructionPage, ServiceError>>;
    /// Reads authorized assignment copies with their actual applied/acknowledged revisions.
    /// Source storage unavailability does not erase these durable records.
    fn instruction_copies(
        &self,
        session: AuthenticatedSession,
        assignment: AssignmentId,
    ) -> BoxFuture<'_, Result<Vec<ironloom_process_graph::factory::InstructionCopy>, ServiceError>>;
    /// Persists a template revision and the explicit selected active-copy update choice atomically.
    /// Updating copies never expands plan scope and workers acknowledge at their next decision.
    fn instruction(
        &self,
        session: AuthenticatedSession,
        request: InstructionCommand,
    ) -> BoxFuture<'_, Result<InstructionTemplate, ServiceError>>;
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
    /// Persists actor/key/payload identity and outcome in one transaction; conversation mutations
    /// also persist their event. Event-free resource mutations expose no private source cursor.
    /// Replay never dispatches new work.
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
    /// A specific missing approval must be obtained; distinct from denied grants/dependency failure.
    ApprovalRequired,
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
    /// Current assignment binding for reconnect controls; absent for an empty/idle conversation.
    active_assignment_id: Option<AssignmentId>,
    /// Present for an active assignment; true requests a pause still awaiting a safe boundary.
    pause_requested: Option<bool>,
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
    if value.execution_state.as_ref().is_some_and(|state| {
        !matches!(
            state,
            ironloom_queue::factory::ExecutionState::Completed
                | ironloom_queue::factory::ExecutionState::Failed
                | ironloom_queue::factory::ExecutionState::Terminated
        )
    }) && value.active_assignment_id.is_none()
    {
        return Err(ValidationErrors::field(
            "active_assignment_id",
            "execution_binding_required",
        ));
    }
    if value.active_assignment_id.is_some() && value.execution_state.is_none() {
        return Err(ValidationErrors::field(
            "execution_state",
            "assignment_state_required",
        ));
    }
    if value.active_assignment_id.is_some()!=value.pause_requested.is_some() {
        return Err(ValidationErrors::field("pause_requested","assignment_control_state_required"));
    }
    if value.pause_requested==Some(true) && value.execution_state.as_ref().is_some_and(|state|matches!(state,ironloom_queue::factory::ExecutionState::Paused|ironloom_queue::factory::ExecutionState::CancellationRequested|ironloom_queue::factory::ExecutionState::Terminated|ironloom_queue::factory::ExecutionState::Completed|ironloom_queue::factory::ExecutionState::Failed)) {
        return Err(ValidationErrors::field("pause_requested","pending_pause_state_mismatch"));
    }
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
/// Traversal direction at a fixed durable history watermark.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum HistoryDirection {
    /// Page toward older items, returning each page oldest first.
    Backward,
    /// Page toward newer items, returning each page oldest first.
    Forward,
}
ironloom_core::contract! {
/// Validated factory record.
HistoryQuery, HistoryQueryData {
    /// Consistent snapshot watermark and authorized conversation.
    as_of: ReplayCursor,
    /// Requested traversal; absent cursors start at the corresponding end.
    direction: HistoryDirection,
    /// Exclusive older-page cursor; only valid for backward traversal.
    before: Option<ItemId>,
    /// Exclusive newer-page cursor; only valid for forward traversal.
    after: Option<ItemId>,
    /// Optional exact turn, checked within the authorized conversation.
    turn_id: Option<TurnId>,
    /// Bounded page size.
    limit: Counter,
} |value| {
    if value.direction == HistoryDirection::Forward && value.before.is_some() {
        return Err(ValidationErrors::field("before", "backward_direction_required"));
    }
    if value.direction == HistoryDirection::Backward && value.after.is_some() {
        return Err(ValidationErrors::field("after", "forward_direction_required"));
    }
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
    /// Traversal of the request; never inferred from item IDs.
    direction: HistoryDirection,
    /// Same optional turn filter as the request.
    turn_id: Option<TurnId>,
    /// Ordered oldest to newest within this bounded page.
    items: Vec<HistoryItem>,
    /// Exclusive older-page cursor, only for backward traversal.
    next_before: Option<ItemId>,
    /// Exclusive newer-page cursor, only for forward traversal.
    next_after: Option<ItemId>,
} |value| {
    if value.direction == HistoryDirection::Forward && value.next_before.is_some() {
        return Err(ValidationErrors::field("next_before", "backward_direction_required"));
    }
    if value.direction == HistoryDirection::Backward && value.next_after.is_some() {
        return Err(ValidationErrors::field("next_after", "forward_direction_required"));
    }
    if let Some(turn) = &value.turn_id
        && value.items.iter().any(|item| &item.turn_id != turn) {
        return Err(ValidationErrors::field("items", "turn_mismatch"));
    }
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
    if let Some(after) = &value.next_after
        && value.items.last().is_none_or(|item| &item.item_id != after) {
        return Err(ValidationErrors::field("next_after", "newest_item_required"));
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
    /// Replace explicit provider endpoints in the chosen scope; no secrets or inference probes.
    endpoints: Option<Vec<ironloom_config::factory::ProviderEndpoint>>,
    /// Replace explicit host/account choices; omission inherits, an empty list clears the scope.
    source_accounts: Option<Vec<ironloom_config::factory::SourceAccountBinding>>,
} |value| {
    let _ = value;
    if value.setup.is_none()
        && value.roles.is_none()
        && value.models.is_none()
        && value.device_preferences.is_none()
        && value.endpoints.is_none()
        && value.source_accounts.is_none()
    {
        return Err(ValidationErrors::field(
            "$",
            "configuration_change_required",
        ));
    }
    configuration_bindings(value.endpoints.as_deref(),value.source_accounts.as_deref())
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
    /// Effective explicit provider endpoint definitions, inherited only where not overridden.
    endpoints: Vec<ironloom_config::factory::ProviderEndpoint>,
    /// Effective explicit source-account bindings; credential material is never exposed.
    source_accounts: Vec<ironloom_config::factory::SourceAccountBinding>,
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
    let roles=value.roles.iter().map(|role|&role.role_id).collect::<std::collections::BTreeSet<_>>();
    if roles.len()!=value.roles.len() {return Err(ValidationErrors::field("roles","duplicate_role"));}
    if value.roles.iter().any(|role| {
        role.enabled
            && role
                .model_profile_id
                .as_ref()
                .is_none_or(|profile| !model_ids.contains(profile))
    }) {
        return Err(ValidationErrors::field("roles", "unknown_model_profile"));
    }
    configuration_bindings(Some(&value.endpoints),Some(&value.source_accounts))
}
}

fn configuration_bindings(
    endpoints: Option<&[ironloom_config::factory::ProviderEndpoint]>,
    accounts: Option<&[ironloom_config::factory::SourceAccountBinding]>,
) -> Result<(), ValidationErrors> {
    if let Some(endpoints) = endpoints
        && endpoints
            .iter()
            .map(|endpoint| &endpoint.provider)
            .collect::<std::collections::BTreeSet<_>>()
            .len()
            != endpoints.len()
    {
        return Err(ValidationErrors::field("endpoints", "duplicate_provider"));
    }
    if let Some(accounts) = accounts
        && accounts
            .iter()
            .map(|account| &account.host)
            .collect::<std::collections::BTreeSet<_>>()
            .len()
            != accounts.len()
    {
        return Err(ValidationErrors::field("source_accounts", "duplicate_host"));
    }
    Ok(())
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

ironloom_core::contract! {
/// Validated factory record.
RelayCursor, RelayCursorData {
    /// Native relay client ID.
    client_id: ActorId,
    /// Relay stream identity, not conversation ID.
    stream_id: ActorId,
    /// Upstream transport acknowledgment, not durable service cursor.
    acknowledged_sequence: Counter,
    /// Optional acknowledged chunk within the sequence.
    acknowledged_segment: Option<Counter>,
    /// Opaque upstream subscribe cursor, independent from sequence acknowledgment.
    subscription_cursor: Option<ActorId>,
} |value| {
    let _ = value;
    Ok(())
}
}
ironloom_core::contract! {
/// Validated factory record.
NativeEnrollment, NativeEnrollmentData {
    /// Existing shared installation.
    installation_id: InstallationId,
    /// Enrolled service node.
    node_id: NodeId,
    /// Upstream server ID returned by enrollment/refresh.
    server_id: ServerId,
    /// Distinct upstream environment ID used for session visibility.
    environment_id: EnvironmentId,
    /// Normalized relay endpoint set.
    relay_target: RelayTarget,
    /// Persisted enrollment/preference key; independent from server and environment IDs.
    persistence_key: NativePersistenceKey,
    /// Connected external account.
    external_account_id: ActorId,
    /// Authorized human mapping; host does not grant access.
    operator_id: OperatorId,
    /// Persisted user preference.
    enabled: bool,
    /// Reject stale token-refresh results.
    authentication_generation: Counter,
    /// Protected imported control registration.
    control_registration_ref: CredentialId,
    /// Separate eligible inference credentials; no billing fallback.
    inference_credential_ref: Option<CredentialId>,
} |value| {
    let _ = value;
    positive("authentication_generation", value.authentication_generation)?;
    if value.external_account_id != value.persistence_key.external_account_id
        || value.relay_target.websocket_url != value.persistence_key.websocket_url
    {
        return Err(ValidationErrors::field(
            "persistence_key",
            "enrollment_key_mismatch",
        ));
    }
    Ok(())
}
}
/// Pinned upstream compatibility source; not an adopted state runtime.
pub const UPSTREAM_REVISION: &str = "e2e7dabd4587c7b0fbf934e6a93b6cec8245751d";
/// Upstream native relay protocol version.
pub const RELAY_PROTOCOL_VERSION: u64 = 3;

impl NativeEnrollmentData {
    /// Rejects refresh responses from a retired login generation.
    pub fn accepts_refresh(&self, generation: Counter) -> bool {
        self.enabled && self.authentication_generation == generation
    }
}
ironloom_core::contract! {
/// Validated factory record.
RelayTarget, RelayTargetData {
    /// Normalized relay WebSocket endpoint.
    websocket_url: String,
    /// Enrollment endpoint.
    enroll_url: String,
    /// Server registration refresh endpoint.
    refresh_url: String,
    /// Pairing endpoint.
    pair_url: String,
    /// Pairing-status endpoint.
    pair_status_url: String,
} |value| {
    let _ = value;
    let websocket = relay_url("websocket_url", &value.websocket_url, true)?;
    for (field, endpoint) in [
        ("enroll_url", &value.enroll_url),
        ("refresh_url", &value.refresh_url),
        ("pair_url", &value.pair_url),
        ("pair_status_url", &value.pair_status_url),
    ] {
        let http = relay_url(field, endpoint, false)?;
        if websocket.host_str() != http.host_str()
            || websocket.port_or_known_default() != http.port_or_known_default()
            || (websocket.scheme() == "wss") != (http.scheme() == "https")
        {
            return Err(ValidationErrors::field(field, "relay_origin_mismatch"));
        }
    }
    Ok(())
}
}
ironloom_core::contract! {
/// Validated factory record.
NativePersistenceKey, NativePersistenceKeyData {
    /// Exact normalized relay WebSocket target, as in upstream persisted lookup.
    websocket_url: String,
    /// Authenticated external account; never an unrestricted host identity.
    external_account_id: ActorId,
    /// Optional pairing/client preference namespace, matching upstream lookup.
    client_name: Option<ActorId>,
} |value| {
    let _ = value;
    relay_url("websocket_url", &value.websocket_url, true)?;
    Ok(())
}
}

fn relay_url(field: &str, value: &str, websocket: bool) -> Result<url::Url, ValidationErrors> {
    let url = url::Url::parse(value).map_err(|_| ValidationErrors::field(field, "invalid_url"))?;
    let loopback = match url.host() {
        Some(url::Host::Domain(host)) => host == "localhost",
        Some(url::Host::Ipv4(ip)) => ip.is_loopback(),
        Some(url::Host::Ipv6(ip)) => ip.is_loopback(),
        None => false,
    };
    let secure = if websocket { "wss" } else { "https" };
    let local = if websocket { "ws" } else { "http" };
    if url.host_str().is_none()
        || !(url.scheme() == secure || (loopback && url.scheme() == local))
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(ValidationErrors::field(field, "secure_relay_required"));
    }
    if url.as_str() != value {
        return Err(ValidationErrors::field(field, "normalized_url_required"));
    }
    Ok(url)
}
/// Project storage availability independent of installation/setup identity.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ProjectStorageState {
    /// Owning workspace mount/repository is accessible.
    Available,
    /// Project metadata remains visible; filesystem execution is blocked.
    Unavailable,
}
ironloom_core::contract! {
/// Validated factory record.
ProjectQuery, ProjectQueryData {
    /// Opaque continuation tuple of human-interaction timestamp and project ID.
    after: Option<ActorId>,
    /// Bounded catalog page size.
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
ProjectSummary, ProjectSummaryData {
    /// Stable metadata identity independent of folder/name.
    project_id: ProjectId,
    /// Mutable human-readable project name.
    name: String,
    /// Creator-owned project, not automatically visible to administrators.
    owner: OperatorId,
    /// Workspace-owning node.
    owner_node: NodeId,
    /// Unavailable mounts never erase metadata or initialize replacement workspaces.
    storage: ProjectStorageState,
    /// Ordering key; background events never change it.
    last_human_interaction_ms: Counter,
    /// Current effective grants; never a token authorizing future operations.
    permissions: Vec<ironloom_policy::factory::Permission>,
} |value| {
    let _ = value;
    required("name", &value.name)
}
}
ironloom_core::contract! {
/// Validated factory record.
ProjectPage, ProjectPageData {
    /// Authorized projects ordered by latest human interaction, then stable ID.
    projects: Vec<ProjectSummary>,
    /// Opaque continuation; None means exhausted.
    next_after: Option<ActorId>,
} |value| {
    let _ = value;
    if value.projects.len() > MAX_SESSION_PAGE as usize {
        return Err(ValidationErrors::field("projects", "page_too_large"));
    }
    Ok(())
}
}
ironloom_core::contract! {
/// Validated factory record.
CreateProject, CreateProjectData {
    /// Durable actor-scoped creation identity.
    command_id: CommandId,
    /// Requested display name; server assigns project ID and configured root.
    name: String,
    /// GitHub source-of-truth repository; None creates a new backing Git repository.
    repository: Option<RepositorySlug>,
    /// Explicit authorized source credential reference, never a secret.
    source_credential_id: Option<CredentialId>,
} |value| {
    let _ = value;
    required("name", &value.name)
}
}
/// Credential management, independent from session login or inference billing.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum CredentialOperation {
    /// Create a private credential owned by authenticated operator.
    Create,
    /// Replace secret material with distinct permission.
    Replace,
    /// Grant/revoke explicit per-operation authority.
    Share,
    /// Delete secret material with distinct permission.
    Delete,
}
ironloom_core::contract! {
/// Validated factory record.
CredentialSummary, CredentialSummaryData {
    /// Opaque reference safe for authorized selection.
    credential_id: CredentialId,
    /// Private owner.
    owner: OperatorId,
    /// Nonsecret human label.
    label: ActorId,
    /// Current management revision.
    revision: Counter,
    /// Current operation-specific effective grants; no plaintext secret.
    permissions: Vec<ironloom_policy::factory::Permission>,
} |value| {
    let _ = value;
    positive("revision", value.revision)
}
}
ironloom_core::contract! {
/// Validated factory record.
CredentialCommand, CredentialCommandData {
    /// Durable actor-scoped mutation identity.
    command_id: CommandId,
    /// None only for creation; server assigns identity.
    credential_id: Option<CredentialId>,
    /// Zero only for creation, positive for existing records.
    expected_revision: Counter,
    /// Explicit management operation.
    operation: CredentialOperation,
    /// Required for creation; optional on replacement.
    label: Option<ActorId>,
    /// Required only for create/replace, never emitted by read APIs.
    secret: Option<SecretInput>,
    /// Required only for share/revoke.
    grantee: Option<OperatorId>,
    /// Share grants limited to credential operations.
    permissions: Vec<ironloom_policy::factory::Permission>,
    /// True only for revoking a specified share.
    revoke: bool,
} |value| {
    let _ = value;
    let create = value.operation == CredentialOperation::Create;
    if create != value.credential_id.is_none() || create != (value.expected_revision == 0) {
        return Err(ValidationErrors::field(
            "credential_id",
            "credential_identity_mismatch",
        ));
    }
    if create && value.label.is_none() {
        return Err(ValidationErrors::field("label", "required"));
    }
    let secret = matches!(
        value.operation,
        CredentialOperation::Create | CredentialOperation::Replace
    );
    if secret != value.secret.is_some() {
        return Err(ValidationErrors::field(
            "secret",
            "secret_operation_mismatch",
        ));
    }
    let share = value.operation == CredentialOperation::Share;
    if share != value.grantee.is_some()
        || share == value.permissions.is_empty()
        || (!share && value.revoke)
    {
        return Err(ValidationErrors::field(
            "grantee",
            "share_operation_mismatch",
        ));
    }
    if value.permissions.iter().any(|permission| {
        !matches!(
            permission,
            ironloom_policy::factory::Permission::View
                | ironloom_policy::factory::Permission::UseCredential
                | ironloom_policy::factory::Permission::ReplaceCredential
                | ironloom_policy::factory::Permission::Share
                | ironloom_policy::factory::Permission::DeleteCredential
        )
    }) {
        return Err(ValidationErrors::field(
            "permissions",
            "credential_permissions_required",
        ));
    }
    Ok(())
}
}
/// Native control authentication separate from eligible inference credentials.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum NativeConnectionOperation {
    /// Import protected registration for server-side refresh.
    Import,
    /// Persist enabled preference without changing identity.
    SetEnabled,
    /// Disconnect and delete the protected control registration.
    Delete,
}
ironloom_core::contract! {
/// Validated factory record.
NativeConnectionCommand, NativeConnectionCommandData {
    /// Durable actor-scoped connection mutation.
    command_id: CommandId,
    /// Enrolled service node.
    node_id: NodeId,
    /// Zero for first import; otherwise compare with persisted authentication generation.
    expected_generation: Counter,
    /// Explicit connection operation.
    operation: NativeConnectionOperation,
    /// Present exactly for import; never returned to browsers.
    protected_registration: Option<SecretInput>,
    /// Present exactly for enable/disable preference.
    enabled: Option<bool>,
} |value| {
    let _ = value;
    if (value.operation == NativeConnectionOperation::Import)
        != value.protected_registration.is_some()
    {
        return Err(ValidationErrors::field(
            "protected_registration",
            "import_registration_required_only",
        ));
    }
    if (value.operation == NativeConnectionOperation::SetEnabled) != value.enabled.is_some() {
        return Err(ValidationErrors::field(
            "enabled",
            "preference_required_only",
        ));
    }
    Ok(())
}
}
/// Current native connection state without exposure of protected registration.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum NativeConnectionStatus {
    /// No active control registration.
    Disconnected,
    /// Protected registration import/enrollment is pending.
    Connecting,
    /// Current enrollment and authentication are ready.
    Connected,
    /// Connection failed; no silent credential replacement.
    Failed,
}
ironloom_core::contract! {
/// Validated factory record.
NativeConnectionState, NativeConnectionStateData {
    /// Enrolled node.
    node_id: NodeId,
    /// Current authentication generation; zero before first import.
    generation: Counter,
    /// Current connection state.
    status: NativeConnectionStatus,
    /// Present after successful enrollment.
    enrollment: Option<NativeEnrollment>,
} |value| {
    let _ = value;
    if value.status == NativeConnectionStatus::Connected && value.enrollment.is_none() {
        return Err(ValidationErrors::field(
            "enrollment",
            "connected_enrollment_required",
        ));
    }
    if let Some(enrollment) = &value.enrollment
        && (enrollment.node_id != value.node_id
            || enrollment.authentication_generation != value.generation)
    {
        return Err(ValidationErrors::field(
            "enrollment",
            "connection_binding_mismatch",
        ));
    }
    Ok(())
}
}
/// Service-owned resumable download operation; not inference.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum DownloadOperation {
    /// Start after current source access/license check.
    Start,
    /// Resume the same pinned source/revision.
    Resume,
    /// Persist cancellation request; termination confirmation remains separate.
    Cancel,
}
ironloom_core::contract! {
/// Validated factory record.
DownloadCommand, DownloadCommandData {
    /// Durable actor-scoped mutation identity.
    command_id: CommandId,
    /// Authorized project context or installation-level model management.
    project_id: Option<ProjectId>,
    /// Selected source repository ID.
    repository_id: ActorId,
    /// Pinned source revision; never silently substitute latest.
    revision: ActorId,
    /// Absent for start, required for resume/cancel.
    download_id: Option<ActorId>,
    /// Explicit download action.
    operation: DownloadOperation,
} |value| {
    let _ = value;
    if (value.operation == DownloadOperation::Start) != value.download_id.is_none() {
        return Err(ValidationErrors::field(
            "download_id",
            "download_identity_mismatch",
        ));
    }
    Ok(())
}
}
ironloom_core::contract! {
/// Validated factory record.
ModelAssessmentQuery, ModelAssessmentQueryData {
    /// Optional authorized project context for profiles/source access.
    project_id: Option<ProjectId>,
    /// Selected source repository from the model card.
    repository_id: ActorId,
    /// Exact source revision, not an implicit latest selection.
    revision: ActorId,
    /// Optional human-selected profile; its bindings restrict placements.
    profile_id: Option<ModelProfileId>,
    /// Optional explicit engine/version/backend filter; absence evaluates configured candidates.
    engine: Option<ironloom_models::factory::EngineIdentity>,
    /// Explicit context assumption for cache/runtime memory estimates.
    context_tokens: Counter,
    /// Explicit concurrent demand assumption.
    concurrency: Counter,
} |value| {
    let _ = value;
    positive("context_tokens", value.context_tokens)?;
    positive("concurrency", value.concurrency)
}
}
ironloom_core::contract! {
/// Validated factory record.
EngineAssessment, EngineAssessmentData {
    /// Exact candidate engine/version/backend/configuration identity.
    engine: ironloom_models::factory::EngineIdentity,
    /// Canonical matching device/group observations; no ordinal-based duplicate pools.
    devices: Vec<ironloom_models::factory::DeviceResourceObservation>,
    /// Compatibility constraints, demand components and estimation assumptions.
    requirements: ironloom_models::factory::EngineRequirements,
    /// Compatibility, full demand estimate, fit after safe idle eviction and actual backend qualification remain distinct.
    fit: ironloom_models::factory::ModelFit,
} |value| {
    let _ = value;
    if value.requirements.compatibility != value.fit.compatibility {
        return Err(ValidationErrors::field(
            "fit.compatibility",
            "assessment_compatibility_mismatch",
        ));
    }
    let ids = value
        .devices
        .iter()
        .map(|device| &device.device_id)
        .collect::<std::collections::BTreeSet<_>>();
    if ids.len() != value.devices.len() {
        return Err(ValidationErrors::field("devices", "duplicate_device"));
    }
    if value.fit.estimated_bytes != value.requirements.total_bytes() {
        return Err(ValidationErrors::field("fit.estimated_bytes","complete_demand_mismatch"));
    }
    if value.fit.fits_after_idle_eviction.is_some()
        && (value.devices.is_empty() || value.fit.estimated_bytes.is_none())
    {
        return Err(ValidationErrors::field(
            "fit.fits_after_idle_eviction",
            "device_and_demand_required",
        ));
    }
    Ok(())
}
}
/// Server-owned installation integrity result independent from transfer progress or engine qualification.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ModelVerification {
    /// Integrity has not been verified, even when transfer bytes are complete.
    Pending,
    /// All required files were checked and bound to the persisted checkpoint manifest hash.
    Verified,
    /// Integrity validation failed; the installation cannot be used.
    Failed,
}
ironloom_core::contract! {
/// Validated factory record.
ModelInventoryQuery, ModelInventoryQueryData {
    /// Optional authorized project context for private source access.
    project_id: Option<ProjectId>,
    /// Opaque stable inventory continuation.
    after: Option<ActorId>,
    /// Bounded page size.
    limit: Counter,
    /// Original publisher filter.
    publisher: Option<ActorId>,
    /// Hosting/source filter.
    host: Option<ActorId>,
    /// Optional integrity-state filter, independent of byte completion.
    verification: Option<ModelVerification>,
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
ModelInventoryItem, ModelInventoryItemData {
    /// Stable service-owned inventory identity.
    inventory_id: ActorId,
    /// Pinned publisher/host/revision/license/source provenance.
    model: ironloom_models::factory::ModelCard,
    /// Associated resumable transfer, if one exists.
    download_id: Option<ActorId>,
    /// Owned transfer completion, not inferred solely from matching byte counters.
    transfer_complete: bool,
    /// Independent server-owned integrity state.
    verification: ModelVerification,
    /// Checkpoint file-hash manifest, not repository revision or engine identity.
    verified_manifest_hash: Option<ActorId>,
    /// Time of successful verification; unavailable for pending/failed state.
    verified_at_ms: Option<Counter>,
    /// Current shared model files are available; metadata remains when storage is unavailable.
    storage_available: bool,
} |value| {
    let _ = value;
    let verified = value.verification == ModelVerification::Verified;
    if verified && !value.transfer_complete {
        return Err(ValidationErrors::field(
            "transfer_complete",
            "verification_requires_completed_transfer",
        ));
    }
    if verified != value.verified_manifest_hash.is_some()
        || verified != value.verified_at_ms.is_some()
    {
        return Err(ValidationErrors::field(
            "verified_manifest_hash",
            "verification_manifest_required_only",
        ));
    }
    if let Some(time) = value.verified_at_ms {
        positive("verified_at_ms", time)?;
    }
    Ok(())
}
}
ironloom_core::contract! {
/// Validated factory record.
ModelInventoryPage, ModelInventoryPageData {
    /// Authorized inventory records, including unavailable or unverified entries.
    models: Vec<ModelInventoryItem>,
    /// Next inventory continuation; None means exhausted.
    next_after: Option<ActorId>,
} |value| {
    let _ = value;
    if value.models.len() > MAX_SESSION_PAGE as usize {
        return Err(ValidationErrors::field("models", "page_too_large"));
    }
    let unique = value
        .models
        .iter()
        .map(|model| &model.inventory_id)
        .collect::<std::collections::BTreeSet<_>>();
    if unique.len() != value.models.len() {
        return Err(ValidationErrors::field("models", "duplicate_inventory_id"));
    }
    Ok(())
}
}

ironloom_core::contract! {
/// Current editable role template; active assignments read their separately persisted copies.
InstructionTemplate, InstructionTemplateData {
    /// Stable configured template identity.
    instruction_id: InstructionId,
    /// None for installation templates; Some for project-owned templates.
    project_id: Option<ProjectId>,
    /// Current template revision, independent from each assignment copy revision.
    revision: Counter,
    /// Effective role instructions; never provider credentials.
    content: String,
} |value| {
    positive("revision", value.revision)?;
    required("content", &value.content)
}
}
ironloom_core::contract! {
/// Authorized effective template discovery.
InstructionQuery, InstructionQueryData {
    /// Requested installation/project scope.
    project_id: Option<ProjectId>,
    /// Exclusive stable identity cursor.
    after: Option<InstructionId>,
    /// Bounded page size.
    limit: Counter,
} |value| {
    positive("limit", value.limit)?;
    if value.limit.get() > MAX_SESSION_PAGE {
        return Err(ValidationErrors::field("limit", "page_too_large"));
    }
    Ok(())
}
}
ironloom_core::contract! {
/// Effective templates with stable pagination.
InstructionPage, InstructionPageData {
    /// Authorized installation/project templates with globally unique identities.
    instructions: Vec<InstructionTemplate>,
    /// Continuation identity, absent when exhausted.
    next_after: Option<InstructionId>,
} |value| {
    if value.instructions.len() > MAX_SESSION_PAGE as usize {
        return Err(ValidationErrors::field("instructions", "page_too_large"));
    }
    let ids = value
        .instructions
        .iter()
        .map(|template| &template.instruction_id)
        .collect::<std::collections::BTreeSet<_>>();
    if ids.len() != value.instructions.len() {
        return Err(ValidationErrors::field(
            "instructions",
            "duplicate_instruction",
        ));
    }
    Ok(())
}
}
ironloom_core::contract! {
/// Explicit template edit and active-work propagation choice, not dynamic lesson context policy.
InstructionCommand, InstructionCommandData {
    /// Durable authenticated actor-scoped command identity.
    command_id: CommandId,
    /// Owning project scope, or None for an installation template.
    project_id: Option<ProjectId>,
    /// Edited template identity.
    instruction_id: InstructionId,
    /// Compare-and-swap template revision; zero creates a new custom template.
    expected_revision: Counter,
    /// New effective template content.
    content: String,
    /// Required explicit decision about already-copied active work.
    active_update: ironloom_process_graph::factory::ActiveInstructionUpdate,
    /// Exact active assignments whose copies may change; separately authorized on the server.
    assignments: Vec<AssignmentId>,
} |value| {
    required("content", &value.content)?;
    let update = value.active_update
        == ironloom_process_graph::factory::ActiveInstructionUpdate::UpdateSelectedCopies;
    if update == value.assignments.is_empty() {
        return Err(ValidationErrors::field(
            "assignments",
            "active_update_selection_mismatch",
        ));
    }
    let ids = value
        .assignments
        .iter()
        .collect::<std::collections::BTreeSet<_>>();
    if ids.len() != value.assignments.len() {
        return Err(ValidationErrors::field(
            "assignments",
            "duplicate_assignment",
        ));
    }
    Ok(())
}
}
