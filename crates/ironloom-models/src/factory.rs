//! Shared software factory contracts.
use ironloom_core::validation::{ValidationErrors, positive, required};
use ironloom_core::*;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
ironloom_core::contract! {
/// Validated factory record.
EngineIdentity, EngineIdentityData {
    /// Explicit selected engine, never silently substituted.
    name: ActorId,
    /// Pinned version.
    version: ActorId,
    /// Selected accelerator backend.
    backend: ActorId,
    /// Engine configuration identity.
    configuration_hash: ActorId,
} |value| {
    let _ = value;
    Ok(())
}
}
ironloom_core::contract! {
/// Validated factory record.
DeviceIdentity, DeviceIdentityData {
    /// Canonical capacity pool identity reconciled across views.
    device_id: DeviceId,
    /// Physical host identity distinct from node ID.
    host_id: HostId,
    /// Parent physical GPU for partition/virtual views.
    parent_id: Option<DeviceId>,
    /// Vendor UUID or reconciled host-scoped hardware identity.
    hardware_key: ActorId,
    /// False blocks admission; ordinals never establish identity.
    reconciled: bool,
} |value| {
    let _ = value;
    if value.parent_id.as_ref() == Some(&value.device_id) {
        return Err(ValidationErrors::field("parent_id", "self_parent"));
    }
    Ok(())
}
}
ironloom_core::contract! {
/// Validated factory record.
ModelSelection, ModelSelectionData {
    /// Human-selected profile.
    profile_id: ModelProfileId,
    /// Explicit provider identity, including local engine providers.
    provider: ActorId,
    /// Selected billing basis, independent of remote control authentication.
    billing: ironloom_observability::factory::BillingMode,
    /// Provider model or local checkpoint identity.
    model_id: ActorId,
    /// Exact weights revision if available.
    revision: Option<ActorId>,
    /// Local quantization.
    quantization: Option<ActorId>,
    /// Verified checkpoint manifest hash; not repository revision.
    checkpoint_hash: Option<ActorId>,
    /// Required for local; absent for remote.
    engine: Option<EngineIdentity>,
    /// Opaque credential reference only.
    credential_id: Option<CredentialId>,
    /// Human-selected where applicable.
    reasoning_effort: Option<ActorId>,
    /// Selected placement; no capacity summation assumption.
    devices: Vec<DeviceIdentity>,
} |value| {
    let _ = value;
    if value.engine.is_some() {
        if value.billing != ironloom_observability::factory::BillingMode::LocalEstimate {
            return Err(ValidationErrors::field("billing", "local_billing_required"));
        }
        if value.devices.is_empty() {
            return Err(ValidationErrors::field(
                "devices",
                "local_placement_required",
            ));
        }
        if value.devices.iter().any(|device| !device.reconciled) {
            return Err(ValidationErrors::field("devices", "identity_unresolved"));
        }
        let unique = value
            .devices
            .iter()
            .map(|device| &device.device_id)
            .collect::<std::collections::BTreeSet<_>>();
        if unique.len() != value.devices.len() {
            return Err(ValidationErrors::field("devices", "duplicate_device"));
        }
        if value.devices.iter().any(|device| {
            device
                .parent_id
                .as_ref()
                .is_some_and(|parent| unique.contains(parent))
        }) {
            return Err(ValidationErrors::field(
                "devices",
                "overlapping_parent_placement",
            ));
        }
        if value.revision.is_none() || value.checkpoint_hash.is_none() {
            return Err(ValidationErrors::field(
                "checkpoint_hash",
                "local_provenance_required",
            ));
        }
    } else if value.billing == ironloom_observability::factory::BillingMode::LocalEstimate {
        return Err(ValidationErrors::field(
            "billing",
            "remote_billing_required",
        ));
    } else if !value.devices.is_empty() {
        return Err(ValidationErrors::field(
            "devices",
            "remote_placement_forbidden",
        ));
    }
    Ok(())
}
}
ironloom_core::contract! {
/// Validated factory record.
GenerationControls, GenerationControlsData {
    /// Generation bound independent of monetary budget.
    max_output_tokens: Counter,
    /// Runaway bound.
    max_duration_ms: Counter,
    /// Incremental monitoring window; unavailable on nonstreaming engines.
    repetition_window: Counter,
} |value| {
    let _ = value;
    positive("max_output_tokens", value.max_output_tokens)?;
    positive("max_duration_ms", value.max_duration_ms)?;
    positive("repetition_window", value.repetition_window)
}
}
/// Provider-neutral conversation message role.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum MessageRole {
    /// Service-controlled system context.
    System,
    /// Authorized role instructions.
    Developer,
    /// Human input.
    User,
    /// Model text and/or proposed tool calls.
    Assistant,
    /// Gateway-produced result for one prior tool call.
    Tool,
}
ironloom_core::contract! {
/// Validated factory record.
ToolDefinition, ToolDefinitionData {
    /// Authorized tool name, never an alternate execution channel.
    name: ActorId,
    /// Tool purpose visible to the model.
    description: String,
    /// JSON Schema object for arguments; the gateway compiles/checks it before dispatch.
    input_schema: serde_json::Value,
} |value| {
    let _ = value;
    required("description", &value.description)?;
    if !value.input_schema.is_object()
        || value
            .input_schema
            .get("type")
            .and_then(serde_json::Value::as_str)
            != Some("object")
    {
        return Err(ValidationErrors::field(
            "input_schema",
            "object_schema_required",
        ));
    }
    Ok(())
}
}
ironloom_core::contract! {
/// Validated factory record.
ToolInvocation, ToolInvocationData {
    /// Stable correlation identity; shared with its result.
    tool_call_id: ToolCallId,
    /// Proposed tool name, independently authorized at dispatch.
    name: ActorId,
    /// Complete parsed arguments; partial streaming fragments never enter this model.
    arguments: serde_json::Value,
} |value| {
    let _ = value;
    if !value.arguments.is_object() {
        return Err(ValidationErrors::field("arguments", "object_required"));
    }
    Ok(())
}
}
/// Observed tool outcome, not an inference cancellation acknowledgment.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ToolResultStatus {
    /// Tool completed successfully.
    Succeeded,
    /// Tool failed; content is a redacted error/result.
    Failed,
}
ironloom_core::contract! {
/// Validated factory record.
ToolResult, ToolResultData {
    /// Previously requested tool call.
    tool_call_id: ToolCallId,
    /// Observed completion outcome.
    status: ToolResultStatus,
    /// Tool output; an empty output is valid.
    content: String,
} |value| {
    let _ = value;
    Ok(())
}
}
ironloom_core::contract! {
/// Validated factory record.
InferenceMessage, InferenceMessageData {
    /// Provider-independent role.
    role: MessageRole,
    /// Optional nonblank text; tool-only assistant messages need no text.
    text: Option<String>,
    /// Complete assistant-proposed tool calls, never directly executed by adapters.
    tool_calls: Vec<ToolInvocation>,
    /// One result when role is tool.
    tool_result: Option<ToolResult>,
} |value| {
    let _ = value;
    if let Some(text) = &value.text {
        required("text", text)?;
    }
    if value.role == MessageRole::Tool {
        if value.tool_result.is_none() || value.text.is_some() || !value.tool_calls.is_empty() {
            return Err(ValidationErrors::field(
                "tool_result",
                "tool_result_only_required",
            ));
        }
    } else {
        if value.tool_result.is_some() {
            return Err(ValidationErrors::field("tool_result", "tool_role_required"));
        }
        if !value.tool_calls.is_empty() && value.role != MessageRole::Assistant {
            return Err(ValidationErrors::field(
                "tool_calls",
                "assistant_role_required",
            ));
        }
        if value.text.is_none() && value.tool_calls.is_empty() {
            return Err(ValidationErrors::field("text", "message_content_required"));
        }
    }
    Ok(())
}
}
ironloom_core::contract! {
/// Validated factory record.
InferenceRequest, InferenceRequestData {
    /// Isolated request identity, distinct from resident model.
    inference_id: InferenceId,
    /// Approved assignment.
    assignment_id: AssignmentId,
    /// Authorized worker.
    worker_id: WorkerId,
    /// Target turn for streamed progress and cancellation correlation.
    turn_id: TurnId,
    /// Target assistant item, stable across stream fragments.
    item_id: ItemId,
    /// Explicit selected provider/model/billing/placement.
    selection: ModelSelection,
    /// Independent generation bounds.
    controls: GenerationControls,
    /// Optional local draft/cache/context/accelerator request, rejected on remote selections.
    engine_options: Option<EngineLoadOptions>,
    /// Ordered role-bearing context including prior tool calls/results.
    messages: Vec<InferenceMessage>,
    /// Currently authorized tool schemas; adapters never execute these tools.
    tools: Vec<ToolDefinition>,
} |value| {
    let _ = value;
    if value.engine_options.is_some() && value.selection.engine.is_none() {
        return Err(ValidationErrors::field(
            "engine_options",
            "local_engine_required",
        ));
    }
    if value.messages.is_empty() {
        return Err(ValidationErrors::field("messages", "required"));
    }
    let names = value
        .tools
        .iter()
        .map(|tool| &tool.name)
        .collect::<std::collections::BTreeSet<_>>();
    if names.len() != value.tools.len() {
        return Err(ValidationErrors::field("tools", "duplicate_tool"));
    }
    let mut seen = std::collections::BTreeSet::new();
    let mut pending = std::collections::BTreeSet::new();
    for (index, message) in value.messages.iter().enumerate() {
        if !pending.is_empty() && message.role != MessageRole::Tool {
            return Err(ValidationErrors::field(
                format!("messages.{index}"),
                "tool_results_required",
            ));
        }
        for call in &message.tool_calls {
            if !seen.insert(&call.tool_call_id) {
                return Err(ValidationErrors::field(
                    format!("messages.{index}.tool_calls"),
                    "duplicate_tool_call",
                ));
            }
            pending.insert(&call.tool_call_id);
        }
        if let Some(result) = &message.tool_result
            && !pending.remove(&result.tool_call_id)
        {
            return Err(ValidationErrors::field(
                format!("messages.{index}.tool_result.tool_call_id"),
                "unmatched_tool_result",
            ));
        }
    }
    if !pending.is_empty() {
        return Err(ValidationErrors::field("messages", "tool_results_required"));
    }
    Ok(())
}
}
ironloom_core::contract! {
/// Validated factory record.
Residency, ResidencyData {
    /// Reusable loaded weights identity.
    resident_id: ResidentModelId,
    /// Checkpoint/quantization/engine/placement identity.
    selection: ModelSelection,
    /// Optional resident draft weights, included in central reservation and residency identity.
    draft: Option<DraftModel>,
    /// Observed isolated cache allocation, unknown when unavailable.
    observed_cache_bytes: Option<Counter>,
    /// Protects residency while nonzero, independent of worker lifetime.
    active_requests: Counter,
    /// LRU ordering when inactive.
    last_used_at_ms: Counter,
    /// Weights, caches, draft and overhead reservation.
    reserved_bytes: Counter,
} |value| {
    let _ = value;
    if value.selection.engine.is_none() {
        return Err(ValidationErrors::field(
            "selection.engine",
            "local_engine_required",
        ));
    }
    positive("reserved_bytes", value.reserved_bytes)
}
}
impl ResidencyData {
    /// Idle workers and tool waits do not protect loaded weights from eviction.
    pub fn eviction_eligible(&self) -> bool {
        self.active_requests == 0
    }
}
/// Separate from compatibility and estimated fit.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum BackendQualification {
    /// No hardware execution qualification.
    Unqualified,
    /// Qualified only on recorded hardware/backend/version.
    Qualified,
}
/// Adapter lifecycle operation; central service owns admission and LRU.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum EngineOperation {
    /// Static discovery without warm-up or inference probes.
    Capabilities,
    /// Reserve first; load optional draft with target.
    Load,
    /// Reuse weights with isolated request/session state.
    Reuse,
    /// Release memory while retaining downloaded weights.
    Unload,
    /// Request scoped cancellation; confirmation is separate.
    CancelRequest,
    /// Observe memory and external pressure.
    ObserveResources,
    /// Reconcile requests and capacity before reuse.
    Restart,
}
/// Source access distinct from compatibility/fit/qualification.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum SourceAccess {
    /// Download permitted subject to current access recheck.
    Accessible,
    /// Connect source account.
    AuthenticationRequired,
    /// Human follows repository link to request access.
    TermsRequired,
    /// Recheck access; download stays disabled.
    AwaitingApproval,
    /// Access denied or revoked.
    Denied,
}
ironloom_core::contract! {
/// Validated factory record.
ModelSource, ModelSourceData {
    /// Original publisher distinct from host.
    publisher: ActorId,
    /// Hosting hub/distribution.
    host: ActorId,
    /// Human access and license page.
    repository_url: String,
    /// Exact source revision.
    revision: ActorId,
    /// Verified download/manifest hash.
    checksum: Option<ActorId>,
    /// Current source-specific access.
    access: SourceAccess,
    /// License metadata; not automatic acceptance.
    license: Option<ActorId>,
} |value| {
    let _ = value;
    let url = url::Url::parse(&value.repository_url)
        .map_err(|_| ValidationErrors::field("repository_url", "invalid_url"))?;
    if url.scheme() != "https"
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(ValidationErrors::field(
            "repository_url",
            "https_without_credentials_required",
        ));
    }
    Ok(())
}
}
ironloom_core::contract! {
/// Validated factory record.
DownloadProgress, DownloadProgressData {
    /// Pinned provenance.
    source: ModelSource,
    /// Authorized repository binding for resumable transfer commands.
    repository_id: ActorId,
    /// Stable resumable download identity.
    download_id: ActorId,
    /// Persisted verified byte progress.
    received_bytes: Counter,
    /// Absent when unavailable.
    total_bytes: Option<Counter>,
    /// Protected resumable transport state, not a secret on wire.
    resume_token_ref: Option<CredentialId>,
    /// Request is not stopped confirmation.
    cancel_requested: bool,
    /// Confirmed owned transfer termination.
    terminated: bool,
} |value| {
    let _ = value;
    if value
        .total_bytes
        .is_some_and(|total| value.received_bytes > total)
    {
        return Err(ValidationErrors::field("received_bytes", "exceeds_total"));
    }
    Ok(())
}
}
ironloom_core::contract! {
/// Validated factory record.
EngineCapabilities, EngineCapabilitiesData {
    /// Selected exact engine/version/backend.
    engine: EngineIdentity,
    /// Supported model architectures.
    architectures: Vec<ActorId>,
    /// Supported weight formats.
    formats: Vec<ActorId>,
    /// Supported quantizations.
    quantizations: Vec<ActorId>,
    /// Incremental output available.
    streaming: bool,
    /// Tool-call generation supported; never execution.
    tools: bool,
    /// Speculative decoding with explicit paired requirements.
    draft_models: CapabilitySupport,
    /// Request-scoped cache support.
    context_cache: CapabilitySupport,
    /// Concurrent request capability.
    batching: CapabilitySupport,
    /// Coordinated placements supported.
    multi_gpu: CapabilitySupport,
    /// Additional accelerator requirements.
    accelerators: Vec<ActorId>,
    /// Known hard context bound; None is unknown.
    max_context_tokens: Option<Counter>,
} |value| {
    let _ = value;
    Ok(())
}
}
/// Static engine compatibility independent of memory estimates.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum Compatibility {
    /// Engine/version/model requirements match.
    Supported,
    /// Known incompatibility with explanation.
    Unsupported,
    /// Metadata insufficient; no inference probe.
    Unknown,
}
ironloom_core::contract! {
/// Validated factory record.
ModelFit, ModelFitData {
    /// Engine/model compatibility.
    compatibility: Compatibility,
    /// Weights, KV/cache, draft, overhead and concurrency assumptions.
    estimated_bytes: Option<Counter>,
    /// None means unknown; no automatic model change.
    fits_after_idle_eviction: Option<bool>,
    /// Hardware qualification separate from estimates.
    qualification: BackendQualification,
    /// Visible constraints and estimate assumptions.
    reason: String,
} |value| {
    let _ = value;
    required("reason", &value.reason)
}
}

