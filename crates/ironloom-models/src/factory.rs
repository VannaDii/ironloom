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
ironloom_core::contract! {
/// Validated factory record.
InferenceRequest, InferenceRequestData {
    /// Isolated request identity, distinct from resident model.
    inference_id: InferenceId,
    /// Approved assignment.
    assignment_id: AssignmentId,
    /// Authorized caller.
    worker_id: WorkerId,
    /// Explicit model and placement.
    selection: ModelSelection,
    /// Independent generation safety bounds.
    controls: GenerationControls,
    /// Focused authorized conversation context.
    messages: Vec<String>,
    /// Permitted tool names; adapter never executes tools.
    tool_names: Vec<ActorId>,
} |value| {
    let _ = value;
    if value.messages.is_empty() {
        return Err(ValidationErrors::field("messages", "required"));
    }
    for message in &value.messages {
        required("messages", message)?;
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
    draft_models: bool,
    /// Request-scoped cache support.
    context_cache: bool,
    /// Concurrent request capability.
    batching: bool,
    /// Coordinated placements supported.
    multi_gpu: bool,
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
