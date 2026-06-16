#![forbid(unsafe_code)]

use ironloom_artifacts::{ArtifactEnvelope, ArtifactKind};
use ironloom_core::{ActorId, CorrelationId, ThreadId, WorkItemId};
use ironloom_gates::{GateExecutor, GateResult};
use ironloom_policy::{ActionKind, PolicyContext, PolicyDecision, evaluate_policy};
use ironloom_process_graph::default_gate_graph;
use ironloom_storage::{FilesystemStore, StorageError};
use ironloom_workers::{Worker, WorkerError, WorkerRegistry, WorkerRequest, WorkerResponse};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use thiserror::Error;

/// Stable process node and worker name for the initial gate route.
pub const GATE_WORKER_NAME: &str = "run_gate_worker";
/// Stable version for the initial in-process gate worker.
pub const GATE_WORKER_VERSION: &str = "1";

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
    /// Worker dispatch failed.
    #[error(transparent)]
    Worker(#[from] WorkerError),
}

/// Runs a gate work item through the process graph and gate executor.
pub fn run_gate_work(
    input: &SupervisorInput,
    store: &FilesystemStore,
    gate_executor: &impl GateExecutor,
) -> Result<SupervisorDecision, SupervisorError> {
    let mut registry = WorkerRegistry::new();
    registry.register(GateExecutorWorker { gate_executor });
    run_gate_work_with_registry(input, store, &registry)
}

/// Runs a gate work item through the process graph and registered worker boundary.
pub fn run_gate_work_with_registry(
    input: &SupervisorInput,
    store: &FilesystemStore,
    registry: &WorkerRegistry<'_>,
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
    let worker_response = registry.dispatch(&WorkerRequest {
        worker_name: selected_node.name().to_owned(),
        worker_version: GATE_WORKER_VERSION.to_owned(),
        work_item_id: input.work_item_id.clone(),
        correlation_id: input.correlation_id.clone(),
        payload: json!({ "command": input.command }),
    })?;
    let artifact = ArtifactEnvelope::new(
        ArtifactKind::GateResult,
        input.work_item_id.clone(),
        input.thread_id.clone(),
        input.correlation_id.clone(),
        json!({
            "worker": worker_response.worker_name,
            "worker_artifacts": worker_response.artifact_ids,
            "gate": worker_response.payload,
        }),
    )?;
    store.write_artifact(&artifact)?;
    Ok(SupervisorDecision {
        selected_process_node: selected_node.name().to_owned(),
        persisted_artifact_ids: vec![artifact.id().to_owned()],
    })
}

struct GateExecutorWorker<'executor, Executor>
where
    Executor: GateExecutor,
{
    gate_executor: &'executor Executor,
}

impl<Executor> Worker for GateExecutorWorker<'_, Executor>
where
    Executor: GateExecutor,
{
    fn name(&self) -> &'static str {
        GATE_WORKER_NAME
    }

    fn version(&self) -> &'static str {
        GATE_WORKER_VERSION
    }

    fn run(&self, request: &WorkerRequest) -> WorkerResponse {
        let gate_result = request
            .payload
            .get("command")
            .and_then(Value::as_str)
            .map_or_else(
                || GateResult::failed(-1, "gate worker request is missing command"),
                |command| self.gate_executor.run_gate(command),
            );
        let payload = serde_json::to_value(gate_result).unwrap_or_else(|error| {
            json!({
                "status": "failed",
                "exit_code": -1,
                "stdout": "",
                "stderr": format!("gate result serialization failed: {error}")
            })
        });
        WorkerResponse {
            worker_name: GATE_WORKER_NAME.to_owned(),
            artifact_ids: Vec::new(),
            payload,
        }
    }
}
