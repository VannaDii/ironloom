#![forbid(unsafe_code)]

use ironloom_artifacts::{ArtifactEnvelope, ArtifactKind};
use ironloom_core::{ActorId, CorrelationId, ThreadId, WorkItemId};
use ironloom_gates::GateExecutor;
use ironloom_policy::{ActionKind, PolicyContext, PolicyDecision, evaluate_policy};
use ironloom_process_graph::default_gate_graph;
use ironloom_storage::{FilesystemStore, StorageError};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::json;
use thiserror::Error;

/// Supervisor input envelope for a thread-bound gate command.
#[derive(Clone, Debug, Eq, JsonSchema, PartialEq, Deserialize, Serialize)]
pub struct SupervisorInput {
    /// Work item selected by the Discord thread binding.
    pub work_item_id: WorkItemId,
    /// Originating Discord thread.
    pub thread_id: ThreadId,
    /// Requesting actor.
    pub actor_id: ActorId,
    /// Correlation identifier.
    pub correlation_id: CorrelationId,
    /// Operator command text.
    pub command: String,
}

/// Supervisor routing decision after a gate route.
#[derive(Clone, Debug, Eq, JsonSchema, PartialEq, Deserialize, Serialize)]
pub struct SupervisorDecision {
    /// Selected process node name.
    pub selected_process_node: String,
    /// Persisted artifact identifiers.
    pub persisted_artifact_ids: Vec<String>,
}

/// Supervisor route errors.
#[derive(Debug, Error)]
pub enum SupervisorError {
    /// Process graph did not contain the expected route.
    #[error("process graph did not route to a gate worker")]
    MissingGateRoute,
    /// Policy refused the action.
    #[error("policy refused action: {0}")]
    PolicyDenied(String),
    /// Artifact persistence failed.
    #[error(transparent)]
    Storage(#[from] StorageError),
    /// Artifact construction failed.
    #[error(transparent)]
    Domain(#[from] ironloom_core::IronloomError),
}

/// Runs a gate work item through the process graph and gate executor.
pub fn run_gate_work(
    input: &SupervisorInput,
    store: &FilesystemStore,
    gate_executor: &mut impl GateExecutor,
) -> Result<SupervisorDecision, SupervisorError> {
    let graph = default_gate_graph();
    let selected_node = graph
        .next_node("discord_command_received")
        .ok_or(SupervisorError::MissingGateRoute)?;
    let policy_decision = evaluate_policy(&PolicyContext {
        actor_id: input.actor_id.clone(),
        thread_id: Some(input.thread_id.clone()),
        action: ActionKind::RunGate,
        destructive: false,
    });
    match policy_decision {
        PolicyDecision::Allowed { .. } => {}
        PolicyDecision::Denied { reason } | PolicyDecision::RequiresApproval { reason } => {
            return Err(SupervisorError::PolicyDenied(reason));
        }
    }
    let gate_result = gate_executor.run_gate(&input.command);
    let artifact = ArtifactEnvelope::new(
        ArtifactKind::GateResult,
        input.work_item_id.clone(),
        input.thread_id.clone(),
        input.correlation_id.clone(),
        json!({
            "worker": "run_gate_worker",
            "gate": gate_result,
        }),
    )?;
    store.write_artifact(&artifact)?;
    Ok(SupervisorDecision {
        selected_process_node: selected_node.name().to_owned(),
        persisted_artifact_ids: vec![artifact.id().to_owned()],
    })
}
