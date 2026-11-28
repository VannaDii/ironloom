//! HTTP integrations. Constructing an adapter never calls a provider or loads a model.
use super::{AdapterError, InferenceStream, Provider, sse::Decoder};
use crate::factory::{InferenceRequest, MessageRole, ToolInvocation, ToolInvocationData};
use ironloom_core::{ActorId, BoxFuture, Counter, InferenceId, ToolCallId};
use ironloom_observability::factory::{BillingMode, Usage, UsageBasis, UsageData};
use ironloom_queue::factory::ExecutionState;
use ironloom_workers::factory::{StreamKind, WorkerEvent, WorkerEventData};
use serde_json::{Value, json};
use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio::sync::{mpsc, watch};

const STREAM_CAPACITY: usize = 128;
const FINAL_FLUSH_TIMEOUT: Duration = Duration::from_secs(30);
const MAX_TOOL_CALLS: usize = 32;
const MAX_ACCOUNT_ID_BYTES: usize = 1024;
const OPENAI_ACCOUNT_BASE: &str = "https://chatgpt.com/backend-api/codex/";
const ANTHROPIC_VERSION: &str = "2023-06-01";
const MAX_MODEL_CATALOG_BYTES: usize = 4 * 1024 * 1024;

/// Protected resolved credential. Debug never prints submitted material.
pub struct Secret {
    token: String,
    account_id: Option<String>,
}
impl Secret {
    /// Creates a nonblank credential only inside trusted service adapter wiring.
    pub fn new(value: String) -> Result<Self, AdapterError> {
        if value.trim().is_empty() {
            return Err(AdapterError::Unavailable);
        }
        Ok(Self {
            token: value,
            account_id: None,
        })
    }
    /// Resolves a separately authorized, inference-eligible OpenAI account credential. The trusted
    /// service checks current use grants, account eligibility and refresh generation; native control
    /// enrollment alone never authorizes inference. Account identity remains in protected headers.
    pub fn account(token: String, account_id: String) -> Result<Self, AdapterError> {
        let mut secret = Self::new(token)?;
        if account_id.trim().is_empty()
            || account_id.len() > MAX_ACCOUNT_ID_BYTES
            || account_id.bytes().any(|byte| !byte.is_ascii_graphic())
        {
            return Err(AdapterError::Unavailable);
        }
        secret.account_id = Some(account_id);
        Ok(secret)
    }
}
impl std::fmt::Debug for Secret {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("[REDACTED]")
    }
}
/// Trusted service callback: enforce current credential-use authority before returning a secret.
pub trait Credentials: Send + Sync {
    /// Resolves only the explicitly selected reference and billing mode; never a fallback account.
    fn resolve<'a>(
        &'a self,
        request: &'a InferenceRequest,
    ) -> BoxFuture<'a, Result<Secret, AdapterError>>;
}
/// Explicit wire dialect, independent of billing authorization.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Dialect {
    /// OpenAI Responses, with eligible account inference on its explicitly selected Codex backend.
    Responses,
    /// Anthropic Messages with BYOK.
    Anthropic,
    /// An explicitly configured OpenAI Chat Completions-compatible endpoint.
    ChatCompletions,
}
/// Declared endpoint capabilities. Unknown optional features are not silently claimed.
#[derive(Clone, Debug)]
pub struct Capabilities {
    /// Endpoint supports streaming output.
    pub streaming: bool,
    /// Endpoint supports generated tool calls; adapters never execute them.
    pub tools: bool,
    /// Endpoint supports the explicitly selected effort labels.
    pub reasoning_efforts: Vec<String>,
    /// Compatible endpoint accepts stream_options.include_usage.
    pub stream_usage: bool,
}
/// Explicit endpoint/account configuration supplied by authorized service setup.
#[derive(Clone, Debug)]
pub struct Endpoint {
    /// Provider identity matched against every request.
    pub provider: ActorId,
    /// HTTPS API base; loopback HTTP is supported for deterministic fixtures and managed helpers.
    pub base: url::Url,
    /// Selected protocol; never auto-switch on a failed request.
    pub dialect: Dialect,
    /// Selected API/account/local cost basis; never implicitly substituted.
    pub billing: BillingMode,
    /// Known or explicitly overridden endpoint features.
    pub capabilities: Capabilities,
}
/// Real streaming HTTP adapter with bounded parsing and request-scoped cancellation signals.
pub struct HttpProvider {
    endpoint: Endpoint,
    client: reqwest::Client,
    credentials: Arc<dyn Credentials>,
    active: Arc<Mutex<BTreeMap<InferenceId, watch::Sender<bool>>>>,
}
struct ActiveGuard {
    active: Arc<Mutex<BTreeMap<InferenceId, watch::Sender<bool>>>>,
    id: InferenceId,
}
impl Drop for ActiveGuard {
    fn drop(&mut self) {
        self.active
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(&self.id);
    }
}
async fn deliver(
    sender: &mpsc::Sender<WorkerEvent>,
    event: WorkerEvent,
    cancelled: &mut watch::Receiver<bool>,
    deadline: tokio::time::Instant,
) -> Result<(), AdapterError> {
    if *cancelled.borrow() {
        return Err(AdapterError::Interrupted);
    }
    tokio::select! {
        _ = cancelled.changed() => Err(AdapterError::Interrupted),
        result = tokio::time::timeout_at(deadline, sender.send(event)) => result.map_err(|_| AdapterError::Interrupted)?.map_err(|_| AdapterError::Interrupted),
    }
}
async fn final_delivery(sender: &mpsc::Sender<WorkerEvent>, event: WorkerEvent) {
    // Receiver closure or a permanently stalled service ends delivery as uncertain EOF,
    // never as successful completion. Ordinary slow readers retain all final events.
    let _ = tokio::time::timeout(FINAL_FLUSH_TIMEOUT, sender.send(event)).await;
}
impl HttpProvider {
    /// Builds without performing network discovery, authentication or inference.
    pub fn new(
        endpoint: Endpoint,
        credentials: Arc<dyn Credentials>,
    ) -> Result<Self, AdapterError> {
        let local = endpoint.base.host_str().is_some_and(|h| {
            h == "localhost"
                || h.parse::<std::net::IpAddr>()
                    .is_ok_and(|ip| ip.is_loopback())
        });
        if !(endpoint.base.scheme() == "https" || (local && endpoint.base.scheme() == "http"))
            || !endpoint.base.username().is_empty()
            || endpoint.base.password().is_some()
            || endpoint.base.query().is_some()
            || endpoint.base.fragment().is_some()
        {
            return Err(AdapterError::Unsupported);
        }
        if endpoint.billing == BillingMode::Account
            && (endpoint.dialect != Dialect::Responses
                || endpoint.base.as_str() != OPENAI_ACCOUNT_BASE
                || !endpoint.capabilities.streaming)
        {
            return Err(AdapterError::Unsupported);
        }
        if endpoint.dialect == Dialect::Anthropic && endpoint.billing != BillingMode::ApiKey {
            return Err(AdapterError::Unsupported);
        }
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(30))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|_| AdapterError::Unavailable)?;
        Ok(Self {
            endpoint,
            client,
            credentials,
            active: Arc::default(),
        })
    }
    /// Returns declared capabilities without an inference probe.
    pub fn capabilities(&self) -> &Capabilities {
        &self.endpoint.capabilities
    }
    /// Fetches the explicit provider's catalog using an independently authorized selected credential.
    pub async fn catalog(&self, authorization: &InferenceRequest) -> Result<Value, AdapterError> {
        self.check(authorization)?;
        let secret = self.credentials.resolve(authorization).await?;
        check_credential(&self.endpoint, &secret)?;
        let request = self.client.get(
            self.endpoint
                .base
                .join("models")
                .map_err(|_| AdapterError::Unsupported)?,
        );
        let mut response = authorize(request, self.endpoint.dialect, &secret)
            .send()
            .await
            .map_err(|_| AdapterError::Unavailable)?;
        if !response.status().is_success() {
            return Err(AdapterError::Unavailable);
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| AdapterError::Unavailable)?
        {
            if bytes.len() + chunk.len() > MAX_MODEL_CATALOG_BYTES {
                return Err(AdapterError::Unavailable);
            }
            bytes.extend(chunk);
        }
        serde_json::from_slice(&bytes).map_err(|_| AdapterError::Unavailable)
    }
    /// Checks explicit endpoint capability/billing selection before any dispatch.
    pub(crate) fn check(&self, request: &InferenceRequest) -> Result<(), AdapterError> {
        validate_request(&self.endpoint, request)
    }
}
fn validate_request(endpoint: &Endpoint, request: &InferenceRequest) -> Result<(), AdapterError> {
    if request.selection.provider != endpoint.provider
        || request.selection.billing != endpoint.billing
        || (!request.tools.is_empty() && !endpoint.capabilities.tools)
        || request
            .selection
            .reasoning_effort
            .as_ref()
            .is_some_and(|e| {
                !endpoint
                    .capabilities
                    .reasoning_efforts
                    .iter()
                    .any(|v| v == e.as_str())
            })
    {
        return Err(AdapterError::Unsupported);
    }
    if endpoint.billing != BillingMode::LocalEstimate && request.selection.credential_id.is_none() {
        return Err(AdapterError::Unavailable);
    }
    Ok(())
}
fn check_credential(endpoint: &Endpoint, secret: &Secret) -> Result<(), AdapterError> {
    if (endpoint.billing == BillingMode::Account) != secret.account_id.is_some() {
        return Err(AdapterError::Unsupported);
    }
    Ok(())
}
fn authorize(
    request: reqwest::RequestBuilder,
    dialect: Dialect,
    secret: &Secret,
) -> reqwest::RequestBuilder {
    if dialect == Dialect::Anthropic {
        request
            .header("x-api-key", &secret.token)
            .header("anthropic-version", ANTHROPIC_VERSION)
    } else {
        let request = request.bearer_auth(&secret.token);
        if let Some(account) = &secret.account_id {
            request.header("ChatGPT-Account-ID", account)
        } else {
            request
        }
    }
}
impl Provider for HttpProvider {
    fn stream(
        &self,
        request: InferenceRequest,
    ) -> BoxFuture<'_, Result<InferenceStream, AdapterError>> {
        Box::pin(async move {
            self.check(&request)?;
            let payload = request_body(&self.endpoint, &request)?;
            let secret = self.credentials.resolve(&request).await?;
            check_credential(&self.endpoint, &secret)?;
            let path = match self.endpoint.dialect {
                Dialect::Responses => "responses",
                Dialect::Anthropic => "messages",
                Dialect::ChatCompletions => "chat/completions",
            };
            let url = self
                .endpoint
                .base
                .join(path)
                .map_err(|_| AdapterError::Unsupported)?;
            let (cancel, mut cancelled) = watch::channel(false);
            {
                let mut active = self.active.lock().unwrap_or_else(|e| e.into_inner());
                if active.contains_key(&request.inference_id) {
                    return Err(AdapterError::Unsupported);
                }
                active.insert(request.inference_id.clone(), cancel);
            }
            let guard = ActiveGuard {
                active: self.active.clone(),
                id: request.inference_id.clone(),
            };
            let started = tokio::time::Instant::now();
            let maximum_duration = Duration::from_millis(request.controls.max_duration_ms.get());
            let response = tokio::select! {
                _ = cancelled.changed() => { return Err(AdapterError::Interrupted); },
                result = tokio::time::timeout(maximum_duration, authorize(self.client.post(url).json(&payload), self.endpoint.dialect, &secret).send()) => result.map_err(|_| AdapterError::Interrupted),
            };
            let mut response = match response {
                Ok(Ok(value)) if value.status().is_success() => value,
                _ => {
                    return Err(AdapterError::Unavailable);
                }
            };
            let (sender, receiver) = mpsc::channel(STREAM_CAPACITY);
            let dialect = self.endpoint.dialect;
            let streaming = self.endpoint.capabilities.streaming;
            tokio::spawn(async move {
                let _guard = guard;
                let mut normalizer = Normalizer::new(request.clone(), dialect);
                let mut decoder = Decoder::default();
                let deadline = tokio::time::sleep_until(started + maximum_duration);
                tokio::pin!(deadline);
                let result: Result<(), AdapterError> = async {
                    deliver(&sender, normalizer.event(StreamKind::Started, String::new(), None), &mut cancelled, started + maximum_duration).await?;
                    if !streaming {
                        let mut bytes = Vec::new();
                        loop {
                            let chunk = tokio::select! {
                                _ = cancelled.changed() => return Err(AdapterError::Interrupted),
                                _ = &mut deadline => return Err(AdapterError::Interrupted),
                                result = response.chunk() => result.map_err(|_| AdapterError::Interrupted)?,
                            };
                            let Some(chunk) = chunk else { break; };
                            if bytes.len() + chunk.len() > MAX_MODEL_CATALOG_BYTES { return Err(AdapterError::Interrupted); }
                            bytes.extend(chunk);
                        }
                        let value = serde_json::from_slice(&bytes).map_err(|_| AdapterError::Interrupted)?;
                        for event in normalizer.nonstream(value)? { deliver(&sender, event, &mut cancelled, started + maximum_duration).await?; }
                        return Ok(());
                    }
                    loop {
                        let chunk = tokio::select! {
                            _ = cancelled.changed() => {
                                // Closing HTTP does not prove hosted inference has stopped.
                                return Err(AdapterError::Interrupted);
                            },
                            _ = &mut deadline => { return Err(AdapterError::Interrupted); },
                            value = response.chunk() => value.map_err(|_| AdapterError::Interrupted)?,
                        };
                        let Some(chunk) = chunk else { return if normalizer.completed { Ok(()) } else { Err(AdapterError::Interrupted) }; };
                        for (_, frame) in decoder.push(&chunk)? {
                            for event in normalizer.frame(&frame)? { deliver(&sender, event, &mut cancelled, started + maximum_duration).await?; }
                        }
                        if normalizer.completed { return Ok(()); }
                    }
                }.await;
                if result.is_err() && *cancelled.borrow() {
                    final_delivery(
                        &sender,
                        normalizer.event(
                            StreamKind::StateChanged,
                            "Cancellation requested; remote termination is unconfirmed".into(),
                            None,
                        ),
                    )
                    .await;
                }
                if result.is_err()
                    && let Ok(usage) = normalizer.accounting_event()
                {
                    final_delivery(&sender, usage).await;
                }
                if result.is_err() && !*cancelled.borrow() {
                    let detail = match normalizer.anthropic_stop.as_deref() {
                        Some("max_tokens") => "Provider output truncated: max_tokens",
                        Some("model_context_window_exceeded") => {
                            "Provider output truncated: model_context_window_exceeded"
                        }
                        Some("pause_turn") => "Provider response paused: pause_turn",
                        Some("refusal") => "Provider refused output: refusal",
                        _ => {
                            "Provider stream interrupted; completion and final usage are unconfirmed"
                        }
                    };
                    final_delivery(
                        &sender,
                        normalizer.event(StreamKind::Failed, detail.into(), None),
                    )
                    .await;
                }
            });
            Ok(receiver)
        })
    }
    fn cancel(&self, request: InferenceId) -> BoxFuture<'_, Result<(), AdapterError>> {
        Box::pin(async move {
            if let Some(cancel) = self
                .active
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .get(&request)
            {
                cancel.send(true).map_err(|_| AdapterError::Unavailable)?;
            }
            Ok(())
        })
    }
}