/// Explicit optional capability status; unknown is distinct from unsupported.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum CapabilitySupport {
    /// Supported by this engine/version/backend.
    Supported,
    /// Known absent; do not invent an adaptation.
    Unsupported,
    /// Insufficient metadata; no inference capability probe.
    Unknown,
}
ironloom_core::contract! {
/// Validated factory record.
SourceQuery, SourceQueryData {
    /// Search text; empty text browses the source catalog.
    query: String,
    /// Optional original publisher filter.
    publisher: Option<ActorId>,
    /// Optional hosting source filter, distinct from publisher.
    host: Option<ActorId>,
    /// Opaque source continuation token scoped to this query and account.
    after: Option<ActorId>,
    /// Bounded discovery page size.
    limit: Counter,
} |value| {
    let _ = value;
    positive("limit", value.limit)?;
    if value.limit.get() > MAX_SOURCE_PAGE {
        return Err(ValidationErrors::field("limit", "page_too_large"));
    }
    Ok(())
}
}
ironloom_core::contract! {
/// Validated factory record.
ModelCard, ModelCardData {
    /// Stable source repository identity used by metadata/download operations.
    repository_id: ActorId,
    /// Model identity within its source.
    model_id: ActorId,
    /// Publisher/host/revision/license/access provenance.
    source: ModelSource,
    /// Unknown when unavailable.
    architecture: Option<ActorId>,
    /// Known weights format.
    format: Option<ActorId>,
    /// Known weight quantization.
    quantization: Option<ActorId>,
    /// Download/weights size when known.
    weight_bytes: Option<Counter>,
    /// Source-declared context bound when known; not backend qualification.
    context_tokens: Option<Counter>,
} |value| {
    let _ = value;
    Ok(())
}
}
ironloom_core::contract! {
/// Validated factory record.
SourcePage, SourcePageData {
    /// Bounded source results, without losing provenance or access state.
    models: Vec<ModelCard>,
    /// Opaque continuation token for the same query/account; None ends pagination.
    next_after: Option<ActorId>,
} |value| {
    let _ = value;
    if value.models.len() > MAX_SOURCE_PAGE as usize {
        return Err(ValidationErrors::field("models", "page_too_large"));
    }
    let ids = value
        .models
        .iter()
        .map(|model| (&model.source.host, &model.repository_id, &model.model_id))
        .collect::<std::collections::BTreeSet<_>>();
    if ids.len() != value.models.len() {
        return Err(ValidationErrors::field("models", "duplicate_model"));
    }
    Ok(())
}
}

