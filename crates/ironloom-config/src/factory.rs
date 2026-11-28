//! Shared software factory contracts.
use ironloom_core::validation::{ValidationErrors, required};
use ironloom_core::{ActorId, CredentialId, DeviceId, InstructionId, ModelProfileId};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
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
    /// Desired configured local devices; discovery and admission recheck identity.
    device_bindings: Vec<DeviceId>,
} |value| {
    let _ = value;
    let local = value.engine.is_some();
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