/// Maps validated role/tool context into the explicitly selected provider dialect.
/// This function is pure and never executes generated calls.
pub fn request_body(
    endpoint: &Endpoint,
    request: &InferenceRequest,
) -> Result<Value, AdapterError> {
    validate_request(endpoint, request)?;
    let mut body = json!({"model":request.selection.model_id.as_str(),"stream":endpoint.capabilities.streaming});
    match endpoint.dialect {
        Dialect::Responses => {
            let mut input = Vec::new();
            for message in &request.messages {
                if let Some(text) = &message.text {
                    input.push(json!({"role": role(&message.role), "content":text}));
                }
                for call in &message.tool_calls {
                    input.push(json!({"type":"function_call","call_id":call.tool_call_id.as_str(),"name":call.name.as_str(),"arguments":call.arguments.to_string()}));
                }
                if let Some(result) = &message.tool_result {
                    input.push(json!({"type":"function_call_output","call_id":result.tool_call_id.as_str(),"output":result.content}));
                }
            }
            body["input"] = input.into();
            body["store"] = false.into();
            body["max_output_tokens"] = request.controls.max_output_tokens.get().into();
            body["tools"] = request.tools.iter().map(|t| json!({"type":"function","name":t.name.as_str(),"description":t.description,"parameters":t.input_schema})).collect::<Vec<_>>().into();
            if let Some(effort) = &request.selection.reasoning_effort {
                body["reasoning"] = json!({"effort":effort.as_str()});
            }
        }
        Dialect::Anthropic => {
            let mut system = Vec::new();
            let mut messages = Vec::new();
            for message in &request.messages {
                if matches!(message.role, MessageRole::System | MessageRole::Developer) {
                    if let Some(text) = &message.text {
                        system.push(json!({"type":"text","text":text}));
                    }
                    continue;
                }
                let mut content = Vec::new();
                if let Some(text) = &message.text {
                    content.push(json!({"type":"text","text":text}));
                }
                for call in &message.tool_calls {
                    content.push(json!({"type":"tool_use","id":call.tool_call_id.as_str(),"name":call.name.as_str(),"input":call.arguments}));
                }
                if let Some(result) = &message.tool_result {
                    content.push(json!({"type":"tool_result","tool_use_id":result.tool_call_id.as_str(),"content":result.content,"is_error":result.status == crate::factory::ToolResultStatus::Failed}));
                }
                messages.push(json!({"role":if message.role==MessageRole::Assistant{"assistant"}else{"user"},"content":content}));
            }
            body["system"] = system.into();
            body["messages"] = messages.into();
            body["max_tokens"] = request.controls.max_output_tokens.get().into();
            body["tools"] = request.tools.iter().map(|t|json!({"name":t.name.as_str(),"description":t.description,"input_schema":t.input_schema})).collect::<Vec<_>>().into();
            if let Some(effort) = &request.selection.reasoning_effort {
                body["output_config"] = json!({"effort":effort.as_str()});
            }
        }
        Dialect::ChatCompletions => {
            let mut messages = Vec::new();
            for message in &request.messages {
                let mut item = json!({"role":role(&message.role)});
                if let Some(text) = &message.text {
                    item["content"] = text.clone().into();
                }
                if !message.tool_calls.is_empty() {
                    item["tool_calls"]=message.tool_calls.iter().map(|c|json!({"id":c.tool_call_id.as_str(),"type":"function","function":{"name":c.name.as_str(),"arguments":c.arguments.to_string()}})).collect::<Vec<_>>().into();
                }
                if let Some(result) = &message.tool_result {
                    item["tool_call_id"] = result.tool_call_id.as_str().into();
                    item["content"] = result.content.clone().into();
                }
                messages.push(item);
            }
            body["messages"] = messages.into();
            body["max_tokens"] = request.controls.max_output_tokens.get().into();
            if endpoint.billing == BillingMode::LocalEstimate {
                body["cache_prompt"] = false.into();
            }
            if !request.tools.is_empty() {
                body["tools"]=request.tools.iter().map(|t|json!({"type":"function","function":{"name":t.name.as_str(),"description":t.description,"parameters":t.input_schema}})).collect::<Vec<_>>().into();
            }
            if endpoint.capabilities.stream_usage && endpoint.capabilities.streaming {
                body["stream_options"] = json!({"include_usage":true});
            }
            if let Some(effort) = &request.selection.reasoning_effort {
                body["reasoning_effort"] = effort.as_str().into();
            }
        }
    }
    Ok(body)
}
fn role(role: &MessageRole) -> &'static str {
    match role {
        MessageRole::System => "system",
        MessageRole::Developer => "developer",
        MessageRole::User => "user",
        MessageRole::Assistant => "assistant",
        MessageRole::Tool => "tool",
    }
}

