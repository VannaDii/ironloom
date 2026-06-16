#![forbid(unsafe_code)]

use std::collections::BTreeMap;

use ironloom_core::{CorrelationId, WorkItemId};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;

/// Executable worker registered with the in-process runtime.
pub trait Worker {
    /// Stable worker name used in dispatch requests.
    fn name(&self) -> &'static str;

    /// Stable worker version used to reject stale dispatch requests.
    fn version(&self) -> &'static str;

    /// Runs the worker with a typed request envelope.
    fn run(&self, request: &WorkerRequest) -> WorkerResponse;
}

/// Worker dispatch failures that fail closed before side effects when possible.
#[derive(Debug, Error, Eq, PartialEq)]
pub enum WorkerError {
    /// No worker with the requested name was registered.
    #[error("unknown worker: {name}")]
    UnknownWorker {
        /// Requested worker name.
        name: String,
    },
    /// A worker with the requested name exists, but the requested version differs.
    #[error("worker {name} version mismatch: requested {requested}, registered {registered}")]
    VersionMismatch {
        /// Requested worker name.
        name: String,
        /// Requested worker version.
        requested: String,
        /// Registered worker version.
        registered: String,
    },
}

/// In-process worker registry used by the first runtime composition.
#[derive(Default)]
pub struct WorkerRegistry<'worker> {
    workers: BTreeMap<String, Box<dyn Worker + 'worker>>,
}

impl<'worker> WorkerRegistry<'worker> {
    /// Creates an empty worker registry.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Registers or replaces a worker by its stable name.
    pub fn register(&mut self, worker: impl Worker + 'worker) {
        self.workers
            .insert(worker.name().to_owned(), Box::new(worker));
    }

    /// Dispatches a request to a registered worker.
    pub fn dispatch(&self, request: &WorkerRequest) -> Result<WorkerResponse, WorkerError> {
        let worker =
            self.workers
                .get(&request.worker_name)
                .ok_or_else(|| WorkerError::UnknownWorker {
                    name: request.worker_name.clone(),
                })?;
        if worker.version() != request.worker_version {
            return Err(WorkerError::VersionMismatch {
                name: request.worker_name.clone(),
                requested: request.worker_version.clone(),
                registered: worker.version().to_owned(),
            });
        }
        Ok(worker.run(request))
    }
}

/// Stable worker request envelope that can later become an RPC contract.
#[derive(Clone, Debug, JsonSchema, PartialEq, Deserialize, Serialize)]
pub struct WorkerRequest {
    /// Worker name.
    pub worker_name: String,
    /// Worker version.
    pub worker_version: String,
    /// Work item identifier.
    pub work_item_id: WorkItemId,
    /// Request correlation identifier.
    pub correlation_id: CorrelationId,
    /// Worker-specific JSON payload.
    pub payload: Value,
}

/// Stable worker response envelope.
#[derive(Clone, Debug, JsonSchema, PartialEq, Deserialize, Serialize)]
pub struct WorkerResponse {
    /// Worker name.
    pub worker_name: String,
    /// Produced artifact identifiers.
    pub artifact_ids: Vec<String>,
    /// Worker-specific JSON payload.
    pub payload: Value,
}
