//! Device identity adapter port. Discovery does not qualify execution or admit work.
use crate::{factory::DeviceIdentity, providers::AdapterError};
use ironloom_core::BoxFuture;
/// Platform device views; ambiguous/unreconciled identity blocks service admission.
pub trait Devices: Send + Sync {
    /// Discovers physical-host-scoped views without loading a model; tests use simulated views.
    fn discover(&self) -> BoxFuture<'_, Result<Vec<DeviceIdentity>, AdapterError>>;
}