struct PendingTool {
    id: String,
    name: String,
    arguments: String,
    emitted: bool,
}
/// Shared bounded response normalization for HTTP and the embedded SDK.
pub(crate) struct Normalizer {
    request: InferenceRequest,
    dialect: Dialect,
    tools: BTreeMap<String, PendingTool>,
    input: Option<u64>,
    output: Option<u64>,
    cached: Option<u64>,
    completed: bool,
    finish_seen: bool,
    anthropic_stop: Option<String>,
}
impl Normalizer {
    /// Creates inert normalization state for one validated inference identity.
    pub(crate) fn new(request: InferenceRequest, dialect: Dialect) -> Self {
        Self {
            request,
            dialect,
            tools: BTreeMap::new(),
            input: None,
            output: None,
            cached: None,
            completed: false,
            finish_seen: false,
            anthropic_stop: None,
        }
    }
    /// Builds one correlated normalized worker event.
    pub(crate) fn event(
        &self,
        kind: StreamKind,
        text: String,
        tool_call_id: Option<ToolCallId>,
    ) -> WorkerEvent {
        WorkerEvent::new(WorkerEventData {
            worker_id: self.request.worker_id.clone(),
            turn_id: self.request.turn_id.clone(),
            item_id: self.request.item_id.clone(),
            assignment_id: self.request.assignment_id.clone(),
            inference_id: Some(self.request.inference_id.clone()),
            tool_call_id,
            kind: kind.clone(),
            text,
            usage: None,
            state: if kind == StreamKind::StateChanged {
                Some(ExecutionState::CancellationRequested)
            } else {
                None
            },
        })
        .expect("normalized event has consistent kind/identity")
    }
    /// Consumes one complete provider frame with bounded aggregate tool metadata.
    pub(crate) fn frame(&mut self, frame: &str) -> Result<Vec<WorkerEvent>, AdapterError> {
        if frame == "[DONE]" {
            return if self.dialect == Dialect::ChatCompletions && self.finish_seen {
                self.finish()
            } else if self.completed {
                Ok(Vec::new())
            } else {
                Err(AdapterError::Interrupted)
            };
        }
        let value: Value = serde_json::from_str(frame).map_err(|_| AdapterError::Interrupted)?;
        let mut events = Vec::new();
        match self.dialect {
            Dialect::Responses => match value["type"].as_str().unwrap_or("") {
                "response.output_text.delta" => {
                    events.push(self.event(StreamKind::TextDelta, text(&value["delta"]), None))
                }
                "response.output_item.added" if value["item"]["type"] == "function_call" => {
                    let item = &value["item"];
                    self.tools.insert(
                        text(&item["id"]),
                        PendingTool {
                            id: text(&item["call_id"]),
                            name: text(&item["name"]),
                            arguments: String::new(),
                            emitted: false,
                        },
                    );
                }
                "response.function_call_arguments.delta" => {
                    let key = text(&value["item_id"]);
                    let call = self.tools.get_mut(&key).ok_or(AdapterError::Interrupted)?;
                    let delta = text(&value["delta"]);
                    call.arguments.push_str(&delta);
                    if call.arguments.len() > super::sse::MAX_FRAME_BYTES {
                        return Err(AdapterError::Interrupted);
                    }
                    let id =
                        ToolCallId::new(call.id.clone()).map_err(|_| AdapterError::Interrupted)?;
                    events.push(self.event(StreamKind::ToolArgumentsDelta, delta, Some(id)));
                }
                "response.function_call_arguments.done" => {
                    let key = text(&value["item_id"]);
                    if let Some(call) = self.tools.get_mut(&key) {
                        call.arguments = text(&value["arguments"]);
                    }
                    if let Some(event) = self.ready(&key)? {
                        events.push(event);
                    }
                }
                "response.completed" => {
                    self.usage(&value["response"]["usage"]);
                    events.extend(self.finish()?);
                }
                "response.failed" | "response.incomplete" | "error" => {
                    return Err(AdapterError::Interrupted);
                }
                _ => {}
            },
            Dialect::Anthropic => match value["type"].as_str().unwrap_or("") {
                "message_start" => self.usage(&value["message"]["usage"]),
                "content_block_start" if value["content_block"]["type"] == "tool_use" => {
                    let c = &value["content_block"];
                    self.tools.insert(
                        value["index"].to_string(),
                        PendingTool {
                            id: text(&c["id"]),
                            name: text(&c["name"]),
                            arguments: c["input"]
                                .as_object()
                                .filter(|v| !v.is_empty())
                                .map(|_| c["input"].to_string())
                                .unwrap_or_default(),
                            emitted: false,
                        },
                    );
                }
                "content_block_delta" => {
                    let delta = &value["delta"];
                    if delta["type"] == "text_delta" {
                        events.push(self.event(StreamKind::TextDelta, text(&delta["text"]), None));
                    } else if delta["type"] == "input_json_delta" {
                        let key = value["index"].to_string();
                        let call = self.tools.get_mut(&key).ok_or(AdapterError::Interrupted)?;
                        let fragment = text(&delta["partial_json"]);
                        call.arguments.push_str(&fragment);
                        if call.arguments.len() > super::sse::MAX_FRAME_BYTES {
                            return Err(AdapterError::Interrupted);
                        }
                        let id = ToolCallId::new(call.id.clone())
                            .map_err(|_| AdapterError::Interrupted)?;
                        events.push(self.event(StreamKind::ToolArgumentsDelta, fragment, Some(id)));
                    }
                }
                "content_block_stop" => {
                    if let Some(event) = self.ready(&value["index"].to_string())? {
                        events.push(event);
                    }
                }
                "message_delta" => {
                    self.usage(&value["usage"]);
                    if let Some(reason) = value["delta"]["stop_reason"].as_str() {
                        self.anthropic_stop = Some(reason.into());
                    }
                }
                "message_stop" => {
                    anthropic_terminal(self.anthropic_stop.as_deref())?;
                    events.extend(self.finish()?);
                }
                "error" => return Err(AdapterError::Interrupted),
                _ => {}
            },
            Dialect::ChatCompletions => {
                self.usage(&value["usage"]);
                if let Some(choice) = value["choices"].as_array().and_then(|c| c.first()) {
                    let delta = &choice["delta"];
                    if let Some(text) = delta["content"].as_str() {
                        events.push(self.event(StreamKind::TextDelta, text.into(), None));
                    }
                    if let Some(calls) = delta["tool_calls"].as_array() {
                        for call in calls {
                            let key = call["index"].to_string();
                            let pending = self.tools.entry(key).or_insert_with(|| PendingTool {
                                id: String::new(),
                                name: String::new(),
                                arguments: String::new(),
                                emitted: false,
                            });
                            if let Some(id) = call["id"].as_str() {
                                pending.id = id.into();
                            }
                            if let Some(name) = call["function"]["name"].as_str() {
                                pending.name.push_str(name);
                            }
                            if let Some(fragment) = call["function"]["arguments"].as_str() {
                                pending.arguments.push_str(fragment);
                            }
                            if pending
                                .arguments
                                .len()
                                .saturating_add(pending.name.len())
                                .saturating_add(pending.id.len())
                                > super::sse::MAX_FRAME_BYTES
                            {
                                return Err(AdapterError::Interrupted);
                            }
                        }
                    }
                    if !choice["finish_reason"].is_null() {
                        if !matches!(
                            choice["finish_reason"].as_str(),
                            Some("stop" | "tool_calls")
                        ) {
                            return Err(AdapterError::Interrupted);
                        }
                        for key in self.tools.keys().cloned().collect::<Vec<_>>() {
                            if let Some(event) = self.ready(&key)? {
                                events.push(event);
                            }
                        }
                        self.finish_seen = true;
                    }
                }
            }
        }
        if self.tools.len() > MAX_TOOL_CALLS {
            return Err(AdapterError::Interrupted);
        }
        Ok(events)
    }
    /// Normalizes a confirmed complete JSON response.
    pub(crate) fn nonstream(&mut self, value: Value) -> Result<Vec<WorkerEvent>, AdapterError> {
        let mut events = Vec::new();
        let (content, usage) = match self.dialect {
            Dialect::Responses => {
                if value["status"] != "completed" {
                    return Err(AdapterError::Interrupted);
                }
                (
                    value["output"].as_array().cloned().unwrap_or_default(),
                    &value["usage"],
                )
            }
            Dialect::Anthropic => {
                self.usage(&value["usage"]);
                self.anthropic_stop = value["stop_reason"].as_str().map(str::to_owned);
                anthropic_terminal(self.anthropic_stop.as_deref())?;
                (
                    value["content"].as_array().cloned().unwrap_or_default(),
                    &value["usage"],
                )
            }
            Dialect::ChatCompletions => {
                let choice = &value["choices"][0];
                if !matches!(
                    choice["finish_reason"].as_str(),
                    Some("stop" | "tool_calls")
                ) {
                    return Err(AdapterError::Interrupted);
                }
                let mut content = Vec::new();
                if let Some(text) = choice["message"]["content"].as_str() {
                    content.push(json!({"type":"text","text":text}));
                }
                if let Some(calls) = choice["message"]["tool_calls"].as_array() {
                    for call in calls {
                        content.push(json!({"type":"function_call","id":call["id"],"call_id":call["id"],"name":call["function"]["name"],"arguments":call["function"]["arguments"]}));
                    }
                }
                (content, &value["usage"])
            }
        };
        self.usage(usage);
        for item in content {
            match item["type"].as_str().unwrap_or("") {
                "message" => {
                    if let Some(parts) = item["content"].as_array() {
                        for part in parts {
                            if let Some(text) = part["text"].as_str() {
                                events.push(self.event(StreamKind::TextDelta, text.into(), None));
                            }
                        }
                    }
                }
                "text" => events.push(self.event(StreamKind::TextDelta, text(&item["text"]), None)),
                "function_call" | "tool_use" => {
                    let key = text(&item["id"]);
                    self.tools.insert(
                        key.clone(),
                        PendingTool {
                            id: if item["type"] == "tool_use" {
                                key.clone()
                            } else {
                                text(&item["call_id"])
                            },
                            name: text(&item["name"]),
                            arguments: if item["type"] == "tool_use" {
                                item["input"].to_string()
                            } else {
                                text(&item["arguments"])
                            },
                            emitted: false,
                        },
                    );
                    if self.tools.len() > MAX_TOOL_CALLS {
                        return Err(AdapterError::Interrupted);
                    }
                    if let Some(event) = self.ready(&key)? {
                        events.push(event);
                    }
                }
                _ => {}
            }
        }
        events.extend(self.finish()?);
        Ok(events)
    }
    fn ready(&mut self, key: &str) -> Result<Option<WorkerEvent>, AdapterError> {
        let Some(call) = self.tools.get_mut(key) else {
            return Ok(None);
        };
        if call.emitted {
            return Ok(None);
        }
        let arguments = serde_json::from_str(if call.arguments.is_empty() {
            "{}"
        } else {
            &call.arguments
        })
        .map_err(|_| AdapterError::Interrupted)?;
        let invocation = ToolInvocation::new(ToolInvocationData {
            tool_call_id: ToolCallId::new(call.id.clone())
                .map_err(|_| AdapterError::Interrupted)?,
            name: ActorId::new(call.name.clone()).map_err(|_| AdapterError::Interrupted)?,
            arguments,
        })
        .map_err(|_| AdapterError::Interrupted)?;
        call.emitted = true;
        Ok(Some(self.event(
            StreamKind::ToolReady,
            serde_json::to_string(&invocation).map_err(|_| AdapterError::Interrupted)?,
            Some(invocation.tool_call_id.clone()),
        )))
    }
    fn usage(&mut self, value: &Value) {
        self.input = value["input_tokens"]
            .as_u64()
            .or(value["prompt_tokens"].as_u64())
            .or(self.input);
        self.output = value["output_tokens"]
            .as_u64()
            .or(value["completion_tokens"].as_u64())
            .or(self.output);
        self.cached = value["input_tokens_details"]["cached_tokens"]
            .as_u64()
            .or(value["prompt_tokens_details"]["cached_tokens"].as_u64())
            .or(value["cache_read_input_tokens"].as_u64())
            .or(self.cached);
    }
    fn finish(&mut self) -> Result<Vec<WorkerEvent>, AdapterError> {
        if self.tools.values().any(|t| !t.emitted) {
            return Err(AdapterError::Interrupted);
        }
        let event = self.accounting_event()?;
        self.completed = true;
        Ok(vec![
            event,
            self.event(StreamKind::Completed, String::new(), None),
        ])
    }
    /// Returns known or explicitly uncertain usage without another provider call.
    pub(crate) fn accounting_event(&self) -> Result<WorkerEvent, AdapterError> {
        let basis = if self.input.is_some() || self.output.is_some() || self.cached.is_some() {
            UsageBasis::Reported
        } else {
            UsageBasis::Unknown
        };
        let usage = Usage::new(UsageData {
            inference_id: self.request.inference_id.clone(),
            input_tokens: self.input.map(Counter::new),
            output_tokens: self.output.map(Counter::new),
            cached_tokens: self.cached.map(Counter::new),
            basis,
            billing: self.request.selection.billing.clone(),
            cost_micros: None,
            currency: None,
            calculation_basis: None,
        })
        .map_err(|_| AdapterError::Interrupted)?;
        // Build usage directly: a Usage event always contains its validated accounting record.
        let event = WorkerEvent::new(WorkerEventData {
            worker_id: self.request.worker_id.clone(),
            turn_id: self.request.turn_id.clone(),
            item_id: self.request.item_id.clone(),
            assignment_id: self.request.assignment_id.clone(),
            inference_id: Some(self.request.inference_id.clone()),
            tool_call_id: None,
            kind: StreamKind::Usage,
            text: String::new(),
            usage: Some(usage),
            state: None,
        })
        .map_err(|_| AdapterError::Interrupted)?;
        Ok(event)
    }
}
fn text(value: &Value) -> String {
    value.as_str().unwrap_or_default().to_owned()
}

