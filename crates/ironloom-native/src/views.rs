//! Durable native viewer subscriptions. Relay acknowledgement and service replay are separate cursors.
use crate::{
    prompts,
    relay::Peer,
    rpc::{NativeAuthority, TurnStatus},
};
use ironloom_core::{BoxFuture, ConversationId, Counter, TurnId, validation::decode};
use ironloom_service::factory::{ConversationSnapshot, FactoryService, ReplayCursor, ServiceEvent};
use serde_json::{Value, json};
use std::{collections::BTreeMap, sync::Arc};
use tokio::{
    sync::{Mutex, Notify},
    task::JoinHandle,
};

/// One persisted native viewer position; it conveys no resource authority.
#[derive(Clone)]
pub struct View {
    /// Native peer scoped by the store to the current enrollment generation.
    pub peer: Peer,
    /// Last service event atomically projected into the durable relay outbox.
    pub cursor: ReplayCursor,
    /// Last rendered authorized snapshot watermark, separate from consumed event replay.
    pub snapshot_cursor: ReplayCursor,
    /// Last rendered command revision; overlapping reads never rewind native controls.
    pub snapshot_revision: Counter,
    /// Last rendered active turn, used only to project service-confirmed lifecycle changes.
    pub active_turn_id: Option<TurnId>,
}
/// PostgreSQL callbacks for transport projection only. The factory service owns all decisions,
/// sessions and execution. Implementations share a transaction with the relay outbox.
pub trait ViewStore: Send + Sync {
    /// Installs/replaces a viewer at the explicitly read snapshot watermark. Never dispatches work.
    fn watch(&self, view: View) -> BoxFuture<'_, Result<(), crate::relay::RelayError>>;
    /// Loads this peer's durable active viewers, checking the current enrollment generation.
    fn views(&self, peer: Peer) -> BoxFuture<'_, Result<Vec<View>, crate::relay::RelayError>>;
    /// Atomically compares the stored viewer cursor, enqueues messages with conversation scopes
    /// and advances only to `after`. Identical replay must not enqueue twice; changed payload at
    /// an existing native request ID conflicts. Equal cursor is allowed for idempotent snapshot
    /// prompts. Reconcile the complete current prompt list by its request IDs: retain unchanged
    /// prompts, enqueue new ones once, and emit serverRequest/resolved for removed IDs.
    /// None preserves pending prompts while replay is behind the latest snapshot; Some reconciles
    /// the complete prompt list only at its consumed watermark. This is presentation state only;
    /// the service snapshot remains the sole approval/question authority.
    /// Current human/resource authorization must be rechecked in this transaction.
    fn commit(
        &self,
        view: View,
        after: View,
        messages: Vec<Value>,
        prompts: Option<Vec<Value>>,
    ) -> BoxFuture<'_, Result<(), crate::relay::RelayError>>;
    /// Detaches a conversation or all this peer's viewers; never cancels background assignments.
    fn remove(
        &self,
        peer: Peer,
        conversation: Option<ConversationId>,
    ) -> BoxFuture<'_, Result<(), crate::relay::RelayError>>;
}
/// Real shared-service feed projection into the durable native relay outbox.
pub struct NativeViews {
    service: Arc<dyn FactoryService>,
    authority: Arc<dyn NativeAuthority>,
    store: Arc<dyn ViewStore>,
    wakeup: Arc<Notify>,
    tasks: Mutex<BTreeMap<(Peer, ConversationId), JoinHandle<()>>>,
}
impl NativeViews {
    /// Constructs an inert viewer adapter; no sockets, workers or subscriptions start here.
    pub fn new(
        service: Arc<dyn FactoryService>,
        authority: Arc<dyn NativeAuthority>,
        store: Arc<dyn ViewStore>,
        wakeup: Arc<Notify>,
    ) -> Self {
        Self {
            service,
            authority,
            store,
            wakeup,
            tasks: Mutex::default(),
        }
    }
    /// Records explicit thread start/resume only after the service has authorized its snapshot.
    pub async fn watch(
        &self,
        peer: Peer,
        state: &ConversationSnapshot,
    ) -> Result<(), crate::relay::RelayError> {
        self.abort(&peer, Some(&state.session.conversation_id))
            .await;
        self.store
            .watch(View {
                peer,
                cursor: state.cursor.clone(),
                snapshot_cursor: state.cursor.clone(),
                snapshot_revision: state.revision,
                active_turn_id: state.session.active_turn_id.clone(),
            })
            .await
    }
    /// Starts feeds after the request's durable RPC reply is queued, preserving native wire order.
    pub async fn ready(&self, peer: Peer) -> Result<(), crate::relay::RelayError> {
        let views = self.store.views(peer).await?;
        let mut tasks = self.tasks.lock().await;
        if views.len() > 256
            || tasks.len().saturating_add(
                views
                    .iter()
                    .filter(|v| {
                        !tasks.contains_key(&(v.peer.clone(), v.cursor.conversation_id.clone()))
                    })
                    .count(),
            ) > 256
        {
            return Err(crate::relay::RelayError::Unavailable);
        }
        for view in views {
            let key = (view.peer.clone(), view.cursor.conversation_id.clone());
            if tasks.get(&key).is_some_and(|task| !task.is_finished()) {
                continue;
            }
            let service = self.service.clone();
            let authority = self.authority.clone();
            let store = self.store.clone();
            let wakeup = self.wakeup.clone();
            tasks.insert(
                key,
                tokio::spawn(run_view(view, service, authority, store, wakeup)),
            );
        }
        Ok(())
    }
    /// Stops transient feed readers on relay loss without touching durable viewer positions/work.
    pub async fn disconnected(&self) {
        let tasks = std::mem::take(&mut *self.tasks.lock().await);
        for (_, task) in tasks {
            task.abort();
            let _ = task.await;
        }
    }
    /// Explicit viewer detach, independently from durable execution cancellation.
    pub async fn remove(
        &self,
        peer: Peer,
        conversation: Option<ConversationId>,
    ) -> Result<(), crate::relay::RelayError> {
        self.abort(&peer, conversation.as_ref()).await;
        self.store.remove(peer, conversation).await
    }
    async fn abort(&self, peer: &Peer, conversation: Option<&ConversationId>) {
        let mut tasks = self.tasks.lock().await;
        let keys = tasks
            .keys()
            .filter(|(p, c)| p == peer && conversation.is_none_or(|v| v == c))
            .cloned()
            .collect::<Vec<_>>();
        let pending = keys
            .into_iter()
            .filter_map(|key| tasks.remove(&key))
            .collect::<Vec<_>>();
        drop(tasks);
        for task in pending {
            task.abort();
            let _ = task.await;
        }
    }
}
/// Maps one normalized service event without interpreting stream EOF/provider completion as turn
/// completion. Persisted turn transitions are projected separately with service-owned outcomes.
pub fn project(event: &ServiceEvent) -> Result<Vec<Value>, crate::relay::RelayError> {
    let Some(worker) = &event.event else {
        return Ok(Vec::new());
    };
    let value = serde_json::to_value(worker).map_err(|_| crate::relay::RelayError::Protocol)?;
    let kind = value["kind"]
        .as_str()
        .ok_or(crate::relay::RelayError::Protocol)?;
    let thread = &event.cursor.conversation_id;
    let turn = &worker.turn_id;
    let item = &worker.item_id;
    let message = match kind {
        "text_delta" | "progress" | "stdout" | "stderr" => Some(
            json!({"method":"item/agentMessage/delta","params":{"threadId":thread,"turnId":turn,"itemId":item,"delta":worker.text}}),
        ),
        "started" => Some(
            json!({"method":"item/started","params":{"threadId":thread,"turnId":turn,"item":{"type":"agentMessage","id":item,"text":""}}}),
        ),
        "tool_ready" => {
            let tool: ironloom_models::factory::ToolInvocation =
                decode(worker.text.as_bytes()).map_err(|_| crate::relay::RelayError::Protocol)?;
            if worker.tool_call_id.as_ref() != Some(&tool.tool_call_id) {
                return Err(crate::relay::RelayError::Protocol);
            }
            Some(
                json!({"method":"item/started","params":{"threadId":thread,"turnId":turn,"item":{"type":"dynamicToolCall","id":tool.tool_call_id,"tool":tool.name,"arguments":tool.arguments,"namespace":null,"status":"inProgress","contentItems":null,"success":null,"durationMs":null}}}),
            )
        }
        "failed" => Some(
            json!({"method":"error","params":{"threadId":thread,"turnId":turn,"willRetry":false,"error":{"message":worker.text,"codexErrorInfo":null,"additionalDetails":null}}}),
        ),
        _ => None,
    };
    Ok(message.into_iter().collect())
}

