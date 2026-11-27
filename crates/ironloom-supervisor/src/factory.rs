//! Shared software factory contracts.
use ironloom_core::validation::positive;
use ironloom_core::*;
ironloom_core::contract! {
/// Validated factory record.
DispatchAuthority, DispatchAuthorityData {
    /// Approved assignment.
    assignment_id: AssignmentId,
    /// Delegated worker.
    worker_id: WorkerId,
    /// Authorizing human.
    operator_id: OperatorId,
    /// Must match current approved plan revision.
    plan_revision: Counter,
    /// Copied and acknowledged at next decision boundary.
    instruction_revision: Counter,
    /// Current workspace owner fence.
    claim_fence: Counter,
    /// Most recent budget, independently editable.
    budget_revision: Counter,
    /// Current shared OpenFGA model revision.
    authorization_model: ActorId,
} |value| {
    let _ = value;
    positive("plan_revision", value.plan_revision)?;
    positive("instruction_revision", value.instruction_revision)?;
    positive("claim_fence", value.claim_fence)?;
    positive("budget_revision", value.budget_revision)
}
}