// Only these stop reasons establish a complete provider response. All others
// remain interrupted; the service decides whether another inference is appropriate.
fn anthropic_terminal(reason: Option<&str>) -> Result<(), AdapterError> {
    match reason {
        Some("end_turn" | "stop_sequence" | "tool_use") => Ok(()),
        _ => Err(AdapterError::Interrupted),
    }
}

#[cfg(test)]
mod account_tests {
    use super::*;
    struct NoResolution;
    impl Credentials for NoResolution {
        fn resolve<'a>(
            &'a self,
            _: &'a InferenceRequest,
        ) -> BoxFuture<'a, Result<Secret, AdapterError>> {
            panic!("constructor must not resolve credentials or call a provider")
        }
    }
    fn endpoint() -> Endpoint {
        Endpoint {
            provider: ActorId::new("openai").unwrap(),
            base: OPENAI_ACCOUNT_BASE.parse().unwrap(),
            dialect: Dialect::Responses,
            billing: BillingMode::Account,
            capabilities: Capabilities {
                streaming: true,
                tools: true,
                reasoning_efforts: vec!["high".into()],
                stream_usage: false,
            },
        }
    }
    #[test]
    fn account_backend_and_protected_headers_are_explicit_and_never_api_key_fallback() {
        let config = endpoint();
        let _provider = HttpProvider::new(config.clone(), Arc::new(NoResolution)).unwrap();
        let secret =
            Secret::account("eligible-access-token".into(), "selected-account".into()).unwrap();
        check_credential(&config, &secret).unwrap();
        assert_eq!(format!("{secret:?}"), "[REDACTED]");
        let request = authorize(
            reqwest::Client::new().post(config.base.join("responses").unwrap()),
            Dialect::Responses,
            &secret,
        )
        .build()
        .unwrap();
        assert_eq!(
            request.url().as_str(),
            "https://chatgpt.com/backend-api/codex/responses"
        );
        assert_eq!(
            request.headers()["authorization"],
            "Bearer eligible-access-token"
        );
        assert_eq!(request.headers()["chatgpt-account-id"], "selected-account");
        assert_eq!(
            check_credential(
                &config,
                &Secret::new("api-key-or-native-token-without-inference-account-grant".into())
                    .unwrap()
            ),
            Err(AdapterError::Unsupported)
        );
        let mut wrong = config.clone();
        wrong.base = "https://api.openai.com/v1/".parse().unwrap();
        assert!(matches!(
            HttpProvider::new(wrong, Arc::new(NoResolution)),
            Err(AdapterError::Unsupported)
        ));
        let mut api = config;
        api.billing = BillingMode::ApiKey;
        api.base = "https://api.openai.com/v1/".parse().unwrap();
        assert_eq!(
            check_credential(&api, &secret),
            Err(AdapterError::Unsupported)
        );
        assert!(Secret::account("token".into(), "account\r\nleak".into()).is_err());
    }
}
