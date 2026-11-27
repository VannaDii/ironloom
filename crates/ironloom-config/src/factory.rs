//! Shared software factory contracts.
use ironloom_core::validation::{ValidationErrors, required};
use ironloom_core::{ActorId, InstructionId, ModelProfileId};
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
