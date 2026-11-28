//! Native JSON-RPC mapping to the same authenticated, durable factory service as the web client.
use crate::{
    relay::{Peer, RelayError},
    socket::{Dispatcher, Reply},
};
use ironloom_core::{validation::decode, *};
use ironloom_service::factory::*;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{collections::BTreeSet, sync::Arc};
use tokio::sync::Mutex;

mod history;

const MAX_INPUT: usize = 1024 * 1024;
/// Trusted project/session display metadata; never selected by a native request as authority.
pub struct ThreadContext {
    /// Stable human project name, available when its folder is unavailable.
    pub name: String,
    /// Existing configured absolute workspace path, resolved by the service.
    pub cwd: String,
    /// Actual configured model, or unknown before setup is complete.
    pub model: Option<ActorId>,
    /// Actual configured inference provider, independent from native control authentication.
    pub provider: Option<ActorId>,
    /// Actual configured effort; no adapter default.
    pub effort: Option<ActorId>,
    /// Persisted conversation creation time, never fabricated from worker activity.
    pub created_at_ms: Counter,
    /// Effective service-enforced approval policy rendered in upstream format.
    pub approval_policy: Value,
    /// Effective process isolation rendered in upstream format; a client cannot weaken it.
    pub sandbox: Value,
}
/// Native wire outcome derived by the service from durable execution, never by viewer inactivity.
#[derive(Clone, Copy, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum TurnStatus {
    /// Recorded successful completion.
    Completed,
    /// Recorded confirmed termination.
    Interrupted,
    /// Recorded failure.
    Failed,
    /// The owning execution is still active, including paused/waiting states.
    InProgress,
}
/// Durable native turn display metadata returned by the trusted service callback.
pub struct TurnMetadata {
    /// Actual current or terminal outcome.
    pub status: TurnStatus,
    /// Recorded start timestamp, absent when unknown.
    pub started_at_ms: Option<Counter>,
    /// Recorded completion timestamp, absent before confirmed completion.
    pub completed_at_ms: Option<Counter>,
    /// Recorded elapsed duration, absent when unknown.
    pub duration_ms: Option<Counter>,
}
/// Optional native selection assertions. The service validates these against its actual configured workflow role;
/// they never create another model/profile selection or authorize a fallback.
#[derive(Clone)]
pub struct StartHints {
    /// Requested model, if the native client supplied one.
    pub model: Option<ActorId>,
    /// Requested inference provider, separate from native account authentication.
    pub provider: Option<ActorId>,
    /// Requested effort, if supplied; no adapter default.
    pub effort: Option<ActorId>,
}
/// Service-owned identity, context and durable command preparation. No sessions are minted here.
pub trait NativeAuthority: Send + Sync {
    /// Revalidates enrollment-to-human mapping and an existing service session for every call.
    fn session(&self, peer: Peer) -> BoxFuture<'_, Result<AuthenticatedSession, ServiceError>>;
    /// Returns the configured absolute service metadata root for the current native protocol's
    /// codexHome field. The adapter never adopts or creates an upstream state runtime there.
    fn home(
        &self,
        session: AuthenticatedSession,
    ) -> BoxFuture<'_, Result<std::path::PathBuf, ServiceError>>;
    /// Reads the persisted turn outcome; no historical turn is presumed successful from inactivity.
    fn turn(
        &self,
        session: AuthenticatedSession,
        conversation: ConversationId,
        turn: TurnId,
    ) -> BoxFuture<'_, Result<TurnMetadata, ServiceError>>;
    /// Returns only confirmed persisted final item/tool outcomes at the requested event watermark.
    /// Resolve original tool names/call IDs/results from shared storage and recheck current grants;
    /// incomplete/unknown outcomes return no completed items, never inferred success from EOF.
    fn completed(
        &self,
        session: AuthenticatedSession,
        cursor: ReplayCursor,
        item: ItemId,
    ) -> BoxFuture<'_, Result<Vec<crate::items::CompletedItem>, ServiceError>>;
    /// Executes the shared empty-conversation creation operation with native selection assertions.
    /// First look up actor/key/fingerprint and recheck current project authority for replay. For a
    /// new operation validate hints against current authorized configuration under the SAME service
    /// transaction/locks used to persist the shared conversation and actor/key outcome. A mismatch
    /// or configuration race must persist neither a conversation nor a command outcome. When the
    /// empty conversation has no selected role, reject nonempty model/provider/effort overrides;
    /// do not choose a role or add a setup choice merely to satisfy the native request. Never use
    /// separate native conversation/session storage or select a replacement role/model.
    fn start(
        &self,
        session: AuthenticatedSession,
        request: CreateConversation,
        hints: StartHints,
        fingerprint: String,
    ) -> BoxFuture<'_, Result<ConversationSnapshot, ServiceError>>;
    /// Resolves a currently authorized existing project from optional native project/cwd hints.
    fn project(
        &self,
        session: AuthenticatedSession,
        project: Option<ProjectId>,
        cwd: Option<String>,
    ) -> BoxFuture<'_, Result<ProjectId, ServiceError>>;
    /// Reads current authorized project/configuration and original conversation creation metadata.
    fn context(
        &self,
        session: AuthenticatedSession,
        conversation: ConversationId,
    ) -> BoxFuture<'_, Result<ThreadContext, ServiceError>>;
    /// Looks up the original actor/key/fingerprint envelope before mutable turn/question checks.
    /// Changed payload conflicts. Recheck current session and actual stored-resource grants;
    /// never treat a prior grant or a transport peer as continuing authority.
    fn replay(
        &self,
        session: AuthenticatedSession,
        key: CommandId,
        fingerprint: String,
    ) -> BoxFuture<'_, Result<Option<Command>, ServiceError>>;
    /// Atomically retains the FIRST validated command under its actor/key and canonical native
    /// payload hash. Repeated identical calls return that exact envelope/revision; changed payload
    /// conflicts. This prevents reconnect from rebuilding a command at a newer revision.
    fn prepare(
        &self,
        session: AuthenticatedSession,
        fingerprint: String,
        candidate: Command,
    ) -> BoxFuture<'_, Result<Command, ServiceError>>;
}
/// Direct native request router. Its only local state is the initialized viewer connections.
pub struct NativeRpc {
    service: Arc<dyn FactoryService>,
    authority: Arc<dyn NativeAuthority>,
    initialized: Mutex<BTreeSet<Peer>>,
    views: Arc<crate::views::NativeViews>,
}
impl NativeRpc {
    /// Constructs a service-backed adapter without starting workers or opening native sockets.
    pub fn new(
        service: Arc<dyn FactoryService>,
        authority: Arc<dyn NativeAuthority>,
        views: Arc<crate::views::NativeViews>,
    ) -> Self {
        Self {
            service,
            authority,
            views,
            initialized: Mutex::default(),
        }
    }
    async fn route(
        &self,
        peer: &Peer,
        message: &Value,
        session: AuthenticatedSession,
    ) -> Result<Value, Failure> {
        let method = message["method"].as_str().ok_or(Failure::Invalid)?;
        let params = message
            .get("params")
            .filter(|v| !v.is_null())
            .cloned()
            .unwrap_or(json!({}));
        if !params.is_object() {
            return Err(Failure::Invalid);
        }
        if method == "initialize" {
            if !params["clientInfo"].is_object() {
                return Err(Failure::Invalid);
            }
            let home = self.authority.home(session).await?;
            if !home.is_absolute() {
                return Err(Failure::Unavailable);
            }
            let mut initialized = self.initialized.lock().await;
            if initialized.len() >= 256 && !initialized.contains(peer) {
                return Err(Failure::Unavailable);
            }
            initialized.insert(peer.clone());
            drop(initialized);
            return Ok(
                json!({"userAgent":format!("Ironloom/{}",env!("CARGO_PKG_VERSION")),"platformFamily":std::env::consts::FAMILY,"platformOs":std::env::consts::OS,"codexHome":home}),
            );
        }
        if !self.initialized.lock().await.contains(peer) {
            return Err(Failure::NotInitialized);
        }
        let key = command_id(peer, &session, message)?;
        match method {
            "thread/items/list" => self.item_page(session, &params).await,
            "thread/start" => {
                reject_overrides(&params)?;
                let project = self
                    .authority
                    .project(
                        session.clone(),
                        optional_id(&params, "projectId")?,
                        optional_text(&params, "cwd")?,
                    )
                    .await?;
                let hints = start_hints(&params)?;
                let fingerprint = hex::encode(Sha256::digest(
                    json!({"method":method,"params":params}).to_string(),
                ));
                let request = decode_json(json!({"command_id":key,"project_id":project}))?;
                let snapshot = self
                    .authority
                    .start(session.clone(), request, hints, fingerprint)
                    .await?;
                let context = self
                    .authority
                    .context(session, snapshot.session.conversation_id.clone())
                    .await?;
                self.views
                    .watch(peer.clone(), &snapshot)
                    .await
                    .map_err(|_| Failure::Unavailable)?;
                Ok(thread_response(&snapshot, &context, Vec::new())?)
            }
            "thread/read" | "thread/resume" => {
                reject_overrides(&params)?;
                let conversation = conversation(&params)?;
                let snapshot = self
                    .service
                    .snapshot(session.clone(), conversation.clone())
                    .await?;
                let context = self
                    .authority
                    .context(session.clone(), conversation)
                    .await?;
                selected(&params, &context)?;
                let turns = if method == "thread/resume" || params["includeTurns"] == true {
                    self.history(&session, &snapshot).await?
                } else {
                    Vec::new()
                };
                if method == "thread/resume" {
                    self.views
                        .watch(peer.clone(), &snapshot)
                        .await
                        .map_err(|_| Failure::Unavailable)?;
                    Ok(thread_response(&snapshot, &context, turns)?)
                } else {
                    Ok(json!({"thread":thread(&snapshot,&context,turns)?,"readState":null}))
                }
            }
            "thread/list" => {
                for name in [
                    "includedThreadIds",
                    "excludedThreadIds",
                    "originators",
                    "cwd",
                    "searchTerm",
                    "parentThreadId",
                    "ancestorThreadId",
                    "projectId",
                    "sectionId",
                ] {
                    if params
                        .get(name)
                        .is_some_and(|v| !v.is_null() && v.as_array().is_none_or(|v| !v.is_empty()))
                    {
                        return Err(Failure::Unsupported);
                    }
                }
                let providers = params
                    .get("modelProviders")
                    .filter(|v| !v.is_null())
                    .map(|v| v.as_array().ok_or(Failure::Invalid))
                    .transpose()?;
                if providers.is_some_and(|v| v.len() > 1) {
                    return Err(Failure::Unsupported);
                }
                let provider = providers
                    .and_then(|v| v.first())
                    .map(|v| v.as_str().ok_or(Failure::Invalid))
                    .transpose()?;
                if let Some(sources) = params.get("sourceKinds").filter(|v| !v.is_null()) {
                    let sources = sources.as_array().ok_or(Failure::Invalid)?;
                    if sources.iter().any(|v| !v.is_string()) {
                        return Err(Failure::Invalid);
                    }
                    if !sources.is_empty() && !sources.iter().any(|v| v == "appServer") {
                        return Ok(
                            json!({"data":[],"nextCursor":null,"backwardsCursor":null,"readStates":null}),
                        );
                    }
                }
                if params["sortKey"]
                    .as_str()
                    .is_some_and(|v| v != "updated_at" && v != "created_at")
                    || params["sortDirection"]
                        .as_str()
                        .is_some_and(|v| v != "desc")
                {
                    return Err(Failure::Unsupported);
                }
                let limit = limit(&params)?;
                let query = decode_json(
                    json!({"order":if params["sortKey"]=="updated_at" {"human_interaction"}else{"created_at"},"after":params.get("cursor"),"limit":limit.to_string(),"archived":params["archived"].as_bool().unwrap_or(false),"provider":provider,"source":null}),
                )?;
                let sessions = self.service.sessions(session.clone(), query).await?;
                let mut data = Vec::new();
                for summary in &sessions {
                    let snapshot = self
                        .service
                        .snapshot(session.clone(), summary.conversation_id.clone())
                        .await?;
                    let context = self
                        .authority
                        .context(session.clone(), summary.conversation_id.clone())
                        .await?;
                    data.push(thread(&snapshot, &context, Vec::new())?);
                }
                let next = if sessions.len() == limit {
                    sessions.last().map(|v| v.conversation_id.as_str())
                } else {
                    None
                };
                Ok(json!({"data":data,"nextCursor":next,"backwardsCursor":null,"readStates":null}))
            }
            "turn/start" | "turn/steer" | "turn/interrupt" => {
                reject_overrides(&params)?;
                let conversation = conversation(&params)?;
                let fingerprint = hex::encode(Sha256::digest(
                    serde_json::to_vec(&json!({"method":method,"params":params}))
                        .map_err(|_| Failure::Invalid)?,
                ));
                let command = if let Some(command) = self
                    .authority
                    .replay(session.clone(), key.clone(), fingerprint.clone())
                    .await?
                {
                    command
                } else {
                    let state = self
                        .service
                        .snapshot(session.clone(), conversation.clone())
                        .await?;
                    let context = self
                        .authority
                        .context(session.clone(), conversation.clone())
                        .await?;
                    selected(&params, &context)?;
                    let action = match method {
                        "turn/start" => {
                            json!({"type":"input","data":{"conversation_id":conversation,"text":input(&params)?}})
                        }
                        "turn/steer" => {
                            json!({"type":"steer","data":{"conversation_id":conversation,"expected_turn_id":required(&params,"expectedTurnId")?,"text":input(&params)?}})
                        }
                        _ => {
                            if state.session.active_turn_id.as_ref().map(TurnId::as_str)
                                != Some(required(&params, "turnId")?)
                            {
                                return Err(Failure::Conflict);
                            }
                            json!({"type":"control","data":{"assignment_id":state.active_assignment_id.as_ref().ok_or(Failure::Conflict)?,"action":"cancel"}})
                        }
                    };
                    let candidate = decode_json(
                        json!({"command_id":key,"project_id":state.session.project_id,"expected_revision":state.revision,"action":action}),
                    )?;
                    self.authority
                        .prepare(session.clone(), fingerprint, candidate)
                        .await?
                };
                let receipt = self.service.command(session.clone(), command).await?;
                if receipt.disposition == CommandDisposition::Conflict {
                    return Err(Failure::Conflict);
                }
                if method == "turn/interrupt" {
                    return Ok(json!({}));
                }
                if method == "turn/steer" {
                    return Ok(json!({"turnId":required(&params,"expectedTurnId")?}));
                }
                // The durable initial input at the receipt watermark owns the turn identity,
                // even if its execution has already completed by the time the native reply is read.
                let page = self
                    .service
                    .history(
                        session.clone(),
                        decode_json(json!({"as_of":receipt.cursor,"direction":"backward","before":null,"after":null,"turn_id":null,"limit":"1"}))?,
                    )
                    .await?;
                let item = page.items.last().ok_or(Failure::Unavailable)?;
                let metadata = self
                    .authority
                    .turn(session, conversation, item.turn_id.clone())
                    .await?;
                let mut value = turn(item.turn_id.as_str(), Vec::new(), "inProgress", "notLoaded");
                value["status"] =
                    serde_json::to_value(metadata.status).map_err(|_| Failure::Unavailable)?;
                Ok(json!({"turn":value}))
            }
            "thread/unsubscribe" => {
                self.views
                    .remove(peer.clone(), Some(conversation(&params)?))
                    .await
                    .map_err(|_| Failure::Unavailable)?;
                Ok(json!({"status":"unsubscribed"}))
            }
            _ => Err(Failure::Unsupported),
        }
    }
    async fn answer_prompt(
        &self,
        _peer: Peer,
        session: AuthenticatedSession,
        message: &Value,
    ) -> Result<(), RelayError> {
        let id = message["id"].as_str().ok_or(RelayError::Protocol)?;
        let conversation = crate::prompts::conversation(id).map_err(|_| RelayError::Protocol)?;
        if message.get("error").is_some() {
            return Ok(());
        }
        let key = CommandId::new(hex::encode(Sha256::digest(
            json!(["native-prompt", session.operator_id, id]).to_string(),
        )))
        .map_err(|_| RelayError::Protocol)?;
        let fingerprint = hex::encode(Sha256::digest(json!([id, message["result"]]).to_string()));
        let command = if let Some(command) = self
            .authority
            .replay(session.clone(), key.clone(), fingerprint.clone())
            .await
            .map_err(relay_error)?
        {
            command
        } else {
            let state = self
                .service
                .snapshot(session.clone(), conversation)
                .await
                .map_err(relay_error)?;
            let action =
                crate::prompts::answer(&state, &session.operator_id, id, &message["result"])
                    .map_err(|_| RelayError::Protocol)?;
            let candidate=decode_json(json!({"command_id":key,"project_id":state.session.project_id,"expected_revision":state.revision,"action":action})).map_err(|_|RelayError::Protocol)?;
            self.authority
                .prepare(session.clone(), fingerprint, candidate)
                .await
                .map_err(relay_error)?
        };
        let receipt = self
            .service
            .command(session, command)
            .await
            .map_err(|_| RelayError::Unavailable)?;
        if receipt.disposition == CommandDisposition::Conflict {
            return Err(RelayError::Protocol);
        }
        Ok(())
    }
    async fn history(
        &self,
        session: &AuthenticatedSession,
        state: &ConversationSnapshot,
    ) -> Result<Vec<Value>, Failure> {
        let page = self
            .service
            .history(
                session.clone(),
                decode_json(json!({"as_of":state.cursor,"direction":"backward","before":null,"after":null,"turn_id":null,"limit":"100"}))?,
            )
            .await?;
        // A bounded read is explicitly a summary when older items remain; never claim full history.
        let mut turns: Vec<(String, Vec<Value>)> = Vec::new();
        for item in &page.items {
            if turns
                .last()
                .is_none_or(|(id, _)| id != item.turn_id.as_str())
            {
                turns.push((item.turn_id.as_str().into(), Vec::new()));
            }
            turns
                .last_mut()
                .ok_or(Failure::Unavailable)?
                .1
                .push(history_item(item)?);
        }
        let mut result = Vec::new();
        for (id, items) in turns {
            let metadata = self
                .authority
                .turn(
                    session.clone(),
                    state.session.conversation_id.clone(),
                    TurnId::new(id.clone()).map_err(|_| Failure::Unavailable)?,
                )
                .await?;
            let mut value = turn(&id, items, "inProgress", "summary");
            value["status"] =
                serde_json::to_value(metadata.status).map_err(|_| Failure::Unavailable)?;
            value["startedAt"] = timestamp(metadata.started_at_ms)?;
            value["completedAt"] = timestamp(metadata.completed_at_ms)?;
            value["durationMs"] = metadata
                .duration_ms
                .map(|v| {
                    i64::try_from(v.get())
                        .map(Value::from)
                        .map_err(|_| Failure::Unavailable)
                })
                .transpose()?
                .unwrap_or(Value::Null);
            result.push(value);
        }
        Ok(result)
    }
}
impl Dispatcher for NativeRpc {
    fn dispatch(
        &self,
        peer: Peer,
        message: Value,
    ) -> BoxFuture<'_, Result<Option<Reply>, RelayError>> {
        Box::pin(async move {
            let id = message.get("id").cloned();
            let session = self.authority.session(peer.clone()).await;
            if crate::prompts::is_prompt(&message["id"]) && message.get("method").is_none() {
                let session = session.map_err(relay_error)?;
                self.answer_prompt(peer, session, &message).await?;
                return Ok(None);
            }
            if message["method"] == "initialized" {
                return Ok(None);
            }
            let result = match session {
                Ok(session) => self.route(&peer, &message, session).await,
                Err(error) => Err(error.into()),
            };
            let conversations = if let Ok(result) = &result {
                let mut ids = Vec::new();
                if let Some(thread) = result.get("thread")
                    && let Some(id) = thread["id"].as_str()
                {
                    ids.push(ConversationId::new(id).map_err(|_| RelayError::Protocol)?);
                }
                if let Some(data) = result["data"].as_array() {
                    for thread in data {
                        if let Some(id) = thread["id"].as_str() {
                            ids.push(ConversationId::new(id).map_err(|_| RelayError::Protocol)?);
                        }
                    }
                }
                if let Some(id) = message["params"]["threadId"].as_str() {
                    ids.push(ConversationId::new(id).map_err(|_| RelayError::Protocol)?);
                }
                ids.sort();
                ids.dedup();
                ids
            } else {
                Vec::new()
            };
            Ok(id.map(|id| Reply {
                conversations,
                message: match result {
                    Ok(result) => json!({"id":id,"result":result}),
                    Err(error) => {
                        json!({"id":id,"error":{"code":error.code(),"message":error.message()}})
                    }
                },
            }))
        })
    }
    fn connected(&self) -> BoxFuture<'_, Result<(), RelayError>> {
        Box::pin(async {
            for peer in self.initialized.lock().await.clone() {
                self.views.ready(peer).await?;
            }
            Ok(())
        })
    }
    fn ready(&self, peer: Peer) -> BoxFuture<'_, Result<(), RelayError>> {
        Box::pin(async move { self.views.ready(peer).await })
    }
    fn initialized(&self, peer: Peer) -> BoxFuture<'_, bool> {
        Box::pin(async move { self.initialized.lock().await.contains(&peer) })
    }
    fn closed(&self, peer: Peer) -> BoxFuture<'_, Result<(), RelayError>> {
        Box::pin(async move {
            self.initialized.lock().await.remove(&peer);
            self.views.remove(peer, None).await
        })
    }
    fn disconnected(&self) -> BoxFuture<'_, Result<(), RelayError>> {
        Box::pin(async {
            // Relay reconnect preserves negotiation and durable positions, but releases feed readers.
            self.views.disconnected().await;
            Ok(())
        })
    }
}
#[derive(Debug)]
pub(crate) enum Failure {
    Invalid,
    Unsupported,
    NotInitialized,
    Conflict,
    Denied,
    Unavailable,
    ApprovalRequired,
}
impl From<ServiceError> for Failure {
    fn from(value: ServiceError) -> Self {
        match value {
            ServiceError::Validation(_) => Self::Invalid,
            ServiceError::Authentication(AuthenticationError::Unavailable) => Self::Unavailable,
            ServiceError::Authentication(_) => Self::Denied,
            ServiceError::Conflict => Self::Conflict,
            ServiceError::ApprovalRequired => Self::ApprovalRequired,
            _ => Self::Unavailable,
        }
    }
}
impl Failure {
    fn code(&self) -> i32 {
        match self {
            Self::Invalid => -32602,
            Self::Unsupported => -32601,
            Self::NotInitialized => -32002,
            Self::Conflict => -32009,
            Self::Denied => -32001,
            Self::Unavailable => -32000,
            Self::ApprovalRequired => -32003,
        }
    }
    fn message(&self) -> &'static str {
        match self {
            Self::Invalid => "Invalid parameters",
            Self::Unsupported => "Unsupported operation or capability",
            Self::NotInitialized => "Initialize this connection first",
            Self::Conflict => "State changed; refresh before retrying",
            Self::Denied => "Authentication or access denied",
            Self::Unavailable => "Service unavailable",
            Self::ApprovalRequired => "Approval required",
        }
    }
}
fn decode_json<T: ironloom_core::validation::Wire>(value: Value) -> Result<T, Failure> {
    decode(&serde_json::to_vec(&value).map_err(|_| Failure::Invalid)?).map_err(|_| Failure::Invalid)
}
fn required<'a>(value: &'a Value, key: &str) -> Result<&'a str, Failure> {
    value[key]
        .as_str()
        .filter(|v| !v.trim().is_empty())
        .ok_or(Failure::Invalid)
}
fn optional_text(value: &Value, key: &str) -> Result<Option<String>, Failure> {
    match value.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(v)) if !v.trim().is_empty() => Ok(Some(v.clone())),
        _ => Err(Failure::Invalid),
    }
}
fn optional_id(value: &Value, key: &str) -> Result<Option<ProjectId>, Failure> {
    optional_text(value, key)?
        .map(|v| ProjectId::new(v).map_err(|_| Failure::Invalid))
        .transpose()
}
fn conversation(value: &Value) -> Result<ConversationId, Failure> {
    ConversationId::new(required(value, "threadId")?).map_err(|_| Failure::Invalid)
}
fn limit(value: &Value) -> Result<usize, Failure> {
    let n = value
        .get("limit")
        .filter(|v| !v.is_null())
        .map_or(Some(50), Value::as_u64)
        .ok_or(Failure::Invalid)?;
    if n == 0 || n > 100 {
        return Err(Failure::Invalid);
    }
    Ok(n as usize)
}
fn command_id(
    peer: &Peer,
    session: &AuthenticatedSession,
    message: &Value,
) -> Result<CommandId, Failure> {
    let id = &message["id"];
    if !(id.is_string() || id.as_i64().is_some()) {
        return Err(Failure::Invalid);
    }
    let value = if let Some(user_id) = message["params"]["clientUserMessageId"].as_str() {
        if user_id.trim().is_empty() || user_id.len() > 256 {
            return Err(Failure::Invalid);
        }
        json!([
            "native-user-input",
            session.operator_id,
            message["params"]["threadId"],
            user_id
        ])
    } else {
        json!([session.operator_id, peer.client, peer.stream, id])
    };
    CommandId::new(hex::encode(Sha256::digest(value.to_string()))).map_err(|_| Failure::Invalid)
}
fn input(value: &Value) -> Result<String, Failure> {
    let mut text = Vec::new();
    for part in value["input"].as_array().ok_or(Failure::Invalid)? {
        if part["type"] != "text" {
            return Err(Failure::Unsupported);
        }
        text.push(required(part, "text")?);
    }
    let result = text.join("\n");
    if result.trim().is_empty() || result.len() > MAX_INPUT {
        return Err(Failure::Invalid);
    }
    Ok(result)
}
fn reject_overrides(params: &Value) -> Result<(), Failure> {
    for key in [
        "approvalPolicy",
        "sandbox",
        "sandboxPolicy",
        "permissions",
        "config",
        "baseInstructions",
        "developerInstructions",
        "dynamicTools",
        "runtimeWorkspaceRoots",
        "environments",
        "additionalContext",
        "toolOutput",
        "personality",
        "serviceTier",
        "collaborationMode",
        "disabledPluginIds",
    ] {
        if params.get(key).is_some_and(|v| !v.is_null()) {
            return Err(Failure::Unsupported);
        }
    }
    if params["allowProviderModelFallback"] == true || params["ephemeral"] == true {
        return Err(Failure::Unsupported);
    }
    Ok(())
}
fn selected(params: &Value, context: &ThreadContext) -> Result<(), Failure> {
    for (key, current) in [
        ("model", &context.model),
        ("modelProvider", &context.provider),
        ("effort", &context.effort),
        ("reasoningEffort", &context.effort),
    ] {
        if let Some(selected) = optional_text(params, key)?
            && current.as_ref().map(ActorId::as_str) != Some(selected.as_str())
        {
            return Err(Failure::Unsupported);
        }
    }
    Ok(())
}
fn thread_response(
    state: &ConversationSnapshot,
    context: &ThreadContext,
    turns: Vec<Value>,
) -> Result<Value, Failure> {
    Ok(
        json!({"thread":thread(state,context,turns)?,"model":context.model.as_ref().map(ActorId::as_str).unwrap_or(""),"modelProvider":context.provider.as_ref().map(ActorId::as_str).unwrap_or(""),"serviceTier":null,"cwd":context.cwd,"approvalPolicy":context.approval_policy,"approvalsReviewer":"user","sandbox":context.sandbox,"reasoningEffort":context.effort,"disabledPluginIds":[]}),
    )
}
fn thread(
    state: &ConversationSnapshot,
    context: &ThreadContext,
    turns: Vec<Value>,
) -> Result<Value, Failure> {
    if !std::path::Path::new(&context.cwd).is_absolute() {
        return Err(Failure::Unavailable);
    }
    let created =
        i64::try_from(context.created_at_ms.get() / 1000).map_err(|_| Failure::Unavailable)?;
    let updated = i64::try_from(state.session.last_human_interaction_ms.get() / 1000)
        .map_err(|_| Failure::Unavailable)?;
    Ok(
        json!({"id":state.session.conversation_id,"sessionId":state.session.conversation_id,"projectId":state.session.project_id,"preview":"","ephemeral":false,"modelProvider":context.provider.as_ref().map(ActorId::as_str).unwrap_or(""),"model":context.model,"reasoningEffort":context.effort,"createdAt":created,"updatedAt":updated,"recencyAt":updated,"status":{"type":if state.session.active_turn_id.is_some(){"active"}else{"idle"},"activeFlags":[]},"path":null,"cwd":context.cwd,"cliVersion":env!("CARGO_PKG_VERSION"),"originator":"ironloom","source":"appServer","name":context.name,"turns":turns,"historyMode":"paginated","forkedFromId":null,"attachedToThreadId":null,"parentThreadId":null,"extra":null,"gitInfo":null,"threadSource":"user","agentNickname":null,"agentRole":null,"canAcceptDirectInput":true}),
    )
}
fn turn(id: &str, items: Vec<Value>, status: &str, view: &str) -> Value {
    json!({"id":id,"rootTurnId":null,"items":items,"itemsView":view,"status":status,"error":null,"startedAt":null,"completedAt":null,"durationMs":null})
}
pub(crate) fn history_item(item: &HistoryItem) -> Result<Value, Failure> {
    let value = serde_json::to_value(&item.message).map_err(|_| Failure::Unavailable)?;
    let mut text = value["text"].as_str().unwrap_or("").to_owned();
    match value["role"].as_str() {
        Some("user") => Ok(
            json!({"type":"userMessage","id":item.item_id,"clientId":null,"content":[{"type":"text","text":text,"textElements":[]}]}),
        ),
        Some("assistant") => {
            if let Some(calls) = value["tool_calls"].as_array() {
                for call in calls {
                    text.push_str(&format!(
                        "\nTool call {}: {}\n{}",
                        call["tool_call_id"].as_str().ok_or(Failure::Unavailable)?,
                        call["name"].as_str().ok_or(Failure::Unavailable)?,
                        call["arguments"]
                    ));
                }
            }
            Ok(json!({"type":"agentMessage","id":item.item_id,"text":text}))
        }
        Some("tool") => {
            // A result record need not share its page with the original call. Preserve its exact
            // correlation ID without fabricating a tool name or execution status from that absence.
            Ok(
                json!({"type":"agentMessage","id":item.item_id,"text":format!("Tool result {}:\n{}",value["tool_result"]["tool_call_id"].as_str().ok_or(Failure::Unavailable)?,value["tool_result"]["content"])}),
            )
        }
        Some("system" | "developer") => Ok(
            json!({"type":"agentMessage","id":item.item_id,"text":format!("{} context:\n{}",value["role"].as_str().ok_or(Failure::Unavailable)?,text)}),
        ),
        _ => Err(Failure::Unavailable),
    }
}

