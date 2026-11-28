//! Hosted provider boundary. No provider may execute generated tool calls.
use crate::factory::InferenceRequest;
use ironloom_core::{BoxFuture, InferenceId};
/// Bounded normalized output; adapters drain independently from disconnected viewers.
pub type InferenceStream = tokio::sync::mpsc::Receiver<ironloom_workers::factory::WorkerEvent>;
/// Adapter failures with no raw response bodies or credentials.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum AdapterError {
    /// Capability absent; never silently change model/engine/billing.
    Unsupported,
    /// Provider or engine unavailable.
    Unavailable,
    /// Session ended without confirmed terminal result; reconcile before retry.
    Interrupted,
}
/// Provider operations; credentials are resolved by a trusted adapter for the authorized request.
pub trait Provider: Send + Sync {
    /// Starts one explicit inference request; ordinary tests use fixtures only.
    fn stream(
        &self,
        request: InferenceRequest,
    ) -> BoxFuture<'_, Result<InferenceStream, AdapterError>>;
    /// Requests only this inference cancellation. A later terminal event confirms termination.
    fn cancel(&self, request: InferenceId) -> BoxFuture<'_, Result<(), AdapterError>>;
}

/// Real HTTP provider implementations and provider-neutral payload/stream mapping.
pub mod http;
mod sse;
