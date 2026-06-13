#![forbid(unsafe_code)]

use ironloom_core::{ArtifactId, CorrelationId, IronloomResult, ThreadId, WorkItemId};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};

/// Version assigned to all first-release Ironloom artifact envelopes.
pub const ARTIFACT_ENVELOPE_VERSION: u16 = 1;

/// Artifact categories emitted by the Ironloom runtime.
#[derive(Clone, Debug, Eq, JsonSchema, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ArtifactKind {
    /// Structured result from a repository gate command.
    GateResult,
    /// Supervisor routing and validation decision.
    SupervisorDecision,
    /// Operator-facing Discord interaction result.
    DiscordInteraction,
    /// Auditable policy decision.
    PolicyDecision,
}

/// Immutable artifact envelope stored under `.ironloom/artifacts`.
#[derive(Clone, Debug, JsonSchema, PartialEq, Deserialize, Serialize)]
pub struct ArtifactEnvelope {
    id: ArtifactId,
    version: u16,
    kind: ArtifactKind,
    work_item_id: WorkItemId,
    thread_id: ThreadId,
    correlation_id: CorrelationId,
    checksum: String,
    payload: Value,
}

impl ArtifactEnvelope {
    /// Builds an artifact envelope with a checksum-derived identifier.
    pub fn new(
        kind: ArtifactKind,
        work_item_id: WorkItemId,
        thread_id: ThreadId,
        correlation_id: CorrelationId,
        payload: Value,
    ) -> IronloomResult<Self> {
        let checksum =
            checksum_payload(&kind, &work_item_id, &thread_id, &correlation_id, &payload);
        let id = ArtifactId::new(format!("artifact-{}", &checksum[..16]))?;
        Ok(Self {
            id,
            version: ARTIFACT_ENVELOPE_VERSION,
            kind,
            work_item_id,
            thread_id,
            correlation_id,
            checksum,
            payload,
        })
    }

    /// Returns the artifact identifier.
    #[must_use]
    pub fn id(&self) -> &str {
        self.id.as_str()
    }

    /// Returns the artifact work item identifier.
    #[must_use]
    pub fn work_item_id(&self) -> &WorkItemId {
        &self.work_item_id
    }

    /// Returns the artifact thread identifier.
    #[must_use]
    pub fn thread_id(&self) -> &ThreadId {
        &self.thread_id
    }

    /// Returns the artifact kind.
    #[must_use]
    pub fn kind(&self) -> &ArtifactKind {
        &self.kind
    }

    /// Returns the checksum over the stable artifact fields.
    #[must_use]
    pub fn checksum(&self) -> &str {
        &self.checksum
    }

    /// Returns the JSON payload.
    #[must_use]
    pub fn payload(&self) -> &Value {
        &self.payload
    }
}

fn checksum_payload(
    kind: &ArtifactKind,
    work_item_id: &WorkItemId,
    thread_id: &ThreadId,
    correlation_id: &CorrelationId,
    payload: &Value,
) -> String {
    let stable_payload = serde_json::json!({
        "version": ARTIFACT_ENVELOPE_VERSION,
        "kind": kind,
        "work_item_id": work_item_id,
        "thread_id": thread_id,
        "correlation_id": correlation_id,
        "payload": payload,
    });
    let encoded = serde_json::to_vec(&stable_payload).unwrap_or_default();
    hex::encode(Sha256::digest(encoded))
}
