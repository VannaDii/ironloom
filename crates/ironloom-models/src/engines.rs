//! Local engine port. Admission, reservations and LRU decisions belong to service policy.
use crate::{
    factory::{EngineCapabilities, ModelSelection, Residency},
    providers::{AdapterError, Provider},
};
use ironloom_core::{BoxFuture, ResidentModelId};
use ironloom_policy::factory::ResourceReservation;
/// Embedded or managed-helper lifecycle; no alternative execution channel.
pub trait Engine: Provider {
    /// Returns static capabilities without loading, warm-up or inference probing.
    fn capabilities(&self) -> EngineCapabilities;
    /// Loads/reuses exact weights after central atomic reservation, including drafts/caches.
    fn load(
        &self,
        selection: ModelSelection,
        reservations: Vec<ResourceReservation>,
    ) -> BoxFuture<'_, Result<Residency, AdapterError>>;
    /// Unloads idle weights only after service authorization; never deletes downloaded files.
    fn unload(&self, resident: ResidentModelId) -> BoxFuture<'_, Result<(), AdapterError>>;
    /// Observes resource use; restart/failure must reconcile active requests before reclaiming.
    fn observe(&self, resident: ResidentModelId) -> BoxFuture<'_, Result<Residency, AdapterError>>;
}
