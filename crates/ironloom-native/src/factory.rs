//! Shared software factory contracts.
use ironloom_core::validation::positive;
use ironloom_core::*;
ironloom_core::contract! {
/// Validated factory record.
RelayCursor, RelayCursorData {
    /// Native relay client ID.
    client_id: ActorId,
    /// Relay stream identity, not conversation ID.
    stream_id: ActorId,
    /// Upstream transport acknowledgment, not durable service cursor.
    acknowledged_sequence: Counter,
    /// Optional acknowledged chunk within the sequence.
    acknowledged_segment: Option<Counter>,
    /// Opaque upstream subscribe cursor, independent from sequence acknowledgment.
    subscription_cursor: Option<ActorId>,
} |value| {
    let _ = value;
    Ok(())
}
}
ironloom_core::contract! {
/// Validated factory record.
NativeEnrollment, NativeEnrollmentData {
    /// Existing shared installation.
    installation_id: InstallationId,
    /// Enrolled service node.
    node_id: NodeId,
    /// Native server/environment mapping.
    server_environment_id: ActorId,
    /// Connected external account.
    external_account_id: ActorId,
    /// Authorized human mapping; host does not grant access.
    operator_id: OperatorId,
    /// Persisted user preference.
    enabled: bool,
    /// Reject stale token-refresh results.
    authentication_generation: Counter,
    /// Protected imported control registration.
    control_registration_ref: CredentialId,
    /// Separate eligible inference credentials; no billing fallback.
    inference_credential_ref: Option<CredentialId>,
} |value| {
    let _ = value;
    positive("authentication_generation", value.authentication_generation)
}
}
/// Pinned upstream compatibility source; not an adopted state runtime.
pub const UPSTREAM_REVISION: &str = "e2e7dabd4587c7b0fbf934e6a93b6cec8245751d";
/// Upstream native relay protocol version.
pub const RELAY_PROTOCOL_VERSION: u64 = 3;

impl NativeEnrollmentData {
    /// Rejects refresh responses from a retired login generation.
    pub fn accepts_refresh(&self, generation: Counter) -> bool {
        self.enabled && self.authentication_generation == generation
    }
}
