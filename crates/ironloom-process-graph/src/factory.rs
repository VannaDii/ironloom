//! Shared software factory contracts.
use ironloom_core::validation::{ValidationErrors, positive, required};
use ironloom_core::*;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
ironloom_core::contract! {
/// Validated factory record.
PlanApproval, PlanApprovalData {
    /// Approved plan.
    plan_id: PlanId,
    /// Exact revision.
    revision: Counter,
    /// Hash of approved scope and permissions.
    content_hash: ActorId,
    /// Authenticated approver; recheck grant on dispatch.
    approved_by: OperatorId,
} |value| {
    let _ = value;
    positive("revision", value.revision)
}
}
ironloom_core::contract! {
/// Validated factory record.
InstructionCopy, InstructionCopyData {
    /// Copied template identity.
    instruction_id: InstructionId,
    /// Owning assignment storage.
    assignment_id: AssignmentId,
    /// Applied copy revision.
    revision: Counter,
    /// Revision consumed at worker decision boundary; zero means none.
    acknowledged_revision: Counter,
    /// Effective copied instructions.
    content: String,
} |value| {
    let _ = value;
    positive("revision", value.revision)?;
    required("content", &value.content)?;
    if value.acknowledged_revision > value.revision {
        return Err(ValidationErrors::field(
            "acknowledged_revision",
            "future_revision",
        ));
    }
    Ok(())
}
}
/// Explicit active instruction update choice, separate from immediate lesson propagation.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ActiveInstructionUpdate {
    /// No: template affects new work only.
    PreserveCopies,
    /// Yes: persist selected copies and notify affected workers.
    UpdateSelectedCopies,
}
ironloom_core::contract! {
/// Validated factory record.
PlanRevision, PlanRevisionData {
    /// Stable plan identity.
    plan_id: PlanId,
    /// Specific immutable revision.
    revision: Counter,
    /// Authority scope.
    project_id: ProjectId,
    /// Human-readable approved work scope.
    scope: String,
    /// Visible unanswered assumptions.
    assumptions: Vec<String>,
    /// Content-specific validation expectations.
    acceptance_criteria: Vec<String>,
    /// Canonical hash including model assignments and permissions.
    content_hash: ActorId,
    /// Human-selected configured role profiles.
    model_assignments: Vec<ModelProfileId>,
    /// Explicit versioned operation scope, checked by policy.
    allowed_permissions: Vec<ActorId>,
} |value| {
    let _ = value;
    positive("revision", value.revision)?;
    required("scope", &value.scope)?;
    if value.acceptance_criteria.is_empty() {
        return Err(ValidationErrors::field("acceptance_criteria", "required"));
    }
    for criterion in &value.acceptance_criteria {
        required("acceptance_criteria", criterion)?;
    }
    Ok(())
}
}
