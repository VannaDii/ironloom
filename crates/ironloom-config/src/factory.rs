//! Shared software factory contracts.
use ironloom_core::validation::{ValidationErrors, required};
use ironloom_core::{ActorId, CredentialId, DeviceId, InstructionId, ModelProfileId};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// Explicit HTTP protocol selection; a failed request never selects another dialect.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ProviderDialect {
    /// Responses streaming API, including explicitly selected eligible account inference.
    Responses,
    /// Anthropic Messages API.
    Anthropic,
    /// Explicitly configured OpenAI-compatible Chat Completions API.
    ChatCompletions,
}
ironloom_core::contract! {
/// Human-configured endpoint metadata. Credentials remain separate protected references.
ProviderEndpoint, ProviderEndpointData {
    /// Unique provider identity matched by model profiles and every dispatched request.
    provider: ActorId,
    /// API base without embedded credentials, query or fragment.
    base: String,
    /// Explicit wire dialect, independent from billing.
    dialect: ProviderDialect,
    /// Authorized account/API billing choice; local engines are configured separately.
    billing: ironloom_observability::factory::BillingMode,
    /// Declared streaming support, without a capability probe.
    streaming: bool,
    /// Declared tool-call support; adapters do not execute tools.
    tools: bool,
    /// Declared support for reported usage in the stream.
    stream_usage: bool,
    /// Supported explicit reasoning effort labels; empty means unsupported.
    reasoning_efforts: Vec<ActorId>,
} |value| {
    let base=url::Url::parse(&value.base).map_err(|_|ValidationErrors::field("base","invalid_api_base"))?;
    let local=base.host_str().is_some_and(|host| host=="localhost" || host.trim_matches(['[',']']).parse::<std::net::IpAddr>().is_ok_and(|ip|ip.is_loopback()));
    if base.host_str().is_none() || !(base.scheme()=="https" || (base.scheme()=="http" && local))
        || !base.username().is_empty() || base.password().is_some() || base.query().is_some() || base.fragment().is_some() {
        return Err(ValidationErrors::field("base","invalid_api_base"));
    }
    use ironloom_observability::factory::BillingMode;
    if value.billing==BillingMode::LocalEstimate || (value.dialect==ProviderDialect::Anthropic && value.billing!=BillingMode::ApiKey) {
        return Err(ValidationErrors::field("billing","unsupported_endpoint_billing"));
    }
    if value.billing==BillingMode::Account && (value.dialect!=ProviderDialect::Responses || base.as_str()!="https://chatgpt.com/backend-api/codex/" || !value.streaming) {
        return Err(ValidationErrors::field("billing","unsupported_account_endpoint"));
    }
    if value.reasoning_efforts.iter().collect::<std::collections::BTreeSet<_>>().len()!=value.reasoning_efforts.len() {
        return Err(ValidationErrors::field("reasoning_efforts","duplicate_effort"));
    }
    Ok(())
}
}
/// Exactly one explicit source access choice. Absence is not anonymous consent.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "type",
    content = "credential_id",
    rename_all = "snake_case",
    deny_unknown_fields
)]
pub enum SourceAccountAccess {
    /// Explicit anonymous access, supported only where the selected source permits it.
    Anonymous,
    /// Live-authorized credential use, resolved only inside trusted service wiring.
    Credential(CredentialId),
}
ironloom_core::contract! {
/// Scoped source-host access configuration; publisher identity is independent of hosting.
SourceAccountBinding, SourceAccountBindingData {
    /// Stable adapter host identity, not a browser-supplied credential endpoint.
    host: ActorId,
    /// Explicit anonymous or credential reference choice.
    access: SourceAccountAccess,
} |value| { let _=value; Ok(()) }
}
/// Required explicit setup choice; no implicit default.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum LessonHandling {
    /// Share new lessons only with sufficient share authority.
    ShareAcrossProjects,
    /// Apply immediately in origin project; no broader sharing.
    ProjectOnly,
    /// Apply immediately in origin; retain for later promotion or pruning.
    TrackForReview,
}
ironloom_core::contract! {
/// Validated factory record.
FactorySetup, FactorySetupData {
    /// Explicitly saved lesson handling choice.
    lesson_handling: LessonHandling,
    /// Human explicitly confirmed delivery authority.
    delivery_confirmed: bool,
    /// Confirmed permission to publish a branch and PR.
    publish_branch: bool,
    /// Explicit merge authority.
    merge: bool,
    /// Explicit deployment authority.
    deploy: bool,
} |value| {
    let _ = value;
    if !value.delivery_confirmed {
        return Err(ValidationErrors::field(
            "delivery_confirmed",
            "confirmation_required",
        ));
    }
    Ok(())
}
}
ironloom_core::contract! {
/// Validated factory record.
StorageRoots, StorageRootsData {
    /// Infrastructure-selected persistent model root.
    models: String,
    /// Persistent complete projects/Git root.
    projects: String,
    /// Used only by the designated managed PostgreSQL owner.
    managed_database: Option<String>,
} |value| {
    let _ = value;
    required("models", &value.models)?;
    required("projects", &value.projects)?;
    if value.models == value.projects
        || value
            .managed_database
            .as_ref()
            .is_some_and(|root| root == &value.models || root == &value.projects)
    {
        return Err(ValidationErrors::field("projects", "roots_must_differ"));
    }
    if let Some(root) = &value.managed_database {
        required("managed_database", root)?;
    }
    Ok(())
}
}
ironloom_core::contract! {
/// Validated factory record.
RoleConfiguration, RoleConfigurationData {
    /// Editable standard or custom role identity.
    role_id: ActorId,
    /// Disabled roles do not dispatch.
    enabled: bool,
    /// Explicit human-selected model; no implicit default.
    model_profile_id: Option<ModelProfileId>,
    /// Selected model supports reasoning effort.
    reasoning_applicable: bool,
    /// Explicit human choice where applicable.
    reasoning_effort: Option<ActorId>,
    /// Optional role device restrictions, intersected with its model profile placement.
    device_bindings: Vec<DeviceId>,
    /// Template copied into assignments.
    instructions_id: InstructionId,
} |value| {
    let _ = value;
    if value.enabled && value.model_profile_id.is_none() {
        return Err(ValidationErrors::field(
            "model_profile_id",
            "explicit_model_required",
        ));
    }
    if value.enabled && value.reasoning_applicable && value.reasoning_effort.is_none() {
        return Err(ValidationErrors::field(
            "reasoning_effort",
            "explicit_effort_required",
        ));
    }
    if !value.reasoning_applicable && value.reasoning_effort.is_some() {
        return Err(ValidationErrors::field(
            "reasoning_effort",
            "unsupported_effort",
        ));
    }
    Ok(())
}
}
ironloom_core::contract! {
/// Validated factory record.
ModelProfileConfiguration, ModelProfileConfigurationData {
    /// Stable human-selected profile identity.
    profile_id: ModelProfileId,
    /// Explicit provider; no silent substitute.
    provider: ActorId,
    /// Configured provider model/checkpoint.
    model_id: ActorId,
    /// Explicit generation bounds, independent of optional monetary budgets.
    generation_controls: ironloom_models::factory::GenerationControls,
    /// Private credential reference; separate use/share/replace/delete grants.
    credential_id: Option<CredentialId>,
    /// Explicit account/API/local estimate billing choice.
    billing: ironloom_observability::factory::BillingMode,
    /// Explicit local engine/version/backend; no default engine fallback.
    engine: Option<ironloom_models::factory::EngineIdentity>,
    /// Explicit verified installation/file/options selection for local execution. None retains
    /// incomplete configuration and blocks local readiness; no first-file selection is inferred.
    local_binding: Option<LocalModelBinding>,
    /// Desired configured local devices; discovery and admission recheck identity.
    device_bindings: Vec<DeviceId>,
} |value| {
    let _ = value;
    let local = value.engine.is_some();
    if !local && value.local_binding.is_some() {
        return Err(ValidationErrors::field("local_binding","local_engine_required"));
    }
    if local != (value.billing == ironloom_observability::factory::BillingMode::LocalEstimate) {
        return Err(ValidationErrors::field(
            "billing",
            "engine_billing_mismatch",
        ));
    }
    if !local && !value.device_bindings.is_empty() {
        return Err(ValidationErrors::field(
            "device_bindings",
            "remote_placement_forbidden",
        ));
    }
    let unique = value
        .device_bindings
        .iter()
        .collect::<std::collections::BTreeSet<_>>();
    if unique.len() != value.device_bindings.len() {
        return Err(ValidationErrors::field(
            "device_bindings",
            "duplicate_device",
        ));
    }
    Ok(())
}
}
ironloom_core::contract! {
/// Exact human-selected files and load controls for one immutable local inventory identity.
LocalModelBinding, LocalModelBindingData {
    /// Service-owned pinned inventory identity; runtime rechecks integrity and source access.
    inventory_id: ActorId,
    /// Exact weight files relative to that installation root, including every selected shard.
    weights: Vec<String>,
    /// Explicit tokenizer, or None when embedded/not applicable.
    tokenizer: Option<String>,
    /// Explicit template, or None when embedded/not applicable.
    template: Option<String>,
    /// Explicit context/concurrency/draft/cache/accelerator settings; unsupported remains visible.
    options: ironloom_models::factory::EngineLoadOptions,
} |value| {
    if value.weights.is_empty() { return Err(ValidationErrors::field("weights","weight_files_required")); }
    if value.weights.iter().collect::<std::collections::BTreeSet<_>>().len()!=value.weights.len() {
        return Err(ValidationErrors::field("weights","duplicate_file"));
    }
    for (index,path) in value.weights.iter().enumerate() {
        ironloom_models::factory::validate_model_file_path(&format!("weights.{index}"),path)?;
    }
    if let Some(path)=&value.tokenizer {ironloom_models::factory::validate_model_file_path("tokenizer",path)?;}
    if let Some(path)=&value.template {ironloom_models::factory::validate_model_file_path("template",path)?;}
    Ok(())
}
}
ironloom_core::contract! {
/// Validated factory record.
DevicePreference, DevicePreferenceData {
    /// Desired canonical device, resolved against service discovery records.
    device_id: DeviceId,
    /// Explicit operator enable/disable choice; never capacity authority.
    enabled: bool,
} |value| {
    let _ = value;
    Ok(())
}
}

ironloom_core::contract! {
/// Infrastructure-selected hard transfer bounds, independent from publisher metadata.
DownloadLimits, DownloadLimitsData {
    /// Maximum bytes for one file, including an unknown-length streaming response.
    per_file_bytes: ironloom_core::Counter,
    /// Maximum aggregate bytes for one transfer across all its files.
    per_transfer_bytes: ironloom_core::Counter,
} |value| {
    ironloom_core::validation::positive("per_file_bytes", value.per_file_bytes)?;
    ironloom_core::validation::positive("per_transfer_bytes", value.per_transfer_bytes)
}
}