/// Maximum source discovery page size, independent of provider-specific continuation formats.
pub const MAX_SOURCE_PAGE: u64 = 100;
ironloom_core::contract! {
/// Validated factory record.
DraftModel, DraftModelData {
    /// Explicit optional draft checkpoint, never a fallback target.
    model_id: ActorId,
    /// Exact draft revision.
    revision: ActorId,
    /// Verified draft manifest hash.
    checkpoint_hash: ActorId,
    /// Draft quantization where applicable.
    quantization: Option<ActorId>,
    /// Draft memory estimate; unknown is not zero.
    weight_bytes: Option<Counter>,
} |value| {
    let _ = value;
    Ok(())
}
}
ironloom_core::contract! {
/// Validated factory record.
ContextCache, ContextCacheData {
    /// Request/session-scoped cache identity, separate from resident weights.
    cache_id: ActorId,
    /// Authorized conversation boundary; sharing weights does not share this context.
    conversation_id: ConversationId,
    /// Authorized human scope; resolve independently at dispatch.
    owner: OperatorId,
    /// Configured bound if known.
    capacity_bytes: Option<Counter>,
} |value| {
    let _ = value;
    if let Some(bytes) = value.capacity_bytes {
        positive("capacity_bytes", bytes)?;
    }
    Ok(())
}
}
ironloom_core::contract! {
/// Validated factory record.
EngineLoadOptions, EngineLoadOptionsData {
    /// Explicit optional draft model.
    draft: Option<DraftModel>,
    /// Optional isolated context cache; absence does not imply cross-session reuse.
    cache: Option<ContextCache>,
    /// Configured context demand for estimates/admission.
    context_tokens: Counter,
    /// Configured concurrent demand.
    concurrency: Counter,
    /// Explicit additional accelerators; engine may report unsupported.
    accelerators: Vec<ActorId>,
} |value| {
    let _ = value;
    positive("context_tokens", value.context_tokens)?;
    positive("concurrency", value.concurrency)?;
    let unique = value
        .accelerators
        .iter()
        .collect::<std::collections::BTreeSet<_>>();
    if unique.len() != value.accelerators.len() {
        return Err(ValidationErrors::field(
            "accelerators",
            "duplicate_accelerator",
        ));
    }
    Ok(())
}
}
ironloom_core::contract! {
/// Validated factory record.
EngineLoadRequest, EngineLoadRequestData {
    /// Exact local target, engine/version/configuration and placement.
    selection: ModelSelection,
    /// Draft/cache/context/concurrency/accelerator demand.
    options: EngineLoadOptions,
} |value| {
    let _ = value;
    if value.selection.engine.is_none() {
        return Err(ValidationErrors::field(
            "selection.engine",
            "local_engine_required",
        ));
    }
    Ok(())
}
}
ironloom_core::contract! {
/// Validated factory record.
EngineRequirements, EngineRequirementsData {
    /// Explicit supported/unsupported/unknown result, without inference probing.
    compatibility: Compatibility,
    /// Compatibility constraints and estimate assumptions.
    reason: String,
    /// Target weights estimate.
    target_weight_bytes: Option<Counter>,
    /// Draft weights estimate; unknown is not zero.
    draft_weight_bytes: Option<Counter>,
    /// Context/KV cache estimate.
    cache_bytes: Option<Counter>,
    /// Engine overhead and concurrency demand.
    runtime_overhead_bytes: Option<Counter>,
    /// Additional accelerator demand, when known.
    accelerator_bytes: Option<Counter>,
} |value| {
    let _ = value;
    required("reason", &value.reason)
}
}
impl EngineRequirementsData {
    /// Computes full demand only when every component is known and addition does not overflow.
    /// Absent draft/cache/overhead/accelerator estimates are unknown, never implicit zero.
    pub fn total_bytes(&self) -> Option<Counter> {
        [
            self.target_weight_bytes,
            self.draft_weight_bytes,
            self.cache_bytes,
            self.runtime_overhead_bytes,
            self.accelerator_bytes,
        ]
        .into_iter()
        .try_fold(0_u64, |total, bytes| total.checked_add(bytes?.get()))
        .map(Counter::new)
    }
}
ironloom_core::contract! {
/// Validated factory record.
DeviceResourceObservation, DeviceResourceObservationData {
    /// Canonical device identity, not container ordinal.
    device_id: DeviceId,
    /// Observed capacity; absence is unknown.
    total_bytes: Option<Counter>,
    /// Observed total pressure, including external consumers.
    used_bytes: Option<Counter>,
    /// External pressure if separately known.
    external_used_bytes: Option<Counter>,
    /// Observation timestamp; not a reservation or lease.
    observed_at_ms: Counter,
} |value| {
    let _ = value;
    positive("observed_at_ms", value.observed_at_ms)?;
    if value
        .total_bytes
        .zip(value.used_bytes)
        .is_some_and(|(total, used)| used > total)
    {
        return Err(ValidationErrors::field("used_bytes", "exceeds_capacity"));
    }
    if value
        .used_bytes
        .zip(value.external_used_bytes)
        .is_some_and(|(used, external)| external > used)
    {
        return Err(ValidationErrors::field(
            "external_used_bytes",
            "exceeds_usage",
        ));
    }
    Ok(())
}
}
/// Observed lifecycle; failure alone never proves resources are released.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum EngineState {
    /// Starting under service lifecycle control.
    Starting,
    /// Ready for policy-authorized operations.
    Ready,
    /// Failure observed; prior requests/resources still need reconciliation.
    Failed,
    /// Restart in progress; no new admissions.
    Restarting,
    /// Owned engine execution confirmed stopped.
    Stopped,
}
/// Redacted failure category without provider bodies or secrets.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum EngineFailure {
    /// Engine/helper cannot be reached.
    Unavailable,
    /// Engine/helper failure observed.
    Crashed,
    /// Resource allocation failed.
    ResourceExhausted,
    /// Requested optional operation is unsupported.
    Unsupported,
}
ironloom_core::contract! {
/// Validated factory record.
EngineObservation, EngineObservationData {
    /// Exact observed engine/version/backend.
    engine: EngineIdentity,
    /// Monotonic helper/engine generation; reject stale recovery observations.
    generation: Counter,
    /// Observed lifecycle, independent of individual cancellation requests.
    state: EngineState,
    /// Observation time.
    observed_at_ms: Counter,
    /// Known residents; None means unknown after failure, never empty by assumption.
    residents: Option<Vec<Residency>>,
    /// Known active requests; None requires reconciliation.
    active_inferences: Option<Vec<InferenceId>>,
    /// Canonical device pressure observations, not authority to allocate.
    devices: Vec<DeviceResourceObservation>,
    /// Failure category exactly when state is failed.
    failure: Option<EngineFailure>,
} |value| {
    let _ = value;
    positive("generation", value.generation)?;
    positive("observed_at_ms", value.observed_at_ms)?;
    if (value.state == EngineState::Failed) != value.failure.is_some() {
        return Err(ValidationErrors::field("failure", "failure_state_mismatch"));
    }
    if value.state == EngineState::Stopped
        && value
            .active_inferences
            .as_ref()
            .is_none_or(|active| !active.is_empty())
    {
        return Err(ValidationErrors::field(
            "active_inferences",
            "stopped_requires_empty_confirmed_requests",
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
    Ok(())
}
}
