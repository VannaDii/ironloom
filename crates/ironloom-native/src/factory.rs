//! Shared software factory contracts.
use ironloom_core::validation::{ValidationErrors, positive};
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
    /// Upstream server ID returned by enrollment/refresh.
    server_id: ServerId,
    /// Distinct upstream environment ID used for session visibility.
    environment_id: EnvironmentId,
    /// Normalized relay endpoint set.
    relay_target: RelayTarget,
    /// Persisted enrollment/preference key; independent from server and environment IDs.
    persistence_key: NativePersistenceKey,
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
    positive("authentication_generation", value.authentication_generation)?;
    if value.external_account_id != value.persistence_key.external_account_id
        || value.relay_target.websocket_url != value.persistence_key.websocket_url
    {
        return Err(ValidationErrors::field(
            "persistence_key",
            "enrollment_key_mismatch",
        ));
    }
    Ok(())
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
ironloom_core::contract! {
/// Validated factory record.
RelayTarget, RelayTargetData {
    /// Normalized relay WebSocket endpoint.
    websocket_url: String,
    /// Enrollment endpoint.
    enroll_url: String,
    /// Server registration refresh endpoint.
    refresh_url: String,
    /// Pairing endpoint.
    pair_url: String,
    /// Pairing-status endpoint.
    pair_status_url: String,
} |value| {
    let _ = value;
    let websocket = relay_url("websocket_url", &value.websocket_url, true)?;
    for (field, endpoint) in [
        ("enroll_url", &value.enroll_url),
        ("refresh_url", &value.refresh_url),
        ("pair_url", &value.pair_url),
        ("pair_status_url", &value.pair_status_url),
    ] {
        let http = relay_url(field, endpoint, false)?;
        if websocket.host_str() != http.host_str()
            || websocket.port_or_known_default() != http.port_or_known_default()
            || (websocket.scheme() == "wss") != (http.scheme() == "https")
        {
            return Err(ValidationErrors::field(field, "relay_origin_mismatch"));
        }
    }
    Ok(())
}
}
ironloom_core::contract! {
/// Validated factory record.
NativePersistenceKey, NativePersistenceKeyData {
    /// Exact normalized relay WebSocket target, as in upstream persisted lookup.
    websocket_url: String,
    /// Authenticated external account; never an unrestricted host identity.
    external_account_id: ActorId,
    /// Optional pairing/client preference namespace, matching upstream lookup.
    client_name: Option<ActorId>,
} |value| {
    let _ = value;
    relay_url("websocket_url", &value.websocket_url, true)?;
    Ok(())
}
}

fn relay_url(field: &str, value: &str, websocket: bool) -> Result<url::Url, ValidationErrors> {
    let url = url::Url::parse(value).map_err(|_| ValidationErrors::field(field, "invalid_url"))?;
    let loopback = match url.host() {
        Some(url::Host::Domain(host)) => host == "localhost",
        Some(url::Host::Ipv4(ip)) => ip.is_loopback(),
        Some(url::Host::Ipv6(ip)) => ip.is_loopback(),
        None => false,
    };
    let secure = if websocket { "wss" } else { "https" };
    let local = if websocket { "ws" } else { "http" };
    if url.host_str().is_none()
        || !(url.scheme() == secure || (loopback && url.scheme() == local))
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(ValidationErrors::field(field, "secure_relay_required"));
    }
    if url.as_str() != value {
        return Err(ValidationErrors::field(field, "normalized_url_required"));
    }
    Ok(url)
}
