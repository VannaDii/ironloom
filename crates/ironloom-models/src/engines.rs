//! Local engine port. Admission, reservations and LRU decisions belong to service policy.
use crate::{
    factory::{
        EngineCapabilities, EngineLoadRequest, EngineObservation, EngineRequirements, Residency,
    },
    providers::{AdapterError, Provider},
};
use ironloom_core::{BoxFuture, Counter, ResidentModelId};
use ironloom_policy::factory::ResourceReservation;
/// Embedded or managed-helper lifecycle; no alternative execution channel.
pub trait Engine: Provider {
    /// Estimates target/draft/cache/context/accelerator requirements from metadata, without loading,
    /// warm-up or inference. Unknown/unsupported features remain explicit in the result.
    fn requirements(
        &self,
        request: EngineLoadRequest,
    ) -> BoxFuture<'_, Result<EngineRequirements, AdapterError>>;
    /// Observes engine/helper generation, requests, residents and canonical device pressure.
    /// Failure or lease expiry alone never frees central reservations.
    fn status(&self) -> BoxFuture<'_, Result<EngineObservation, AdapterError>>;
    /// Requests service-authorized restart only for the expected current generation. Reconcile
    /// existing requests/owned execution before reclaiming capacity; do not kill unrelated work.
    fn restart(
        &self,
        expected_generation: Counter,
    ) -> BoxFuture<'_, Result<EngineObservation, AdapterError>>;
    /// Returns static capabilities without loading, warm-up or inference probing.
    fn capabilities(&self) -> EngineCapabilities;
    /// Loads/reuses exact weights after central atomic reservation, including drafts/caches.
    fn load(
        &self,
        request: EngineLoadRequest,
        reservations: Vec<ResourceReservation>,
    ) -> BoxFuture<'_, Result<Residency, AdapterError>>;
    /// Unloads idle weights only after service authorization; never deletes downloaded files.
    fn unload(&self, resident: ResidentModelId) -> BoxFuture<'_, Result<(), AdapterError>>;
    /// Observes resource use; restart/failure must reconcile active requests before reclaiming.
    fn observe(&self, resident: ResidentModelId) -> BoxFuture<'_, Result<Residency, AdapterError>>;
}

/// Shared embedded/helper lifecycle; central policy remains the only admission/LRU authority.
pub mod runtime;

/// Service-owned private llama.cpp helper integration.
pub mod llama;

/// Embedded mistral.rs integration with an isolated private runner.
#[cfg(feature = "embedded-mistral")]
pub mod mistral;

mod gguf;
