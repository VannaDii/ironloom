//! Shared software factory contracts.
use ironloom_core::validation::positive;
use ironloom_core::*;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
/// Assignment and worker streaming lifecycle; disconnect is not a transition.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ExecutionState {
    /// Waiting for a fenced dispatch claim.
    Queued,
    /// Actively executing.
    Running,
    /// Durable question or approval is pending.
    WaitingForHuman,
    /// Capacity unavailable; no model fallback.
    WaitingForResources,
    /// Paused at a controllable boundary.
    Paused,
    /// Stop requested; execution may still be active.
    CancellationRequested,
    /// Owned execution confirmed stopped.
    Terminated,
    /// Successful operation completion persisted.
    Completed,
    /// Failure recorded; surviving work must be reconciled.
    Failed,
}
impl ExecutionState {
    /// Checks scheduler/adapter transitions without performing side effects.
    pub fn permits(&self, next: &Self) -> bool {
        use ExecutionState::*;
        matches!(
            (self, next),
            (Queued, Running | CancellationRequested)
                | (
                    Running,
                    WaitingForHuman
                        | WaitingForResources
                        | Paused
                        | CancellationRequested
                        | Completed
                        | Failed
                )
                | (
                    WaitingForHuman | WaitingForResources | Paused,
                    Running | CancellationRequested | Failed
                )
                | (CancellationRequested, Terminated)
        )
    }
}
ironloom_core::contract! {
/// Validated factory record.
ExecutionClaim, ExecutionClaimData {
    /// Claimed assignment.
    assignment_id: AssignmentId,
    /// Workspace owner.
    node_id: NodeId,
    /// Monotonically increasing ownership token.
    fence: Counter,
    /// Renewable claim expiry, not proof of termination.
    expires_at_ms: Counter,
} |value| {
    let _ = value;
    positive("fence", value.fence)?;
    positive("expires_at_ms", value.expires_at_ms)
}
}
