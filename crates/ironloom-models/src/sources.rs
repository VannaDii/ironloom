//! Source metadata/download port; publisher identity is not the hosting hub.
use crate::{
    factory::{DownloadProgress, ModelSource, SourcePage, SourceQuery},
    providers::AdapterError,
};
use ironloom_core::{ActorId, BoxFuture};
/// Source-specific access and resumable transfer; no generation/embedding probes.
pub trait Sources: Send + Sync {
    /// Searches/browses metadata without inference; preserve publisher/host/access/license distinctions.
    /// Continuation tokens are valid only for the same query, source and authenticated account.
    fn search(&self, query: SourceQuery) -> BoxFuture<'_, Result<SourcePage, AdapterError>>;
    /// Fetches access/license/revision metadata without inference.
    fn metadata(&self, repository: ActorId) -> BoxFuture<'_, Result<ModelSource, AdapterError>>;
    /// Rechecks current access and resumes service-owned download state.
    fn download(
        &self,
        progress: DownloadProgress,
    ) -> BoxFuture<'_, Result<DownloadProgress, AdapterError>>;
    /// Requests transfer cancellation; returned progress distinguishes request/confirmation.
    fn cancel(&self, download: ActorId) -> BoxFuture<'_, Result<DownloadProgress, AdapterError>>;
}