fn timestamp(value: Option<Counter>) -> Result<Value, Failure> {
    value
        .map(|v| {
            i64::try_from(v.get() / 1000)
                .map(Value::from)
                .map_err(|_| Failure::Unavailable)
        })
        .transpose()
        .map(|v| v.unwrap_or(Value::Null))
}

pub(crate) fn relay_error(error: ServiceError) -> RelayError {
    match error {
        ServiceError::Authentication(AuthenticationError::Unavailable) => RelayError::Unavailable,
        ServiceError::Authentication(_) => RelayError::Authentication,
        ServiceError::ApprovalRequired => RelayError::ApprovalRequired,
        _ => RelayError::Unavailable,
    }
}

fn start_hints(params: &Value) -> Result<StartHints, Failure> {
    fn id(params: &Value, key: &str) -> Result<Option<ActorId>, Failure> {
        optional_text(params, key)?
            .map(|v| ActorId::new(v).map_err(|_| Failure::Invalid))
            .transpose()
    }
    let effort = id(params, "effort")?;
    let reasoning = id(params, "reasoningEffort")?;
    if effort.is_some() && reasoning.is_some() && effort != reasoning {
        return Err(Failure::Invalid);
    }
    Ok(StartHints {
        model: id(params, "model")?,
        provider: id(params, "modelProvider")?,
        effort: effort.or(reasoning),
    })
}
