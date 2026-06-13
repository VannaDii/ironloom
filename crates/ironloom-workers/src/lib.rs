#![forbid(unsafe_code)]

use ironloom_core::{CorrelationId, WorkItemId};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Stable worker request envelope that can later become an RPC contract.
#[derive(Clone, Debug, JsonSchema, PartialEq, Deserialize, Serialize)]
pub struct WorkerRequest {
    /// Worker name.
    pub worker_name: String,
    /// Worker version.
    pub worker_version: String,
    /// Work item identifier.
    pub work_item_id: WorkItemId,
    /// Request correlation identifier.
    pub correlation_id: CorrelationId,
    /// Worker-specific JSON payload.
    pub payload: Value,
}

/// Stable worker response envelope.
#[derive(Clone, Debug, JsonSchema, PartialEq, Deserialize, Serialize)]
pub struct WorkerResponse {
    /// Worker name.
    pub worker_name: String,
    /// Produced artifact identifiers.
    pub artifact_ids: Vec<String>,
    /// Worker-specific JSON payload.
    pub payload: Value,
}