async fn run_view(
    mut view: View,
    service: Arc<dyn FactoryService>,
    authority: Arc<dyn NativeAuthority>,
    store: Arc<dyn ViewStore>,
    wakeup: Arc<Notify>,
) {
    let result = run_feed(&mut view, service, authority, store.clone(), wakeup.clone()).await;
    if result.is_err() {
        // Detach this viewer only; no turn/execution outcome is inferred from transport failure.
        let closed =
            json!({"method":"thread/closed","params":{"threadId":view.cursor.conversation_id}});
        if store
            .commit(view.clone(), view.clone(), vec![closed], None)
            .await
            .is_ok()
        {
            wakeup.notify_one();
        }
    }
}
async fn run_feed(
    view: &mut View,
    service: Arc<dyn FactoryService>,
    authority: Arc<dyn NativeAuthority>,
    store: Arc<dyn ViewStore>,
    wakeup: Arc<Notify>,
) -> Result<(), crate::relay::RelayError> {
    let session = authority
        .session(view.peer.clone())
        .await
        .map_err(crate::rpc::relay_error)?;
    let state = service
        .snapshot(session.clone(), view.cursor.conversation_id.clone())
        .await
        .map_err(crate::rpc::relay_error)?;
    if state.cursor.sequence < view.snapshot_cursor.sequence
        || state.revision < view.snapshot_revision
    {
        return Err(crate::relay::RelayError::Unavailable);
    }
    // A current snapshot can be ahead of this viewer's retained source cursor. Replay item output
    // first; never announce its later lifecycle/prompts before consuming their source watermark.
    if state.cursor == view.cursor {
        let mut next = view.clone();
        let initial = controls(&mut next, &state, authority.as_ref(), session.clone()).await?;
        let prompts = prompts::requests(&state).map_err(|_| crate::relay::RelayError::Protocol)?;
        store
            .commit(view.clone(), next.clone(), initial, Some(prompts))
            .await?;
        *view = next;
        wakeup.notify_one();
    }
    let mut feed = service
        .subscribe(session, view.cursor.clone())
        .await
        .map_err(crate::rpc::relay_error)?;
    while let Some(event) = feed.events.recv().await {
        let event = event.map_err(crate::rpc::relay_error)?;
        if event.cursor.conversation_id != view.cursor.conversation_id
            || event.cursor.sequence <= view.cursor.sequence
        {
            return Err(crate::relay::RelayError::Protocol);
        }
        let session = authority
            .session(view.peer.clone())
            .await
            .map_err(crate::rpc::relay_error)?;
        let state = service
            .snapshot(session.clone(), view.cursor.conversation_id.clone())
            .await
            .map_err(crate::rpc::relay_error)?;
        if state.cursor.sequence < event.cursor.sequence
            || state.cursor.sequence < view.snapshot_cursor.sequence
            || state.revision < view.snapshot_revision
        {
            return Err(crate::relay::RelayError::Unavailable);
        }
        let mut next = view.clone();
        next.cursor = event.cursor.clone();
        let mut messages = project(&event)?;
        if let Some(worker) = &event.event {
            let value =
                serde_json::to_value(worker).map_err(|_| crate::relay::RelayError::Protocol)?;
            if matches!(
                value["kind"].as_str(),
                Some("completed" | "failed" | "termination_confirmed")
            ) {
                for item in authority
                    .completed(
                        session.clone(),
                        event.cursor.clone(),
                        worker.item_id.clone(),
                    )
                    .await
                    .map_err(crate::rpc::relay_error)?
                {
                    messages.push(item.notification(
                        &view.cursor.conversation_id,
                        &worker.turn_id,
                        &worker.item_id,
                    )?);
                }
            }
            if next.active_turn_id.as_ref() == Some(&worker.turn_id)
                && matches!(
                    value["kind"].as_str(),
                    Some("state_changed" | "termination_confirmed")
                )
                && matches!(
                    value["state"].as_str(),
                    Some("completed" | "failed" | "terminated")
                )
            {
                let metadata = authority
                    .turn(
                        session.clone(),
                        view.cursor.conversation_id.clone(),
                        worker.turn_id.clone(),
                    )
                    .await
                    .map_err(crate::rpc::relay_error)?;
                if !matches!(metadata.status, TurnStatus::InProgress) {
                    messages.push(turn_completed(
                        &view.cursor.conversation_id,
                        &worker.turn_id,
                        metadata,
                    )?);
                    next.active_turn_id = None;
                }
            }
        }
        let render = event
            .snapshot
            .as_ref()
            .or_else(|| (state.cursor == event.cursor).then_some(&state));
        let prompts = if let Some(render) = render {
            // The item's final result above precedes lifecycle changes at the same watermark.
            messages
                .extend(controls(&mut next, render, authority.as_ref(), session.clone()).await?);
            Some(prompts::requests(render).map_err(|_| crate::relay::RelayError::Protocol)?)
        } else {
            None
        };
        store
            .commit(view.clone(), next.clone(), messages, prompts)
            .await?;
        *view = next;
        wakeup.notify_one();
    }
    Err(crate::relay::RelayError::Unavailable)
}
async fn controls(
    view: &mut View,
    state: &ConversationSnapshot,
    authority: &dyn NativeAuthority,
    session: ironloom_service::factory::AuthenticatedSession,
) -> Result<Vec<Value>, crate::relay::RelayError> {
    if state.cursor.sequence < view.snapshot_cursor.sequence
        || state.revision < view.snapshot_revision
    {
        return Ok(Vec::new());
    }
    let mut messages = Vec::new();
    if state.cursor.sequence == view.snapshot_cursor.sequence
        && state.revision == view.snapshot_revision
    {
        return Ok(messages);
    }
    if view.active_turn_id != state.session.active_turn_id {
        if let Some(previous) = &view.active_turn_id {
            let metadata = authority
                .turn(
                    session.clone(),
                    view.cursor.conversation_id.clone(),
                    previous.clone(),
                )
                .await
                .map_err(crate::rpc::relay_error)?;
            if !matches!(metadata.status, TurnStatus::InProgress) {
                messages.push(turn_completed(
                    &view.cursor.conversation_id,
                    previous,
                    metadata,
                )?);
            }
        }
        if let Some(current) = &state.session.active_turn_id {
            messages.push(json!({"method":"turn/started","params":{"threadId":view.cursor.conversation_id,"turn":{"id":current,"items":[],"itemsView":"notLoaded","status":"inProgress","error":null,"startedAt":null,"completedAt":null,"durationMs":null}}}));
        }
        messages.push(json!({"method":"thread/status/changed","params":{"threadId":view.cursor.conversation_id,"status":{"type":if state.session.active_turn_id.is_some(){"active"}else{"idle"},"activeFlags":[]}}}));
    }
    view.active_turn_id = state.session.active_turn_id.clone();
    view.snapshot_cursor = state.cursor.clone();
    view.snapshot_revision = state.revision;
    Ok(messages)
}
fn turn_completed(
    conversation: &ConversationId,
    turn: &TurnId,
    metadata: crate::rpc::TurnMetadata,
) -> Result<Value, crate::relay::RelayError> {
    fn number(value: Option<Counter>, divisor: u64) -> Result<Value, crate::relay::RelayError> {
        value
            .map(|value| {
                i64::try_from(value.get() / divisor)
                    .map(Value::from)
                    .map_err(|_| crate::relay::RelayError::Unavailable)
            })
            .transpose()
            .map(|value| value.unwrap_or(Value::Null))
    }
    Ok(
        json!({"method":"turn/completed","params":{"threadId":conversation,"turn":{"id":turn,"items":[],"itemsView":"notLoaded","status":metadata.status,"error":null,"startedAt":number(metadata.started_at_ms,1000)?,"completedAt":number(metadata.completed_at_ms,1000)?,"durationMs":number(metadata.duration_ms,1)?}}}),
    )
}
