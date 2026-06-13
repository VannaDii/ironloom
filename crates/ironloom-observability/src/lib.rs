#![forbid(unsafe_code)]

use ironloom_core::{ActorId, CorrelationId, ThreadId, WorkItemId};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// Redaction-safe audit record emitted by runtime components.
#[derive(Clone, Debug, Eq, JsonSchema, PartialEq, Deserialize, Serialize)]
pub struct AuditRecord {
    /// Correlation identifier propagated through the slice.
    pub correlation_id: CorrelationId,
    /// Actor associated with the action.
    pub actor_id: ActorId,
    /// Work item associated with the action.
    pub work_item_id: WorkItemId,
    /// Discord thread associated with the action.
    pub thread_id: ThreadId,
    /// Process node currently executing.
    pub process_node: String,
    /// Worker that produced the record.
    pub worker_name: String,
    /// Artifact identifiers produced by the action.
    pub artifact_ids: Vec<String>,
}
