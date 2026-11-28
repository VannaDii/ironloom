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
use ironloom_github::{
    CheckRunConclusion, CheckRunProjection, CheckRunStatus, PullRequestProjection,
    RepositoryProjection,
};
use ironloom_observability::AuditRecord;
use ironloom_policy::{ActionKind, PolicyContext, PolicyDecision};
use ironloom_process_graph::{ProcessGraph, ProcessNode, RetryPolicy, Transition};
use ironloom_queue::{QueueItem, QueueState};
use ironloom_sonarcloud::{
    QualityGateStatus, SonarCloudConfig, SonarCloudIssue, SonarCloudIssueSeverity,
};
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
        schema::<ironloom_service::factory::ModelInventoryQuery>(
            "crates/ironloom-service/schemas/model-inventory-query.schema.json",
        )?,
        schema::<ironloom_service::factory::ModelInventoryItem>(
            "crates/ironloom-service/schemas/model-inventory-item.schema.json",
        )?,
        schema::<ironloom_service::factory::ModelInventoryPage>(
            "crates/ironloom-service/schemas/model-inventory-page.schema.json",
        )?,
        schema::<ironloom_service::factory::ModelAssessmentQuery>(
            "crates/ironloom-service/schemas/model-assessment-query.schema.json",
        )?,
        schema::<ironloom_service::factory::EngineAssessment>(
            "crates/ironloom-service/schemas/engine-assessment.schema.json",
        )?,
        schema::<ironloom_service::factory::ProjectQuery>(
            "crates/ironloom-service/schemas/project-query.schema.json",
        )?,
        schema::<ironloom_service::factory::ProjectSummary>(
            "crates/ironloom-service/schemas/project-summary.schema.json",
        )?,
        schema::<ironloom_service::factory::ProjectPage>(
            "crates/ironloom-service/schemas/project-page.schema.json",
        )?,
        schema::<ironloom_service::factory::CreateProject>(
            "crates/ironloom-service/schemas/create-project.schema.json",
        )?,
        schema::<ironloom_service::factory::CredentialSummary>(
            "crates/ironloom-service/schemas/credential-summary.schema.json",
        )?,
        schema::<ironloom_service::factory::CredentialCommand>(
            "crates/ironloom-service/schemas/credential-command.schema.json",
        )?,
        schema::<ironloom_service::factory::NativeConnectionCommand>(
            "crates/ironloom-service/schemas/native-connection-command.schema.json",
        )?,
        schema::<ironloom_service::factory::NativeConnectionState>(
            "crates/ironloom-service/schemas/native-connection-state.schema.json",
        )?,
        schema::<ironloom_service::factory::DownloadCommand>(
            "crates/ironloom-service/schemas/download-command.schema.json",
        )?,
        schema::<ironloom_service::factory::CreateConversation>(
            "crates/ironloom-service/schemas/create-conversation.schema.json",
        )?,
        schema::<ironloom_config::factory::ModelProfileConfiguration>(
            "crates/ironloom-config/schemas/model-profile-configuration.schema.json",
        )?,
        schema::<ironloom_config::factory::DevicePreference>(
            "crates/ironloom-config/schemas/device-preference.schema.json",
        )?,
        schema::<ironloom_config::factory::ProviderEndpoint>(
            "crates/ironloom-config/schemas/provider-endpoint.schema.json",
        )?,
        schema::<ironloom_config::factory::SourceAccountBinding>(
            "crates/ironloom-config/schemas/source-account-binding.schema.json",
        )?,
        schema::<ironloom_service::factory::ConfigurationChange>(
            "crates/ironloom-service/schemas/configuration-change.schema.json",
        )?,
        schema::<ironloom_service::factory::ConfigurationCommand>(
            "crates/ironloom-service/schemas/configuration-command.schema.json",
        )?,
        schema::<ironloom_service::factory::ConfigurationSnapshot>(
            "crates/ironloom-service/schemas/configuration-snapshot.schema.json",
        )?,
        schema::<ironloom_service::factory::LessonMutation>(
            "crates/ironloom-service/schemas/lesson-mutation.schema.json",
        )?,
        schema::<ironloom_service::factory::LessonQuery>(
            "crates/ironloom-service/schemas/lesson-query.schema.json",
        )?,
        schema::<ironloom_service::factory::LessonPage>(
            "crates/ironloom-service/schemas/lesson-page.schema.json",
        )?,
        schema::<ironloom_models::factory::SourceQuery>(
            "crates/ironloom-models/schemas/source-query.schema.json",
        )?,
        schema::<ironloom_models::factory::ModelCard>(
            "crates/ironloom-models/schemas/model-card.schema.json",
        )?,
        schema::<ironloom_models::factory::SourcePage>(
            "crates/ironloom-models/schemas/source-page.schema.json",
        )?,
        schema::<ironloom_models::factory::DraftModel>(
            "crates/ironloom-models/schemas/draft-model.schema.json",
        )?,
        schema::<ironloom_models::factory::ContextCache>(
            "crates/ironloom-models/schemas/context-cache.schema.json",
        )?,
        schema::<ironloom_models::factory::EngineLoadOptions>(
            "crates/ironloom-models/schemas/engine-load-options.schema.json",
        )?,
        schema::<ironloom_models::factory::EngineLoadRequest>(
            "crates/ironloom-models/schemas/engine-load-request.schema.json",
        )?,
        schema::<ironloom_models::factory::EngineRequirements>(
            "crates/ironloom-models/schemas/engine-requirements.schema.json",
        )?,
        schema::<ironloom_models::factory::DeviceResourceObservation>(
            "crates/ironloom-models/schemas/device-resource-observation.schema.json",
        )?,
        schema::<ironloom_models::factory::EngineObservation>(
            "crates/ironloom-models/schemas/engine-observation.schema.json",
        )?,
        schema::<ironloom_models::factory::ToolDefinition>(
            "crates/ironloom-models/schemas/tool-definition.schema.json",
        )?,
        schema::<ironloom_models::factory::ToolInvocation>(
            "crates/ironloom-models/schemas/tool-invocation.schema.json",
        )?,
        schema::<ironloom_models::factory::ToolResult>(
            "crates/ironloom-models/schemas/tool-result.schema.json",
        )?,
        schema::<ironloom_models::factory::InferenceMessage>(
            "crates/ironloom-models/schemas/inference-message.schema.json",
        )?,
        schema::<ironloom_service::factory::ConversationSnapshot>(
            "crates/ironloom-service/schemas/conversation-snapshot.schema.json",
        )?,
        schema::<ironloom_service::factory::HistoryDirection>(
            "crates/ironloom-service/schemas/history-direction.schema.json",
        )?,
        schema::<ironloom_service::factory::HistoryQuery>(
            "crates/ironloom-service/schemas/history-query.schema.json",
        )?,
        schema::<ironloom_service::factory::HistoryItem>(
            "crates/ironloom-service/schemas/history-item.schema.json",
        )?,
        schema::<ironloom_service::factory::HistoryPage>(
            "crates/ironloom-service/schemas/history-page.schema.json",
        )?,
        schema::<ironloom_service::factory::RelayTarget>(
            "crates/ironloom-service/schemas/relay-target.schema.json",
        )?,
        schema::<ironloom_service::factory::NativePersistenceKey>(
            "crates/ironloom-service/schemas/native-persistence-key.schema.json",
        )?,
        schema::<ironloom_config::factory::RoleConfiguration>(
            "crates/ironloom-config/schemas/role-configuration.schema.json",
        )?,
        schema::<ironloom_core::validation::ValidationErrors>(
            "crates/ironloom-core/schemas/validation-errors.schema.json",
        )?,
        schema::<ironloom_core::Counter>("crates/ironloom-core/schemas/counter.schema.json")?,
        schema::<ironloom_process_graph::factory::PlanRevision>(
            "crates/ironloom-process-graph/schemas/plan-revision.schema.json",
        )?,
        schema::<ironloom_workers::factory::PendingQuestion>(
            "crates/ironloom-workers/schemas/pending-question.schema.json",
        )?,
        schema::<ironloom_service::factory::BudgetCommand>(
            "crates/ironloom-service/schemas/budget-command.schema.json",
        )?,
        schema::<ironloom_service::factory::InstructionTemplate>(
            "crates/ironloom-service/schemas/instruction-template.schema.json",
        )?,
        schema::<ironloom_service::factory::InstructionQuery>(
            "crates/ironloom-service/schemas/instruction-query.schema.json",
        )?,
        schema::<ironloom_service::factory::InstructionPage>(
            "crates/ironloom-service/schemas/instruction-page.schema.json",
        )?,
        schema::<ironloom_service::factory::InstructionCommand>(
            "crates/ironloom-service/schemas/instruction-command.schema.json",
        )?,
        schema::<ironloom_config::factory::DownloadLimits>(
            "crates/ironloom-config/schemas/download-limits.schema.json",
        )?,
        schema::<ironloom_storage::factory::StoredCommand>(
            "crates/ironloom-storage/schemas/stored-command.schema.json",
        )?,
        schema::<ironloom_policy::factory::ResourceReservation>(
            "crates/ironloom-policy/schemas/resource-reservation.schema.json",
        )?,
        schema::<ironloom_worktrees::factory::AssignmentWorkspace>(
            "crates/ironloom-worktrees/schemas/assignment-workspace.schema.json",
        )?,
        schema::<ironloom_worktrees::factory::WorkerPaths>(
            "crates/ironloom-worktrees/schemas/worker-paths.schema.json",
        )?,
        schema::<ironloom_gates::factory::ValidationContent>(
            "crates/ironloom-gates/schemas/validation-content.schema.json",
        )?,
        schema::<ironloom_supervisor::factory::DispatchAuthority>(
            "crates/ironloom-supervisor/schemas/dispatch-authority.schema.json",
        )?,
        schema::<ironloom_artifacts::factory::FactoryArtifact>(
            "crates/ironloom-artifacts/schemas/factory-artifact.schema.json",
        )?,
        schema::<ironloom_models::factory::ModelSource>(
            "crates/ironloom-models/schemas/model-source.schema.json",
        )?,
        schema::<ironloom_models::factory::DownloadProgress>(
            "crates/ironloom-models/schemas/download-progress.schema.json",
        )?,
        schema::<ironloom_models::factory::EngineCapabilities>(
            "crates/ironloom-models/schemas/engine-capabilities.schema.json",
        )?,
        schema::<ironloom_models::factory::ModelFit>(
            "crates/ironloom-models/schemas/model-fit.schema.json",
        )?,
        schema::<ironloom_service::factory::RelayCursor>(
            "crates/ironloom-service/schemas/relay-cursor.schema.json",
        )?,
        schema::<ironloom_service::factory::NativeEnrollment>(
            "crates/ironloom-service/schemas/native-enrollment.schema.json",
        )?,
        schema::<ironloom_service::factory::LoginRequest>(
            "crates/ironloom-service/schemas/login-request.schema.json",
        )?,
        schema::<ironloom_service::factory::OidcStart>(
            "crates/ironloom-service/schemas/oidc-start.schema.json",
        )?,
        schema::<ironloom_service::factory::OidcCallback>(
            "crates/ironloom-service/schemas/oidc-callback.schema.json",
        )?,
        schema::<ironloom_service::factory::BootstrapRedeem>(
            "crates/ironloom-service/schemas/bootstrap-redeem.schema.json",
        )?,
        schema::<ironloom_service::factory::SteeringInput>(
            "crates/ironloom-service/schemas/steering-input.schema.json",
        )?,
        schema::<ironloom_service::factory::QuestionAnswer>(
            "crates/ironloom-service/schemas/question-answer.schema.json",
        )?,
        schema::<ironloom_service::factory::SessionOrder>(
            "crates/ironloom-service/schemas/session-order.schema.json",
        )?,
        schema::<ironloom_service::factory::SessionQuery>(
            "crates/ironloom-service/schemas/session-query.schema.json",
        )?,
        schema::<ironloom_service::factory::SessionSummary>(
            "crates/ironloom-service/schemas/session-summary.schema.json",
        )?,
        schema::<ironloom_service::factory::ServiceError>(
            "crates/ironloom-service/schemas/service-error.schema.json",
        )?,
        schema::<ironloom_policy::factory::Resource>(
            "crates/ironloom-policy/schemas/resource.schema.json",
        )?,
        schema::<ironloom_policy::factory::AuthorityCheck>(
            "crates/ironloom-policy/schemas/authority-check.schema.json",
        )?,
        schema::<ironloom_policy::factory::AuthorizationOutcome>(
            "crates/ironloom-policy/schemas/authorization-outcome.schema.json",
        )?,
        schema::<ironloom_config::factory::FactorySetup>(
            "crates/ironloom-config/schemas/factory-setup.schema.json",
        )?,
        schema::<ironloom_config::factory::StorageRoots>(
            "crates/ironloom-config/schemas/storage-roots.schema.json",
        )?,
        schema::<ironloom_queue::factory::ExecutionState>(
            "crates/ironloom-queue/schemas/execution-state.schema.json",
        )?,
        schema::<ironloom_queue::factory::ExecutionClaim>(
            "crates/ironloom-queue/schemas/execution-claim.schema.json",
        )?,
        schema::<ironloom_process_graph::factory::PlanApproval>(
            "crates/ironloom-process-graph/schemas/plan-approval.schema.json",
        )?,
        schema::<ironloom_process_graph::factory::InstructionCopy>(
            "crates/ironloom-process-graph/schemas/instruction-copy.schema.json",
        )?,
        schema::<ironloom_models::factory::EngineIdentity>(
            "crates/ironloom-models/schemas/engine-identity.schema.json",
        )?,
        schema::<ironloom_models::factory::DeviceIdentity>(
            "crates/ironloom-models/schemas/device-identity.schema.json",
        )?,
        schema::<ironloom_models::factory::ModelSelection>(
            "crates/ironloom-models/schemas/model-selection.schema.json",
        )?,
        schema::<ironloom_models::factory::GenerationControls>(
            "crates/ironloom-models/schemas/generation-controls.schema.json",
        )?,
        schema::<ironloom_models::factory::InferenceRequest>(
            "crates/ironloom-models/schemas/inference-request.schema.json",
        )?,
        schema::<ironloom_models::factory::Residency>(
            "crates/ironloom-models/schemas/residency.schema.json",
        )?,
        schema::<ironloom_models::factory::BackendQualification>(
            "crates/ironloom-models/schemas/backend-qualification.schema.json",
        )?,
        schema::<ironloom_models::factory::EngineOperation>(
            "crates/ironloom-models/schemas/engine-operation.schema.json",
        )?,
        schema::<ironloom_observability::factory::Usage>(
            "crates/ironloom-observability/schemas/usage.schema.json",
        )?,
        schema::<ironloom_observability::factory::Budget>(
            "crates/ironloom-observability/schemas/budget.schema.json",
        )?,
        schema::<ironloom_workers::factory::WorkerEvent>(
            "crates/ironloom-workers/schemas/worker-event.schema.json",
        )?,
        schema::<ironloom_storage::factory::Lesson>(
            "crates/ironloom-storage/schemas/lesson.schema.json",
        )?,
        schema::<ironloom_storage::factory::RememberedAnswer>(
            "crates/ironloom-storage/schemas/remembered-answer.schema.json",
        )?,
        schema::<ironloom_storage::factory::NodeEnrollment>(
            "crates/ironloom-storage/schemas/node-enrollment.schema.json",
        )?,
        schema::<ironloom_storage::factory::BootstrapState>(
            "crates/ironloom-storage/schemas/bootstrap-state.schema.json",
        )?,
        schema::<ironloom_service::factory::Command>(
            "crates/ironloom-service/schemas/command.schema.json",
        )?,
        schema::<ironloom_service::factory::ReplayCursor>(
            "crates/ironloom-service/schemas/replay-cursor.schema.json",
        )?,
        schema::<ironloom_service::factory::ServiceEvent>(
            "crates/ironloom-service/schemas/service-event.schema.json",
        )?,
        schema::<ironloom_service::factory::CommandReceipt>(
            "crates/ironloom-service/schemas/command-receipt.schema.json",
        )?,
        schema::<ironloom_service::factory::AuthenticatedSession>(
            "crates/ironloom-service/schemas/authenticated-session.schema.json",
        )?,
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
        schema::<PullRequestProjection>(
            "crates/ironloom-github/schemas/pull-request-projection.schema.json",
        )?,
        schema::<CheckRunStatus>("crates/ironloom-github/schemas/check-run-status.schema.json")?,
        schema::<CheckRunConclusion>(
            "crates/ironloom-github/schemas/check-run-conclusion.schema.json",
        )?,
        schema::<CheckRunProjection>(
            "crates/ironloom-github/schemas/check-run-projection.schema.json",
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
        schema::<QualityGateStatus>(
            "crates/ironloom-sonarcloud/schemas/quality-gate-status.schema.json",
        )?,
        schema::<SonarCloudIssueSeverity>(
            "crates/ironloom-sonarcloud/schemas/sonar-cloud-issue-severity.schema.json",
        )?,
        schema::<SonarCloudIssue>(
            "crates/ironloom-sonarcloud/schemas/sonar-cloud-issue.schema.json",
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
