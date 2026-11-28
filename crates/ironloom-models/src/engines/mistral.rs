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
    Model, Request, RequestBuilder, Response, TextMessageRole, TextModelBuilder, TokenSource,
};
use serde_json::json;
use std::{
    sync::{Arc, Mutex as StdMutex},
    time::Duration,
};
use tokio::sync::{Mutex, mpsc};
const STOP_TIMEOUT: Duration = Duration::from_secs(30);
const OUTPUT_CAPACITY: usize = 128;
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
    facts: StdMutex<Facts>,
    tools: bool,
    efforts: Vec<String>,
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
    ) -> BoxFuture<'a, Result<Arc<dyn Kernel>, AdapterError>> {
        Box::pin(async move {
            if request.selection.engine.as_ref() != Some(&self.capabilities.engine)
                || request.options.concurrency.get() != 1
                || artifact.weights.is_empty()
            {
                return Err(AdapterError::Unsupported);
            }
            if !artifact.root.is_absolute() {
                return Err(AdapterError::Unsupported);
            }
            let root = tokio::fs::canonicalize(&artifact.root)
                .await
                .map_err(|_| AdapterError::Unavailable)?;
            for weight in &artifact.weights {
                let path = super::runtime::local_file(&root, weight).await?;
                if path.extension().and_then(|v| v.to_str()) != Some("safetensors") {
                    return Err(AdapterError::Unsupported);
                }
            }
            // Explicit local directory and token source: never substitute a hub model or credential.
            super::runtime::local_file(&root, std::path::Path::new("config.json")).await?;
            let mut builder = TextModelBuilder::new(root.to_string_lossy())
                .with_token_source(TokenSource::None)
                .with_device(mistralrs::Device::Cpu)
                .with_force_cpu()
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
                let template = tokio::fs::read_to_string(path)
                    .await
                    .map_err(|_| AdapterError::Unavailable)?;
                builder = builder.with_chat_template(template);
            }
            let tools = self.capabilities.tools && artifact.tools == CapabilitySupport::Supported;
            let (ready, waiting) = tokio::sync::oneshot::channel();
            tokio::spawn(async move {
                let result = builder
                    .build()
                    .await
                    .map(|model| {
                        Arc::new(Inner {
                            model: Mutex::new(Some(Arc::new(model))),
                            facts: StdMutex::new(Facts {
                                alive: true,
                                stopping: false,
                                active: None,
                                last_used: None,
                            }),
                            tools,
                            efforts: artifact.reasoning_efforts,
                        })
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
        let sender = model
            .inner()
            .get_sender(None)
            .map_err(|_| AdapterError::Unavailable);
        if let Ok(sender) = sender {
            let _ = sender.send(Request::Terminate).await;
        }
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
                if !facts.alive || facts.stopping || facts.active.is_some() {
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
                    let mut output = model
                        .stream_chat_request(input)
                        .await
                        .map_err(|_| AdapterError::Unavailable)?;
                    let _ = sender
                        .send(normal.event(StreamKind::Started, String::new(), None))
                        .await;
                    loop {
                        let response = tokio::time::timeout_at(deadline, output.next())
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
                active: if facts.stopping {
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
