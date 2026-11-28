//! Private, service-owned llama.cpp helper. Construction never starts a process or probes hardware.
use super::runtime::{Artifact, Driver, Kernel, KernelState};
use crate::{
    factory::*,
    providers::{
        AdapterError, InferenceStream, Provider,
        http::{Capabilities, Credentials, Dialect, Endpoint, HttpProvider, Secret},
    },
};
use ironloom_core::{BoxFuture, Counter, InferenceId};
use ironloom_observability::factory::BillingMode;
use sha2::{Digest, Sha256};
use std::{io::Write, path::PathBuf, process::Stdio, sync::Arc, time::Duration};
use tokio::{
    io::AsyncReadExt,
    process::{Child, Command},
    sync::{Mutex, mpsc},
};
const STARTUP_TIMEOUT: Duration = Duration::from_secs(120);
const STOP_TIMEOUT: Duration = Duration::from_secs(30);
const OUTPUT_CAPACITY: usize = 128;
const MAX_BINARY_BYTES: u64 = 512 * 1024 * 1024;
/// Official ggml-org/llama.cpp source revision required by this driver.
pub const REVISION: &str = "8e23278c7c36f4429fb237467d50e2935a91e655";
/// Explicit selected helper binary and its infrastructure-supplied SHA-256, never found through PATH.
pub struct LlamaDriver {
    executable: PathBuf,
    sha256: [u8; 32],
    capabilities: EngineCapabilities,
}
impl LlamaDriver {
    /// Creates an inert CPU integration; unsupported backends require their own qualified build.
    pub fn new(
        executable: PathBuf,
        sha256: [u8; 32],
        capabilities: EngineCapabilities,
    ) -> Result<Self, AdapterError> {
        if !executable.is_absolute()
            || capabilities.engine.name.as_str() != "llama.cpp"
            || capabilities.engine.version.as_str() != REVISION
            || capabilities.engine.backend.as_str() != "cpu"
        {
            return Err(AdapterError::Unsupported);
        }
        Ok(Self {
            executable,
            sha256,
            capabilities,
        })
    }
}
struct Key(String);
impl Credentials for Key {
    fn resolve<'a>(
        &'a self,
        _: &'a InferenceRequest,
    ) -> BoxFuture<'a, Result<Secret, AdapterError>> {
        Box::pin(async { Secret::new(self.0.clone()) })
    }
}
struct Facts {
    child: Child,
    active: Option<InferenceId>,
    last_used: Option<Counter>,
    stopped: bool,
}
struct Inner {
    facts: Mutex<Facts>,
    provider: HttpProvider,
    _key_file: tempfile::NamedTempFile,
}
struct LlamaKernel(Arc<Inner>);
impl Driver for LlamaDriver {
    fn capabilities(&self) -> EngineCapabilities {
        self.capabilities.clone()
    }
    fn load<'a>(
        &'a self,
        request: &'a EngineLoadRequest,
        artifact: Artifact,
    ) -> BoxFuture<'a, Result<Arc<dyn Kernel>, AdapterError>> {
        Box::pin(async move {
            if request.selection.engine.as_ref() != Some(&self.capabilities.engine)
                || artifact.weights.len() != 1
                || artifact.tokenizer.is_some()
                || request.options.concurrency.get() != 1
            {
                return Err(AdapterError::Unsupported);
            }
            if !artifact.root.is_absolute() {
                return Err(AdapterError::Unsupported);
            }
            let root = tokio::fs::canonicalize(&artifact.root)
                .await
                .map_err(|_| AdapterError::Unavailable)?;
            let weight = super::runtime::local_file(&root, &artifact.weights[0]).await?;
            if weight.extension().and_then(|v| v.to_str()) != Some("gguf") {
                return Err(AdapterError::Unsupported);
            }
            let file = tokio::fs::File::open(&self.executable)
                .await
                .map_err(|_| AdapterError::Unavailable)?;
            let mut bytes = Vec::new();
            file.take(MAX_BINARY_BYTES + 1)
                .read_to_end(&mut bytes)
                .await
                .map_err(|_| AdapterError::Unavailable)?;
            if bytes.len() as u64 > MAX_BINARY_BYTES
                || <[u8; 32]>::from(Sha256::digest(bytes)) != self.sha256
            {
                return Err(AdapterError::Unavailable);
            }
            let listener = std::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0))
                .map_err(|_| AdapterError::Unavailable)?;
            let port = listener
                .local_addr()
                .map_err(|_| AdapterError::Unavailable)?
                .port();
            let key = format!("{}{}", uuid::Uuid::new_v4(), uuid::Uuid::new_v4());
            let mut key_file =
                tempfile::NamedTempFile::new().map_err(|_| AdapterError::Unavailable)?;
            key_file
                .write_all(key.as_bytes())
                .map_err(|_| AdapterError::Unavailable)?;
            let mut command = Command::new(&self.executable);
            command
                .env_clear()
                .current_dir(&root)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .kill_on_drop(true)
                .arg("--model")
                .arg(weight)
                .arg("--alias")
                .arg(request.selection.model_id.as_str())
                .args(["--host", "127.0.0.1", "--port"])
                .arg(port.to_string())
                .args([
                    "--device",
                    "none",
                    "--n-gpu-layers",
                    "0",
                    "--split-mode",
                    "none",
                    "--fit",
                    "off",
                    "--offline",
                    "--no-warmup",
                    "--cache-ram",
                    "0",
                    "--jinja",
                    "--parallel",
                    "1",
                    "--ctx-size",
                ])
                .arg(request.options.context_tokens.get().to_string())
                .arg("--api-key-file")
                .arg(key_file.path());
            if let Some(template) = artifact.template {
                command
                    .arg("--chat-template-file")
                    .arg(super::runtime::local_file(&root, &template).await?);
            }
            drop(listener); // A collision fails startup; it never attaches to an existing service.
            let client = reqwest::Client::builder()
                .redirect(reqwest::redirect::Policy::none())
                .timeout(Duration::from_secs(2))
                .build()
                .map_err(|_| AdapterError::Unavailable)?;
            let child = command.spawn().map_err(|_| AdapterError::Unavailable)?;
            let base = url::Url::parse(&format!("http://127.0.0.1:{port}/v1/"))
                .map_err(|_| AdapterError::Unavailable)?;
            let provider = HttpProvider::new(
                Endpoint {
                    provider: request.selection.provider.clone(),
                    base: base.clone(),
                    dialect: Dialect::ChatCompletions,
                    billing: BillingMode::LocalEstimate,
                    capabilities: Capabilities {
                        streaming: true,
                        tools: self.capabilities.tools
                            && artifact.tools == CapabilitySupport::Supported,
                        reasoning_efforts: artifact.reasoning_efforts,
                        stream_usage: true,
                    },
                },
                Arc::new(Key(key.clone())),
            )?;
            let inner = Arc::new(Inner {
                facts: Mutex::new(Facts {
                    child,
                    active: None,
                    last_used: None,
                    stopped: false,
                }),
                provider,
                _key_file: key_file,
            });
            // This task owns partial startup even if the load caller disconnects.
            let startup = inner.clone();
            let (mut ready, waiting) = tokio::sync::oneshot::channel();
            tokio::spawn(async move {
                let startup_result = async {
                    tokio::time::timeout(STARTUP_TIMEOUT, async {
                        loop {
                            if startup
                                .facts
                                .lock()
                                .await
                                .child
                                .try_wait()
                                .map_err(|_| AdapterError::Unavailable)?
                                .is_some()
                            {
                                return Err(AdapterError::Unavailable);
                            }
                            if client
                                .get(base.join("models").map_err(|_| AdapterError::Unavailable)?)
                                .bearer_auth(&key)
                                .send()
                                .await
                                .is_ok_and(|response| response.status().is_success())
                            {
                                return Ok(());
                            }
                            tokio::time::sleep(Duration::from_millis(100)).await;
                        }
                    })
                    .await
                    .map_err(|_| AdapterError::Unavailable)
                    .and_then(|v| v)
                };
                let result = tokio::select! { _ = ready.closed() => Err(AdapterError::Interrupted), result = startup_result => result };
                let result = match result {
                    Ok(()) => Ok(Arc::new(LlamaKernel(startup.clone())) as Arc<dyn Kernel>),
                    Err(error) => {
                        let _ = stop(startup.clone()).await;
                        Err(error)
                    }
                };
                if ready.send(result).is_err() {
                    let _ = stop(startup).await;
                }
            });
            waiting.await.map_err(|_| AdapterError::Unavailable)?
        })
    }
}
async fn stop(inner: Arc<Inner>) -> Result<(), AdapterError> {
    // Spawned ownership makes kill/reap survive cancellation of the caller's future.
    tokio::spawn(async move {
        let mut facts = inner.facts.lock().await;
        if facts.stopped {
            return Ok(());
        }
        if facts
            .child
            .try_wait()
            .map_err(|_| AdapterError::Unavailable)?
            .is_none()
        {
            facts
                .child
                .start_kill()
                .map_err(|_| AdapterError::Unavailable)?;
            tokio::time::timeout(STOP_TIMEOUT, facts.child.wait())
                .await
                .map_err(|_| AdapterError::Interrupted)?
                .map_err(|_| AdapterError::Unavailable)?;
        }
        facts.stopped = true;
        facts.active = None;
        Ok(())
    })
    .await
    .map_err(|_| AdapterError::Unavailable)?
}
impl Provider for LlamaKernel {
    fn stream(
        &self,
        request: InferenceRequest,
    ) -> BoxFuture<'_, Result<InferenceStream, AdapterError>> {
        let inner = self.0.clone();
        Box::pin(async move {
            inner.provider.check(&request)?;
            let mut facts = inner.facts.lock().await;
            if facts.stopped
                || facts.active.is_some()
                || facts
                    .child
                    .try_wait()
                    .map_err(|_| AdapterError::Unavailable)?
                    .is_some()
            {
                return Err(AdapterError::Unavailable);
            }
            facts.active = Some(request.inference_id.clone());
            facts.last_used = Some(super::runtime::now()?);
            drop(facts);
            let (sender, receiver) = mpsc::channel(OUTPUT_CAPACITY);
            tokio::spawn(async move {
                let id = request.inference_id.clone();
                let mut terminal = false;
                if let Ok(mut output) = inner.provider.stream(request.clone()).await {
                    while let Some(event) = output.recv().await {
                        terminal |=
                            matches!(event.kind, ironloom_workers::factory::StreamKind::Completed);
                        // A slow service reader cannot prevent scoped helper cleanup indefinitely.
                        if tokio::time::timeout(STOP_TIMEOUT, sender.send(event))
                            .await
                            .is_err()
                        {
                            terminal = false;
                            break;
                        }
                    }
                }
                if terminal {
                    let mut facts = inner.facts.lock().await;
                    if facts.active.as_ref() == Some(&id) {
                        facts.active = None;
                    }
                } else {
                    if stop(inner).await.is_ok() {
                        let event = ironloom_workers::factory::WorkerEvent::new(
                            ironloom_workers::factory::WorkerEventData {
                                worker_id: request.worker_id.clone(),
                                turn_id: request.turn_id.clone(),
                                item_id: request.item_id.clone(),
                                assignment_id: request.assignment_id.clone(),
                                inference_id: Some(id),
                                tool_call_id: None,
                                kind: ironloom_workers::factory::StreamKind::TerminationConfirmed,
                                text: "Owned helper execution ended".into(),
                                usage: None,
                                state: Some(ironloom_queue::factory::ExecutionState::Terminated),
                            },
                        );
                        if let Ok(event) = event {
                            let _ = tokio::time::timeout(STOP_TIMEOUT, sender.send(event)).await;
                        }
                    }
                }
            });
            Ok(receiver)
        })
    }
    fn cancel(&self, id: InferenceId) -> BoxFuture<'_, Result<(), AdapterError>> {
        let inner = self.0.clone();
        Box::pin(async move {
            if inner.facts.lock().await.active.as_ref() != Some(&id) {
                return Err(AdapterError::Unavailable);
            }
            // One private helper, one request. Killing/reaping confirms only its own execution ended.
            stop(inner).await
        })
    }
}
impl Kernel for LlamaKernel {
    fn state(&self) -> BoxFuture<'_, Result<KernelState, AdapterError>> {
        Box::pin(async {
            let mut facts = self.0.facts.lock().await;
            let exited = facts
                .child
                .try_wait()
                .map_err(|_| AdapterError::Unavailable)?
                .is_some();
            if exited {
                facts.stopped = true;
                facts.active = None;
            }
            Ok(KernelState {
                alive: !facts.stopped,
                active: Some(facts.active.iter().cloned().collect()),
                cache_bytes: None,
                last_used_at_ms: facts.last_used,
            })
        })
    }
    fn stop(&self) -> BoxFuture<'_, Result<(), AdapterError>> {
        Box::pin(stop(self.0.clone()))
    }
}
