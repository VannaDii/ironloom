//! Local lifecycle shared by embedded and owned-helper drivers. Central policy owns admission/LRU.
use super::Engine;
use crate::{
    factory::*,
    providers::{AdapterError, InferenceStream, Provider},
};
use ironloom_core::{BoxFuture, Counter, InferenceId, ResidentModelId};
use ironloom_policy::factory::ResourceReservation;
use std::{
    path::PathBuf,
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};
use tokio::sync::Mutex;

/// Verified installation paths and metadata resolved by the service's current inventory.
/// Construction/metadata inspection must not load a model, initialize a device or infer.
#[derive(Clone)]
pub struct Artifact {
    /// Existing absolute installation root; never an upstream repository name to auto-download.
    pub root: PathBuf,
    /// Exact existing local weight files, relative to root.
    pub weights: Vec<PathBuf>,
    /// Existing explicitly selected tokenizer, when the format does not embed it.
    pub tokenizer: Option<PathBuf>,
    /// Existing explicitly selected template, when not embedded in the weights/configuration.
    pub template: Option<PathBuf>,
    /// Current metadata requirements and assumptions, including unknown estimates.
    pub requirements: EngineRequirements,
    /// Whether this model/template has known tool-call formatting support.
    pub tools: CapabilitySupport,
    /// Explicit effort labels supported by this model/template; empty means no effort control.
    pub reasoning_efforts: Vec<String>,
}
/// Trusted current inventory/reservation/session callbacks supplied by the service.
pub trait EngineAuthority: Send + Sync {
    /// Resolves exact verified checkpoint/revision/hash from durable inventory; no download/fallback.
    fn artifact<'a>(
        &'a self,
        request: &'a EngineLoadRequest,
    ) -> BoxFuture<'a, Result<Artifact, AdapterError>>;
    /// Rechecks current fenced central reservations and returns their stable resident identity.
    /// Implementations check the actual node, canonical placement, demand and current authorization.
    fn load<'a>(
        &'a self,
        request: &'a EngineLoadRequest,
        reservations: &'a [ResourceReservation],
    ) -> BoxFuture<'a, Result<ResidentModelId, AdapterError>>;
    /// Rechecks the current human/assignment/profile and live residency reservation before dispatch.
    fn inference<'a>(
        &'a self,
        request: &'a InferenceRequest,
        resident: &'a Residency,
    ) -> BoxFuture<'a, Result<(), AdapterError>>;
    /// Rechecks current unload/restart authority; this callback never selects an eviction candidate.
    fn unload<'a>(&'a self, resident: &'a Residency) -> BoxFuture<'a, Result<(), AdapterError>>;
    /// Returns cached authorized canonical resource observations; no constructor-side discovery.
    fn resources(
        &self,
        engine: EngineIdentity,
    ) -> BoxFuture<'_, Result<Vec<DeviceResourceObservation>, AdapterError>>;
}
/// Driver-observed process/runner facts. Unknown active requests must retain central reservations.
pub struct KernelState {
    /// True only while the owned helper/runner remains loaded and available.
    pub alive: bool,
    /// None means actual activity is unknown, not idle.
    pub active: Option<Vec<InferenceId>>,
    /// Actual isolated cache bytes, when observable.
    pub cache_bytes: Option<Counter>,
    /// Actual request-use timestamp, absent before the first request; never a status polling time.
    pub last_used_at_ms: Option<Counter>,
}
/// One private loaded engine instance. It never executes generated tools.
pub trait Kernel: Provider {
    /// Reads owned execution facts without generation, warm-up or device probes.
    fn state(&self) -> BoxFuture<'_, Result<KernelState, AdapterError>>;
    /// Stops/reaps this instance, confirming all its requests ended before returning success.
    /// Failure never proves reservations are free. No unrelated process may be affected.
    fn stop(&self) -> BoxFuture<'_, Result<(), AdapterError>>;
}
/// Actual SDK/helper loading mechanism; metadata-only capability checks remain separate.
pub trait Driver: Send + Sync {
    /// Exact compiled engine/backend capability manifest, with no hardware qualification claim.
    fn capabilities(&self) -> EngineCapabilities;
    /// Loads only the selected verified files after central admission. Ordinary tests inject a
    /// scripted driver; real engine loading is never part of constructors or metadata discovery.
    /// Failure must stop/reap owned partial startup, preserving unrelated hosts/services.
    fn load<'a>(
        &'a self,
        request: &'a EngineLoadRequest,
        artifact: Artifact,
    ) -> BoxFuture<'a, Result<Arc<dyn Kernel>, AdapterError>>;
}
struct Loaded {
    record: Residency,
    options: EngineLoadOptions,
    kernel: Arc<dyn Kernel>,
}
struct State {
    generation: Counter,
    loaded: Option<Loaded>,
    failed: bool,
}
/// Real lifecycle delegator; only central service callbacks authorize admission and dispatch.
pub struct LocalEngine {
    driver: Arc<dyn Driver>,
    authority: Arc<dyn EngineAuthority>,
    state: Arc<Mutex<State>>,
}
impl LocalEngine {
    /// Creates an inert engine with no loaded weights, processes, GPU discovery or inference.
    pub fn new(driver: Arc<dyn Driver>, authority: Arc<dyn EngineAuthority>) -> Self {
        Self {
            driver,
            authority,
            state: Arc::new(Mutex::new(State {
                generation: Counter::new(1),
                loaded: None,
                failed: false,
            })),
        }
    }
    fn check(&self, request: &EngineLoadRequest) -> Result<(), AdapterError> {
        if request.selection.engine.as_ref() != Some(&self.driver.capabilities().engine)
            || request.selection.devices.len() != 1
            || request.options.concurrency.get() != 1
            || request.options.draft.is_some()
            || request.options.cache.is_some()
            || !request.options.accelerators.is_empty()
        {
            return Err(AdapterError::Unsupported);
        }
        Ok(())
    }
}
impl Provider for LocalEngine {
    fn stream(
        &self,
        request: InferenceRequest,
    ) -> BoxFuture<'_, Result<InferenceStream, AdapterError>> {
        Box::pin(async move {
            let mut state = self.state.lock().await;
            let loaded = state.loaded.as_mut().ok_or(AdapterError::Unavailable)?;
            if !weights_match(&loaded.record.selection, &request.selection)
                || request.engine_options.as_ref() != Some(&loaded.options)
            {
                return Err(AdapterError::Unsupported);
            }
            self.authority.inference(&request, &loaded.record).await?;
            let observed = loaded.kernel.state().await?;
            if !observed.alive
                || observed
                    .active
                    .as_ref()
                    .is_none_or(|active| !active.is_empty())
            {
                return Err(AdapterError::Unavailable);
            }
            loaded.kernel.stream(request).await
        })
    }
    fn cancel(&self, id: InferenceId) -> BoxFuture<'_, Result<(), AdapterError>> {
        Box::pin(async move {
            let state = self.state.lock().await;
            let loaded = state.loaded.as_ref().ok_or(AdapterError::Unavailable)?;
            // The trusted service already authorizes cancellation against its actual assignment.
            // A request is distinct from termination; only the kernel's later facts confirm stop.
            loaded.kernel.cancel(id).await
        })
    }
}
impl Engine for LocalEngine {
    fn capabilities(&self) -> EngineCapabilities {
        self.driver.capabilities()
    }
    fn requirements(
        &self,
        request: EngineLoadRequest,
    ) -> BoxFuture<'_, Result<EngineRequirements, AdapterError>> {
        Box::pin(async move {
            if self.check(&request).is_err() {
                return EngineRequirements::new(EngineRequirementsData {compatibility:Compatibility::Unsupported,reason:"Requested engine/backend/placement or optional feature is not supported by this compiled driver".into(),target_weight_bytes:None,draft_weight_bytes:None,cache_bytes:None,runtime_overhead_bytes:None,accelerator_bytes:None}).map_err(|_|AdapterError::Unavailable);
            }
            Ok(self.authority.artifact(&request).await?.requirements)
        })
    }
    fn load(
        &self,
        request: EngineLoadRequest,
        reservations: Vec<ResourceReservation>,
    ) -> BoxFuture<'_, Result<Residency, AdapterError>> {
        let checked = self.check(&request);
        let authority = self.authority.clone();
        let driver = self.driver.clone();
        let state = self.state.clone();
        Box::pin(async move {
            checked?;
            // Service-admitted loading owns its lifecycle even if an HTTP/task caller disappears.
            // The same shared slot remains locked until startup is recorded or cleaned up.
            tokio::spawn(async move {
                let resident = authority.load(&request, &reservations).await?;
                let reserved = reservations
                    .iter()
                    .try_fold(0u64, |total, reservation| {
                        total.checked_add(reservation.bytes.get())
                    })
                    .ok_or(AdapterError::Unavailable)?;
                if reserved == 0 {
                    return Err(AdapterError::Unavailable);
                }
                let mut state = state.lock().await;
                if let Some(loaded) = state.loaded.as_ref() {
                    if loaded.record.resident_id != resident
                        || !weights_match(&loaded.record.selection, &request.selection)
                        || loaded.options != request.options
                    {
                        return Err(AdapterError::Unsupported);
                    }
                    return residency(loaded).await;
                }
                if state.failed {
                    return Err(AdapterError::Unavailable);
                }
                let artifact = authority.artifact(&request).await?;
                if artifact.requirements.compatibility != Compatibility::Supported {
                    return Err(AdapterError::Unsupported);
                }
                match driver.load(&request, artifact).await {
                    Ok(kernel) => {
                        let record = Residency::new(ResidencyData {
                            resident_id: resident,
                            selection: request.selection.clone(),
                            draft: request.options.draft.clone(),
                            observed_cache_bytes: None,
                            active_requests: Counter::new(0),
                            last_used_at_ms: now()?,
                            reserved_bytes: Counter::new(reserved),
                        })
                        .map_err(|_| AdapterError::Unavailable)?;
                        let loaded = Loaded {
                            record,
                            options: request.options.clone(),
                            kernel,
                        };
                        state.loaded = Some(loaded);
                        residency(state.loaded.as_ref().ok_or(AdapterError::Unavailable)?).await
                    }
                    Err(error) => {
                        state.failed = true;
                        Err(error)
                    }
                }
            })
            .await
            .map_err(|_| AdapterError::Unavailable)?
        })
    }
    fn unload(&self, resident: ResidentModelId) -> BoxFuture<'_, Result<(), AdapterError>> {
        Box::pin(async move {
            let mut state = self.state.lock().await;
            let loaded = state.loaded.as_ref().ok_or(AdapterError::Unavailable)?;
            if loaded.record.resident_id != resident {
                return Err(AdapterError::Unavailable);
            }
            self.authority.unload(&loaded.record).await?;
            let observed = loaded.kernel.state().await?;
            if observed
                .active
                .as_ref()
                .is_none_or(|active| !active.is_empty())
            {
                return Err(AdapterError::Unavailable);
            }
            loaded.kernel.stop().await?;
            state.loaded = None;
            state.failed = false;
            Ok(())
        })
    }
    fn observe(&self, resident: ResidentModelId) -> BoxFuture<'_, Result<Residency, AdapterError>> {
        Box::pin(async move {
            let state = self.state.lock().await;
            let loaded = state
                .loaded
                .as_ref()
                .filter(|loaded| loaded.record.resident_id == resident)
                .ok_or(AdapterError::Unavailable)?;
            residency(loaded).await
        })
    }
    fn restart(
        &self,
        expected_generation: Counter,
    ) -> BoxFuture<'_, Result<EngineObservation, AdapterError>> {
        Box::pin(async move {
            {
                let mut state = self.state.lock().await;
                if state.generation != expected_generation {
                    return Err(AdapterError::Unavailable);
                }
                if let Some(loaded) = &state.loaded {
                    self.authority.unload(&loaded.record).await?;
                    loaded.kernel.stop().await?;
                }
                state.loaded = None;
                state.failed = false;
                state.generation = Counter::new(
                    state
                        .generation
                        .get()
                        .checked_add(1)
                        .ok_or(AdapterError::Unavailable)?,
                );
            }
            self.status().await
        })
    }
    fn status(&self) -> BoxFuture<'_, Result<EngineObservation, AdapterError>> {
        Box::pin(async move {
            let state = self.state.lock().await;
            let engine = self.driver.capabilities().engine.clone();
            let resources = self.authority.resources(engine.clone()).await?;
            let (lifecycle, residents, active, failure) = if state.failed {
                (
                    EngineState::Failed,
                    None,
                    None,
                    Some(EngineFailure::Unavailable),
                )
            } else if let Some(loaded) = &state.loaded {
                match loaded.kernel.state().await {
                    Ok(observed) if observed.alive && observed.active.is_some() => (
                        EngineState::Ready,
                        Some(vec![residency(loaded).await?]),
                        observed.active,
                        None,
                    ),
                    Ok(observed)
                        if !observed.alive
                            && observed.active.as_ref().is_some_and(Vec::is_empty) =>
                    {
                        (EngineState::Stopped, Some(vec![]), Some(vec![]), None)
                    }
                    _ => (
                        EngineState::Failed,
                        None,
                        None,
                        Some(EngineFailure::Unavailable),
                    ),
                }
            } else {
                (EngineState::Stopped, Some(vec![]), Some(vec![]), None)
            };
            EngineObservation::new(EngineObservationData {
                engine,
                generation: state.generation,
                state: lifecycle,
                observed_at_ms: now()?,
                residents,
                active_inferences: active,
                devices: resources,
                failure,
            })
            .map_err(|_| AdapterError::Unavailable)
        })
    }
}
async fn residency(loaded: &Loaded) -> Result<Residency, AdapterError> {
    let observed = loaded.kernel.state().await?;
    if !observed.alive {
        return Err(AdapterError::Unavailable);
    }
    let active = observed.active.ok_or(AdapterError::Unavailable)?;
    let mut value = (*loaded.record).clone();
    value.active_requests = Counter::new(active.len() as u64);
    value.observed_cache_bytes = observed.cache_bytes;
    if let Some(used) = observed.last_used_at_ms {
        value.last_used_at_ms = used;
    }
    // Never resets LRU time from a mere status poll. Drivers/service persist actual use separately.
    Residency::new(value).map_err(|_| AdapterError::Unavailable)
}
fn weights_match(a: &ModelSelection, b: &ModelSelection) -> bool {
    a.model_id == b.model_id
        && a.revision == b.revision
        && a.quantization == b.quantization
        && a.checkpoint_hash == b.checkpoint_hash
        && a.engine == b.engine
        && a.devices == b.devices
}
pub(crate) fn now() -> Result<Counter, AdapterError> {
    Ok(Counter::new(
        u64::try_from(
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_err(|_| AdapterError::Unavailable)?
                .as_millis(),
        )
        .map_err(|_| AdapterError::Unavailable)?,
    ))
}

/// Resolves one inventory-selected file, rejecting traversal and symlinks escaping its root.
pub(crate) async fn local_file(
    root: &std::path::Path,
    relative: &std::path::Path,
) -> Result<PathBuf, AdapterError> {
    if relative.is_absolute()
        || relative
            .components()
            .any(|part| !matches!(part, std::path::Component::Normal(_)))
    {
        return Err(AdapterError::Unsupported);
    }
    let path = tokio::fs::canonicalize(root.join(relative))
        .await
        .map_err(|_| AdapterError::Unavailable)?;
    if !path.starts_with(root)
        || !tokio::fs::metadata(&path)
            .await
            .map_err(|_| AdapterError::Unavailable)?
            .is_file()
    {
        return Err(AdapterError::Unavailable);
    }
    Ok(path)
}
