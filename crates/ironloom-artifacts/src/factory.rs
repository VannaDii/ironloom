//! Shared software factory contracts.
use ironloom_core::*;
ironloom_core::contract! {
/// Validated factory record.
FactoryArtifact, FactoryArtifactData {
    /// Stable managed record ID.
    artifact_id: ArtifactId,
    /// Project resource scope.
    project_id: ProjectId,
    /// Assignment scope, independent of thread.
    assignment_id: AssignmentId,
    /// Optional producer.
    worker_id: Option<WorkerId>,
    /// Operation correlation.
    correlation_id: CorrelationId,
    /// Versioned artifact kind.
    kind: ActorId,
    /// Verified payload manifest hash.
    content_hash: ActorId,
    /// Structured domain record; not authority.
    payload: serde_json::Value,
} |value| {
    let _ = value;
    Ok(())
}
}
