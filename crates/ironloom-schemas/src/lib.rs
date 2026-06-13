#![forbid(unsafe_code)]

use std::fs;
use std::path::Path;

use ironloom_artifacts::{ArtifactEnvelope, ArtifactKind};
use ironloom_config::{RuntimeConfig, StoredSetupConfig};
use ironloom_core::{
    ActorId, ArtifactId, BranchName, CorrelationId, RepositorySlug, RunId, ThreadId, WorkItemId,
};
use ironloom_discord::DiscordCommand;
use ironloom_gates::{GateResult, GateStatus};
use ironloom_github::RepositoryProjection;
use ironloom_observability::AuditRecord;
use ironloom_policy::{ActionKind, PolicyContext, PolicyDecision};
use ironloom_process_graph::{ProcessGraph, ProcessNode, RetryPolicy, Transition};
use ironloom_queue::{QueueItem, QueueState};
use ironloom_sonarcloud::SonarCloudConfig;
use ironloom_supervisor::{SupervisorDecision, SupervisorInput};
use ironloom_workers::{WorkerRequest, WorkerResponse};
use ironloom_worktrees::WorktreeRequest;
use schemars::{JsonSchema, schema_for};
use thiserror::Error;

/// Schema checker result type.
pub type SchemaResult<T> = Result<T, SchemaError>;

/// Schema generation and drift-check errors.
#[derive(Debug, Error)]
pub enum SchemaError {
    /// Filesystem access failed.
    #[error("schema file I/O failed: {0}")]
    Io(#[from] std::io::Error),
    /// Schema serialization failed.
    #[error("schema serialization failed: {0}")]
    Json(#[from] serde_json::Error),
    /// A committed schema file differs from generated output.
    #[error("schema drift detected in {path}")]
    Drift {
        /// Drifted schema path.
        path: String,
    },
}

struct SchemaFile {
    relative_path: &'static str,
    contents: String,
}

/// Writes all generated schema files under the supplied repository root.
pub fn write_schema_files(root: &Path) -> SchemaResult<()> {
    for schema in schema_files()? {
        let path = root.join(schema.relative_path);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(path, schema.contents)?;
    }
    Ok(())
}

/// Checks that committed schema files match generated Rust contract schemas.
pub fn check_schema_files(root: &Path) -> SchemaResult<()> {
    for schema in schema_files()? {
        let path = root.join(schema.relative_path);
        let current = fs::read_to_string(&path)?;
        if current != schema.contents {
            return Err(SchemaError::Drift {
                path: display_path(&path),
            });
        }
    }
    Ok(())
}

fn schema_files() -> SchemaResult<Vec<SchemaFile>> {
    Ok(vec![
        schema::<ActorId>("crates/ironloom-core/schemas/actor-id.schema.json")?,
        schema::<ArtifactId>("crates/ironloom-core/schemas/artifact-id.schema.json")?,
        schema::<BranchName>("crates/ironloom-core/schemas/branch-name.schema.json")?,
        schema::<CorrelationId>("crates/ironloom-core/schemas/correlation-id.schema.json")?,
        schema::<RepositorySlug>("crates/ironloom-core/schemas/repository-slug.schema.json")?,
        schema::<RunId>("crates/ironloom-core/schemas/run-id.schema.json")?,
        schema::<ThreadId>("crates/ironloom-core/schemas/thread-id.schema.json")?,
        schema::<WorkItemId>("crates/ironloom-core/schemas/work-item-id.schema.json")?,
        schema::<ArtifactKind>("crates/ironloom-artifacts/schemas/artifact-kind.schema.json")?,
        schema::<ArtifactEnvelope>(
            "crates/ironloom-artifacts/schemas/artifact-envelope.schema.json",
        )?,
        schema::<RuntimeConfig>("crates/ironloom-config/schemas/runtime-config.schema.json")?,
        schema::<StoredSetupConfig>(
            "crates/ironloom-config/schemas/stored-setup-config.schema.json",
        )?,
        schema::<DiscordCommand>("crates/ironloom-discord/schemas/discord-command.schema.json")?,
        schema::<GateStatus>("crates/ironloom-gates/schemas/gate-status.schema.json")?,
        schema::<GateResult>("crates/ironloom-gates/schemas/gate-result.schema.json")?,
        schema::<RepositoryProjection>(
            "crates/ironloom-github/schemas/repository-projection.schema.json",
        )?,
        schema::<AuditRecord>("crates/ironloom-observability/schemas/audit-record.schema.json")?,
        schema::<ActionKind>("crates/ironloom-policy/schemas/action-kind.schema.json")?,
        schema::<PolicyContext>("crates/ironloom-policy/schemas/policy-context.schema.json")?,
        schema::<PolicyDecision>("crates/ironloom-policy/schemas/policy-decision.schema.json")?,
        schema::<ProcessNode>("crates/ironloom-process-graph/schemas/process-node.schema.json")?,
        schema::<RetryPolicy>("crates/ironloom-process-graph/schemas/retry-policy.schema.json")?,
        schema::<Transition>("crates/ironloom-process-graph/schemas/transition.schema.json")?,
        schema::<ProcessGraph>("crates/ironloom-process-graph/schemas/process-graph.schema.json")?,
        schema::<QueueState>("crates/ironloom-queue/schemas/queue-state.schema.json")?,
        schema::<QueueItem>("crates/ironloom-queue/schemas/queue-item.schema.json")?,
        schema::<Vec<ArtifactId>>(
            "crates/ironloom-storage/schemas/stored-artifact-index.schema.json",
        )?,
        schema::<SonarCloudConfig>(
            "crates/ironloom-sonarcloud/schemas/sonar-cloud-config.schema.json",
        )?,
        schema::<SupervisorInput>(
            "crates/ironloom-supervisor/schemas/supervisor-input.schema.json",
        )?,
        schema::<SupervisorDecision>(
            "crates/ironloom-supervisor/schemas/supervisor-decision.schema.json",
        )?,
        schema::<WorkerRequest>("crates/ironloom-workers/schemas/worker-request.schema.json")?,
        schema::<WorkerResponse>("crates/ironloom-workers/schemas/worker-response.schema.json")?,
        schema::<WorktreeRequest>(
            "crates/ironloom-worktrees/schemas/worktree-request.schema.json",
        )?,
    ])
}

fn schema<T: JsonSchema>(relative_path: &'static str) -> SchemaResult<SchemaFile> {
    let mut contents = serde_json::to_string_pretty(&schema_for!(T))?;
    contents.push('\n');
    Ok(SchemaFile {
        relative_path,
        contents,
    })
}

fn display_path(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}
