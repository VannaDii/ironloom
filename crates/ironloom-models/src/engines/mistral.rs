//! Embedded CPU mistral.rs SDK, with private runner lifetime and no automatic tool execution.
use super::runtime::{Artifact, Driver, Kernel, KernelState};
use crate::{
    factory::*,
    providers::{
        AdapterError, InferenceStream, Provider,
        http::{Dialect, Normalizer},
    },
};
use ironloom_core::{BoxFuture, Counter, InferenceId};
use ironloom_workers::factory::{StreamKind, WorkerEvent, WorkerEventData};
use mistralrs::{
    Model, Request, RequestBuilder, RequestLike, Response, TextMessageRole, TextModelBuilder,
    TokenSource,
};
use serde_json::json;
use std::{
    sync::{Arc, Mutex as StdMutex},
    time::Duration,
};
use tokio::{
    io::AsyncReadExt,
    sync::{Mutex, mpsc},
};
const STOP_TIMEOUT: Duration = Duration::from_secs(30);
const OUTPUT_CAPACITY: usize = 128;
const MAX_INDEX_BYTES: u64 = 4 * 1024 * 1024;
const MAX_SUPPORT_BYTES: u64 = 256 * 1024 * 1024;
const INDEX_FILE: &str = "model.safetensors.index.json";
/// Official EricLBuehler/mistral.rs SDK revision, package mistralrs 0.10.0.
pub const REVISION: &str = "21da642fdd2210c30ca4028e1eabdd28e9c602fd";
/// Inert embedded integration; this compiled profile supports CPU safetensors without Python.
pub struct MistralDriver {
    capabilities: EngineCapabilities,
}
impl MistralDriver {
    /// Requires explicit engine/version/backend; constructing does not initialize the SDK.
    pub fn new(capabilities: EngineCapabilities) -> Result<Self, AdapterError> {
        if capabilities.engine.name.as_str() != "mistral.rs"
            || capabilities.engine.version.as_str() != REVISION
            || capabilities.engine.backend.as_str() != "cpu"
        {
            return Err(AdapterError::Unsupported);
        }
        Ok(Self { capabilities })
    }
}
struct Facts {
    alive: bool,
    stopping: bool,
    active: Option<InferenceId>,
    last_used: Option<Counter>,
}
struct Inner {
    model: Mutex<Option<Arc<Model>>>,
    sender: mpsc::Sender<Request>,
    facts: StdMutex<Facts>,
    tools: bool,
    efforts: Vec<String>,
    _view: tempfile::TempDir,
}
struct MistralKernel(Arc<Inner>);
impl Driver for MistralDriver {
    fn capabilities(&self) -> EngineCapabilities {
        self.capabilities.clone()
    }
    fn load<'a>(
        &'a self,
        request: &'a EngineLoadRequest,
        artifact: Artifact,
        _resident: ironloom_core::ResidentModelId,
    ) -> BoxFuture<'a, Result<Arc<dyn Kernel>, AdapterError>> {
        Box::pin(async move {
            if request.selection.engine.as_ref() != Some(&self.capabilities.engine)
                || request.options.concurrency.get() != 1
                || artifact.weights.is_empty()
                || artifact.native_device.is_some()
            {
                return Err(AdapterError::Unsupported);
            }
            if !artifact.root.is_absolute() {
                return Err(AdapterError::Unsupported);
            }
            let root = tokio::fs::canonicalize(&artifact.root)
                .await
                .map_err(|_| AdapterError::Unavailable)?;
            let view = verified_view(&root, &artifact.weights).await?;
            // The SDK receives an isolated view whose generated index resolves only the admitted
            // canonical files. Source indexes/extra shards never select another weight set.
            let mut builder = TextModelBuilder::new(view.path().to_string_lossy())
                .with_token_source(TokenSource::None)
                .with_device(mistralrs::Device::Cpu)
                .with_force_cpu()
                .with_device_mapping(mistralrs::DeviceMapMetadata::dummy())
                .with_max_num_seqs(1)
                .with_prefix_cache_n(mistralrs::PrefixCacheCapacity::DISABLED)
                .with_max_model_len(
                    usize::try_from(request.options.context_tokens.get())
                        .map_err(|_| AdapterError::Unsupported)?,
                );
            let tokenizer = artifact
                .tokenizer
                .unwrap_or_else(|| "tokenizer.json".into());
            builder = builder.with_tokenizer_json(
                super::runtime::local_file(&root, &tokenizer)
                    .await?
                    .to_string_lossy(),
            );
            if let Some(template) = artifact.template {
                let path = super::runtime::local_file(&root, &template).await?;
                builder = builder.with_jinja_explicit(path.to_string_lossy().into_owned());
            }
            let tools = self.capabilities.tools && artifact.tools == CapabilitySupport::Supported;
            let (ready, waiting) = tokio::sync::oneshot::channel();
            tokio::spawn(async move {
                let result = builder
                    .build()
                    .await
                    .map_err(|_| AdapterError::Unavailable)
                    .and_then(|model| {
                        let sender = model
                            .inner()
                            .get_sender(None)
                            .map_err(|_| AdapterError::Unavailable)?;
                        Ok(Arc::new(Inner {
                            sender,
                            model: Mutex::new(Some(Arc::new(model))),
                            facts: StdMutex::new(Facts {
                                alive: true,
                                stopping: false,
                                active: None,
                                last_used: None,
                            }),
                            tools,
                            efforts: artifact.reasoning_efforts,
                            _view: view,
                        }))
                    })
                    .map_err(|_| AdapterError::Unavailable);
                match result {
                    Ok(inner) => {
                        if ready
                            .send(Ok(Arc::new(MistralKernel(inner.clone())) as Arc<dyn Kernel>))
                            .is_err()
                        {
                            let _ = stop(inner).await;
                        }
                    }
                    Err(error) => {
                        let _ = ready.send(Err(error));
                    }
                }
            });
            waiting.await.map_err(|_| AdapterError::Unavailable)?
        })
    }
}
async fn verified_view(
    root: &std::path::Path,
    weights: &[std::path::PathBuf],
) -> Result<tempfile::TempDir, AdapterError> {
    let mut approved = std::collections::BTreeSet::new();
    for weight in weights {
        let path = super::runtime::local_file(root, weight).await?;
        if path.extension().and_then(|value| value.to_str()) != Some("safetensors")
            || !approved.insert(path)
        {
            return Err(AdapterError::Unsupported);
        }
    }
    if approved.is_empty() {
        return Err(AdapterError::Unsupported);
    }
    let index = root.join(INDEX_FILE);
    if tokio::fs::try_exists(&index)
        .await
        .map_err(|_| AdapterError::Unavailable)?
    {
        let index = super::runtime::local_file(root, std::path::Path::new(INDEX_FILE)).await?;
        let mut bytes = Vec::new();
        tokio::fs::File::open(index)
            .await
            .map_err(|_| AdapterError::Unavailable)?
            .take(MAX_INDEX_BYTES + 1)
            .read_to_end(&mut bytes)
            .await
            .map_err(|_| AdapterError::Unavailable)?;
        if bytes.len() as u64 > MAX_INDEX_BYTES {
            return Err(AdapterError::Unsupported);
        }
        let index: serde_json::Value =
            serde_json::from_slice(&bytes).map_err(|_| AdapterError::Unsupported)?;
        let map = index["weight_map"]
            .as_object()
            .ok_or(AdapterError::Unsupported)?;
        let mut actual = std::collections::BTreeSet::new();
        for name in map.values() {
            let name = name.as_str().ok_or(AdapterError::Unsupported)?;
            if !name.ends_with(".safetensors") {
                return Err(AdapterError::Unsupported);
            }
            actual.insert(super::runtime::local_file(root, std::path::Path::new(name)).await?);
        }
        if actual != approved {
            return Err(AdapterError::Unsupported);
        }
    }
    let view = tempfile::Builder::new()
        .prefix("ironloom-engine-")
        .tempdir()
        .map_err(|_| AdapterError::Unavailable)?;
    let mut map = serde_json::Map::new();
    for (index, path) in approved.iter().enumerate() {
        let name = format!("verified-{index}.safetensors");
        tokio::fs::symlink(path, view.path().join(&name))
            .await
            .map_err(|_| AdapterError::Unavailable)?;
        map.insert(format!("verified-{index}"), name.into());
    }
    // Support metadata comes from the verified installation, while no source weight index or
    // auxiliary weight directory is exposed. The explicit tokenizer/template paths stay checked.
    for name in [
        "config.json",
        "tokenizer_config.json",
        "generation_config.json",
        "special_tokens_map.json",
        "chat_template.json",
        "chat_template.jinja",
    ] {
        if name == "config.json"
            || tokio::fs::try_exists(root.join(name))
                .await
                .map_err(|_| AdapterError::Unavailable)?
        {
            let source = super::runtime::local_file(root, std::path::Path::new(name)).await?;
            if tokio::fs::metadata(&source)
                .await
                .map_err(|_| AdapterError::Unavailable)?
                .len()
                > MAX_SUPPORT_BYTES
            {
                return Err(AdapterError::Unsupported);
            }
            tokio::fs::copy(source, view.path().join(name))
                .await
                .map_err(|_| AdapterError::Unavailable)?;
        }
    }
    tokio::fs::write(
        view.path().join(INDEX_FILE),
        serde_json::to_vec(&json!({"weight_map":map})).map_err(|_| AdapterError::Unavailable)?,
    )
    .await
    .map_err(|_| AdapterError::Unavailable)?;
    Ok(view)
}
fn messages(request: &InferenceRequest) -> Result<RequestBuilder, AdapterError> {
    let mut builder = RequestBuilder::new().set_sampler_max_len(
        usize::try_from(request.controls.max_output_tokens.get())
            .map_err(|_| AdapterError::Unsupported)?,
    );
    for message in &request.messages {
        let role = match message.role {
            MessageRole::System => TextMessageRole::System,
            MessageRole::Developer => TextMessageRole::Custom("developer".into()),
            MessageRole::User => TextMessageRole::User,
            MessageRole::Assistant => TextMessageRole::Assistant,
            MessageRole::Tool => TextMessageRole::Tool,
        };
        if let Some(result) = &message.tool_result {
            builder = builder.add_tool_message(&result.content, result.tool_call_id.as_str());
        } else if !message.tool_calls.is_empty() {
            let calls = message
                .tool_calls
                .iter()
                .enumerate()
                .map(|(index, call)| mistralrs::ToolCallResponse {
                    index,
                    id: call.tool_call_id.as_str().to_owned(),
                    tp: mistralrs::ToolCallType::Function,
                    function: mistralrs::CalledFunction {
                        name: call.name.as_str().to_owned(),
                        arguments: call.arguments.to_string(),
                    },
                })
                .collect();
            builder = builder.add_message_with_tool_call(
                role,
                message.text.as_deref().unwrap_or(""),
                calls,
            );
        } else {
            builder = builder.add_message(role, message.text.as_deref().unwrap_or(""));
        }
    }
    let tools=request.tools.iter().map(|tool|serde_json::from_value(json!({"type":"function","function":{"name":tool.name,"description":tool.description,"parameters":tool.input_schema}})).map_err(|_|AdapterError::Unsupported)).collect::<Result<Vec<_>,_>>()?;
    builder = builder.set_tools(tools); // No callbacks, MCP, code/shell execution or agentic tool rounds.
    if let Some(effort) = &request.selection.reasoning_effort {
        let effort = match effort.as_str() {
            "off" => mistralrs::ReasoningEffort::Off,
            "low" => mistralrs::ReasoningEffort::Low,
            "medium" => mistralrs::ReasoningEffort::Medium,
            "high" => mistralrs::ReasoningEffort::High,
            "xhigh" => mistralrs::ReasoningEffort::XHigh,
            _ => return Err(AdapterError::Unsupported),
        };
        builder = builder.with_reasoning_effort(effort);
    }
    Ok(builder)
}
fn sdk_request(mut input: RequestBuilder, response: mpsc::Sender<Response>) -> Request {
    let (tools, tool_choice) = input
        .take_tools()
        .map(|(tools, choice)| (Some(tools), Some(choice)))
        .unwrap_or((None, None));
    Request::Normal(Box::new(mistralrs::NormalRequest {
        audio_output: None,
        messages: input.take_messages(),
        sampling_params: input.take_sampling_params(),
        seed: None,
        response,
        return_logprobs: false,
        is_streaming: true,
        id: 0,
        queued_at: None,
        constraint: mistralrs::Constraint::None,
        suffix: None,
        tools,
        tool_choice,
        logits_processors: None,
        return_raw_logits: false,
        web_search_options: None,
        enable_code_execution: false,
        enable_shell: false,
        shell_options: None,
        code_execution_permission: None,
        code_execution_approval_notifier: None,
        agent_permission: None,
        agent_approval_handler: None,
        agent_approval_notifier: None,
        max_tool_rounds: None,
        tool_dispatch_url: None,
        model_id: None,
        adapter: None,
        truncate_sequence: false,
        session_id: None,
        files: None,
        input_files: vec![],
    }))
}
async fn dispatch(
    sender: &mpsc::Sender<Request>,
    input: RequestBuilder,
    deadline: tokio::time::Instant,
) -> Result<mpsc::Receiver<Response>, AdapterError> {
    let (response, output) = mpsc::channel(1);
    tokio::time::timeout_at(deadline, sender.send(sdk_request(input, response)))
        .await
        .map_err(|_| AdapterError::Interrupted)?
        .map_err(|_| AdapterError::Unavailable)?;
    Ok(output)
}
async fn stop(inner: Arc<Inner>) -> Result<(), AdapterError> {
    let task = tokio::spawn(async move {
        let mut slot = inner.model.lock().await;
        let Some(model) = slot.take() else {
            return Ok(());
        };
        inner
            .facts
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .stopping = true;
        // TerminateAllSeqsNextStep is global upstream state: NEVER use it. This sender is private.
        // Capture once during service-admitted loading. get_sender() may auto-reboot/reload;
        // cancellation and status must never invoke that SDK behavior.
        let _ = inner.sender.send(Request::Terminate).await;
        let wait = tokio::time::timeout(STOP_TIMEOUT, async {
            while Arc::strong_count(&model) > 1 {
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await;
        if wait.is_err() {
            *slot = Some(model);
            return Err(AdapterError::Interrupted);
        }
        // Last Model drops the private runner; its upstream Drop terminates and joins engine threads.
        tokio::task::spawn_blocking(move || drop(model))
            .await
            .map_err(|_| AdapterError::Unavailable)?;
        let mut facts = inner.facts.lock().unwrap_or_else(|e| e.into_inner());
        facts.alive = false;
        facts.stopping = false;
        facts.active = None;
        Ok(())
    });
    tokio::time::timeout(STOP_TIMEOUT, task)
        .await
        .map_err(|_| AdapterError::Interrupted)?
        .map_err(|_| AdapterError::Unavailable)?
}
impl Provider for MistralKernel {
    fn stream(
        &self,
        request: InferenceRequest,
    ) -> BoxFuture<'_, Result<InferenceStream, AdapterError>> {
        let inner = self.0.clone();
        Box::pin(async move {
            if (!request.tools.is_empty() && !inner.tools)
                || request
                    .selection
                    .reasoning_effort
                    .as_ref()
                    .is_some_and(|effort| !inner.efforts.iter().any(|v| v == effort.as_str()))
            {
                return Err(AdapterError::Unsupported);
            }
            let input = messages(&request)?;
            let slot = inner.model.lock().await;
            let model = slot.as_ref().ok_or(AdapterError::Unavailable)?.clone();
            {
                let mut facts = inner.facts.lock().unwrap_or_else(|e| e.into_inner());
                if !facts.alive
                    || facts.stopping
                    || facts.active.is_some()
                    || inner.sender.is_closed()
                {
                    return Err(AdapterError::Unavailable);
                }
                facts.active = Some(request.inference_id.clone());
                facts.last_used = Some(super::runtime::now()?);
            }
            drop(slot);
            let (sender, receiver) = mpsc::channel(OUTPUT_CAPACITY);
            tokio::spawn(async move {
                let mut normal = Normalizer::new(request.clone(), Dialect::ChatCompletions);
                let deadline = tokio::time::Instant::now()
                    + Duration::from_millis(request.controls.max_duration_ms.get());
                let result: Result<(), AdapterError> = async {
                    let mut output = dispatch(&inner.sender, input, deadline).await?;
                    let _ = sender
                        .send(normal.event(StreamKind::Started, String::new(), None))
                        .await;
                    loop {
                        let response = tokio::time::timeout_at(deadline, output.recv())
                            .await
                            .map_err(|_| AdapterError::Interrupted)?
                            .ok_or(AdapterError::Interrupted)?;
                        let mut terminal = false;
                        let events = match response {
                            Response::Chunk(chunk) => {
                                let value = serde_json::to_value(chunk)
                                    .map_err(|_| AdapterError::Interrupted)?;
                                let mut events = normal.frame(&value.to_string())?;
                                if value["choices"].as_array().is_some_and(|choices| {
                                    choices
                                        .iter()
                                        .any(|choice| !choice["finish_reason"].is_null())
                                }) {
                                    events.extend(normal.frame("[DONE]")?);
                                    terminal = true;
                                }
                                events
                            }
                            Response::Done(done) => {
                                terminal = true;
                                normal.nonstream(
                                    serde_json::to_value(done)
                                        .map_err(|_| AdapterError::Interrupted)?,
                                )?
                            }
                            _ => return Err(AdapterError::Interrupted),
                        };
                        for event in events {
                            tokio::time::timeout_at(deadline, sender.send(event))
                                .await
                                .map_err(|_| AdapterError::Interrupted)?
                                .map_err(|_| AdapterError::Interrupted)?;
                        }
                        if terminal {
                            return Ok(());
                        }
                    }
                }
                .await;
                drop(model); // Release borrowed runner before scoped stop waits for final join.
                if result.is_err() {
                    if let Ok(usage) = normal.accounting_event() {
                        let _ = tokio::time::timeout(STOP_TIMEOUT, sender.send(usage)).await;
                    }
                    if stop(inner.clone()).await.is_ok() {
                        let event = WorkerEvent::new(WorkerEventData {
                            worker_id: request.worker_id.clone(),
                            turn_id: request.turn_id.clone(),
                            item_id: request.item_id.clone(),
                            assignment_id: request.assignment_id.clone(),
                            inference_id: Some(request.inference_id.clone()),
                            tool_call_id: None,
                            kind: StreamKind::TerminationConfirmed,
                            text: "Private embedded runner ended".into(),
                            usage: None,
                            state: Some(ironloom_queue::factory::ExecutionState::Terminated),
                        });
                        if let Ok(event) = event {
                            let _ = tokio::time::timeout(STOP_TIMEOUT, sender.send(event)).await;
                        }
                    }
                } else {
                    inner.facts.lock().unwrap_or_else(|e| e.into_inner()).active = None;
                }
            });
            Ok(receiver)
        })
    }
    fn cancel(&self, id: InferenceId) -> BoxFuture<'_, Result<(), AdapterError>> {
        let inner = self.0.clone();
        Box::pin(async move {
            if inner
                .facts
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .active
                .as_ref()
                != Some(&id)
            {
                return Err(AdapterError::Unavailable);
            }
            stop(inner).await
        })
    }
}
impl Kernel for MistralKernel {
    fn state(&self) -> BoxFuture<'_, Result<KernelState, AdapterError>> {
        Box::pin(async {
            let facts = self.0.facts.lock().unwrap_or_else(|e| e.into_inner());
            Ok(KernelState {
                alive: facts.alive,
                active: if facts.stopping || (facts.alive && self.0.sender.is_closed()) {
                    None
                } else {
                    Some(facts.active.iter().cloned().collect())
                },
                cache_bytes: None,
                last_used_at_ms: facts.last_used,
            })
        })
    }
    fn stop(&self) -> BoxFuture<'_, Result<(), AdapterError>> {
        Box::pin(stop(self.0.clone()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use mistralrs::RequestLike;
    #[tokio::test]
    async fn sdk_view_rejects_index_escape_and_undeclared_shards_without_loading() {
        let root = tempfile::tempdir().unwrap();
        tokio::fs::write(root.path().join("config.json"), b"{}")
            .await
            .unwrap();
        tokio::fs::write(root.path().join("approved.safetensors"), b"inert")
            .await
            .unwrap();
        tokio::fs::write(root.path().join("extra.safetensors"), b"inert")
            .await
            .unwrap();
        let weights = vec!["approved.safetensors".into()];
        for path in ["../outside.safetensors", "extra.safetensors"] {
            tokio::fs::write(
                root.path().join(INDEX_FILE),
                serde_json::to_vec(&json!({"weight_map":{"tensor":path}})).unwrap(),
            )
            .await
            .unwrap();
            assert!(verified_view(root.path(), &weights).await.is_err());
        }
        tokio::fs::remove_file(root.path().join(INDEX_FILE))
            .await
            .unwrap();
        let view = verified_view(root.path(), &weights).await.unwrap();
        assert!(!view.path().join("extra.safetensors").exists());
        let index: serde_json::Value =
            serde_json::from_slice(&tokio::fs::read(view.path().join(INDEX_FILE)).await.unwrap())
                .unwrap();
        let entries = index["weight_map"].as_object().unwrap();
        assert_eq!(entries.len(), 1);
        let actual = tokio::fs::canonicalize(
            view.path()
                .join(entries.values().next().unwrap().as_str().unwrap()),
        )
        .await
        .unwrap();
        assert_eq!(
            actual,
            tokio::fs::canonicalize(root.path().join("approved.safetensors"))
                .await
                .unwrap()
        );
    }
    #[tokio::test]
    async fn closed_private_sender_never_reloads_or_reboots_an_engine() {
        let (sender, receiver) = mpsc::channel(1);
        drop(receiver);
        assert!(matches!(
            dispatch(
                &sender,
                RequestBuilder::new(),
                tokio::time::Instant::now() + Duration::from_secs(1)
            )
            .await,
            Err(AdapterError::Unavailable)
        ));
        let (response, _output) = mpsc::channel(1);
        let Request::Normal(request) =
            sdk_request(RequestBuilder::new().set_sampler_max_len(17), response)
        else {
            panic!("expected typed SDK request")
        };
        assert!(
            !request.enable_code_execution && !request.enable_shell && !request.truncate_sequence
        );
        assert!(
            request.max_tool_rounds.is_none()
                && request.tool_dispatch_url.is_none()
                && request.session_id.is_none()
        );
        assert!(request.web_search_options.is_none() && request.agent_approval_handler.is_none());
        assert_eq!(request.sampling_params.max_len, Some(17));
    }
    #[test]
    fn shared_decode_preserves_roles_tools_and_effort_in_actual_sdk_request_without_execution() {
        let corpus: serde_json::Value =
            serde_json::from_str(include_str!("../../../../fixtures/contracts/decode.json"))
                .unwrap();
        let mut value = corpus["cases"]
            .as_array()
            .unwrap()
            .iter()
            .find(|case| case["name"] == "role-and-tool-roundtrip")
            .unwrap()["input"]
            .clone();
        value["messages"].as_array_mut().unwrap().insert(
            0,
            json!({"role":"developer","text":"authorized instructions","tool_calls":[]}),
        );
        value["selection"]["reasoning_effort"] = "high".into();
        let request: InferenceRequest =
            ironloom_core::validation::decode(&serde_json::to_vec(&value).unwrap()).unwrap();
        let mut builder = messages(&request).unwrap();
        assert!(!builder.enable_code_execution());
        assert!(!builder.enable_shell());
        assert!(builder.take_web_search_options().is_none());
        assert!(builder.max_tool_rounds().is_none());
        let mistralrs::RequestMessage::Chat {
            messages,
            reasoning_effort,
            ..
        } = builder.take_messages()
        else {
            panic!("expected text chat");
        };
        let messages = serde_json::to_value(messages).unwrap();
        assert_eq!(messages[0]["role"]["Left"], "developer");
        assert_eq!(messages[0]["content"]["Left"], "authorized instructions");
        let call = messages
            .as_array()
            .unwrap()
            .iter()
            .find(|message| message.get("tool_calls").is_some())
            .unwrap();
        let result = messages
            .as_array()
            .unwrap()
            .iter()
            .find(|message| message["role"]["Left"] == "tool")
            .unwrap();
        assert_eq!(
            call["tool_calls"]["Right"][0]["id"],
            result["tool_call_id"]["Left"]
        );
        assert_eq!(
            call["tool_calls"]["Right"][0]["function"]["name"],
            request
                .messages
                .iter()
                .flat_map(|message| &message.tool_calls)
                .next()
                .unwrap()
                .name
                .as_str()
        );
        assert_eq!(reasoning_effort, Some(mistralrs::ReasoningEffort::High));
        assert!(!builder.take_tools().unwrap().0.is_empty());
    }
}
