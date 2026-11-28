#![forbid(unsafe_code)]
//! Direct Rust native remote-host adapter; service ports own sessions, authority and PostgreSQL state.
/// Direct native enrollment/refresh/pairing HTTP with protected service persistence callbacks.
pub mod enrollment;
/// Pinned upstream protocol-v3 framing and durable transport callbacks.
pub mod relay;
/// Authenticated service-backed JSON-RPC operations and project context callbacks.
pub mod rpc;
/// Native WebSocket lifecycle, bounded delivery and reconnect replay.
pub mod socket;

/// Native question and exact-plan approval projection through shared service commands.
pub mod prompts;

/// Durable shared-service event projection for native viewers.
pub mod views;

/// Public upstream protocol/source revision used for the direct remote-host implementation.
/// Native-client and hardware qualification remain separate from protocol fixture coverage.
pub const UPSTREAM_REVISION: &str = "e2e7dabd4587c7b0fbf934e6a93b6cec8245751d";
