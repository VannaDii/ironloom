//! Durable native viewer subscriptions. Relay acknowledgement and service replay are separate cursors.
use crate::{
    prompts,
    relay::Peer,
    rpc::{NativeAuthority, TurnStatus},
};
use ironloom_core::{BoxFuture, ConversationId, validation::decode};
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
}
/// PostgreSQL callbacks for transport projection only. The factory service owns all decisions,
/// sessions and execution. Implementations share a transaction with the relay outbox.
pub trait ViewStore: Send + Sync {
    /// Installs/replaces a viewer at the explicitly read snapshot watermark. Never dispatches work.
    fn watch(
        &self,
        peer: Peer,
        after: ReplayCursor,
    ) -> BoxFuture<'_, Result<(), crate::relay::RelayError>>;
    /// Loads this peer's durable active viewers, checking the current enrollment generation.
    fn views(&self, peer: Peer) -> BoxFuture<'_, Result<Vec<View>, crate::relay::RelayError>>;
    /// Atomically compares the stored viewer cursor, enqueues messages with conversation scopes
    /// and advances only to `after`. Identical replay must not enqueue twice; changed payload at
    /// an existing native request ID conflicts. Equal cursor is allowed for idempotent snapshot
    /// prompts. Reconcile the complete current prompt list by its request IDs: retain unchanged
    /// prompts, enqueue new ones once, and emit serverRequest/resolved for removed IDs. This is
    /// presentation state only; the service snapshot remains the sole approval/question authority.
    /// Current human/resource authorization must be rechecked in this transaction.
    fn commit(
        &self,
        view: View,
        after: ReplayCursor,
        messages: Vec<Value>,
        prompts: Vec<Value>,
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
        self.store.watch(peer, state.cursor.clone()).await
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
    let value =
        serde_json::to_value(&event.event).map_err(|_| crate::relay::RelayError::Protocol)?;
    let kind = value["kind"]
        .as_str()
        .ok_or(crate::relay::RelayError::Protocol)?;
    let thread = &event.cursor.conversation_id;
    let turn = &event.event.turn_id;
    let item = &event.event.item_id;
    let message = match kind {
        "text_delta" | "progress" | "stdout" | "stderr" => Some(
            json!({"method":"item/agentMessage/delta","params":{"threadId":thread,"turnId":turn,"itemId":item,"delta":event.event.text}}),
        ),
        "started" => Some(
            json!({"method":"item/started","params":{"threadId":thread,"turnId":turn,"item":{"type":"agentMessage","id":item,"text":""}}}),
        ),
        "tool_ready" => {
            let tool: ironloom_models::factory::ToolInvocation =
                decode(event.event.text.as_bytes())
                    .map_err(|_| crate::relay::RelayError::Protocol)?;
            if event.event.tool_call_id.as_ref() != Some(&tool.tool_call_id) {
                return Err(crate::relay::RelayError::Protocol);
            }
            Some(
                json!({"method":"item/started","params":{"threadId":thread,"turnId":turn,"item":{"type":"dynamicToolCall","id":tool.tool_call_id,"tool":tool.name,"arguments":tool.arguments,"namespace":null,"status":"inProgress","contentItems":null,"success":null,"durationMs":null}}}),
            )
        }
        "failed" => Some(
            json!({"method":"error","params":{"threadId":thread,"turnId":turn,"willRetry":false,"error":{"message":event.event.text,"codexErrorInfo":null,"additionalDetails":null}}}),
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
    let result:Result<(),crate::relay::RelayError>=async {
                    let session=authority.session(view.peer.clone()).await.map_err(|_|crate::relay::RelayError::Authentication)?;
                    let state=service.snapshot(session.clone(),view.cursor.conversation_id.clone()).await.map_err(|_|crate::relay::RelayError::Unavailable)?;
                    let initial=prompts::requests(&state).map_err(|_|crate::relay::RelayError::Protocol)?;
                    store.commit(view.clone(),view.cursor.clone(),Vec::new(),initial).await?;wakeup.notify_one();
                    let mut feed=service.subscribe(session,view.cursor.clone()).await.map_err(|_|crate::relay::RelayError::Unavailable)?;
                    while let Some(event)=feed.events.recv().await {
                        let event=event.map_err(|_|crate::relay::RelayError::Unavailable)?;
                        if event.cursor.conversation_id!=view.cursor.conversation_id || event.cursor.sequence<=view.cursor.sequence {return Err(crate::relay::RelayError::Protocol);}
                        // Revalidate identity on every event, independently from transport liveness.
                        let session=authority.session(view.peer.clone()).await.map_err(|_|crate::relay::RelayError::Authentication)?;
                        let state=service.snapshot(session.clone(),view.cursor.conversation_id.clone()).await.map_err(|_|crate::relay::RelayError::Unavailable)?;
                        if state.cursor.sequence<event.cursor.sequence {return Err(crate::relay::RelayError::Unavailable);}
                        let mut messages=project(&event)?;
                        let value=serde_json::to_value(&event.event).map_err(|_|crate::relay::RelayError::Protocol)?;
                        if matches!(value["kind"].as_str(),Some("state_changed"|"termination_confirmed")) && matches!(value["state"].as_str(),Some("completed"|"failed"|"terminated")) {
                            let metadata=authority.turn(session,view.cursor.conversation_id.clone(),event.event.turn_id.clone()).await.map_err(|_|crate::relay::RelayError::Unavailable)?;
                            if !matches!(metadata.status,TurnStatus::InProgress) {
                                messages.push(json!({"method":"turn/completed","params":{"threadId":view.cursor.conversation_id,"turn":{"id":event.event.turn_id,"items":[],"itemsView":"notLoaded","status":metadata.status,"error":null,"startedAt":metadata.started_at_ms.map(|n|n.get()/1000),"completedAt":metadata.completed_at_ms.map(|n|n.get()/1000),"durationMs":metadata.duration_ms.map(|n|n.get())}}}));
                            }
                        }
                        let prompts=prompts::requests(&state).map_err(|_|crate::relay::RelayError::Protocol)?;
                        store.commit(view.clone(),event.cursor.clone(),messages,prompts).await?;
                        view.cursor=event.cursor.clone();wakeup.notify_one();
                    }
                    Err(crate::relay::RelayError::Unavailable) // EOF is viewer interruption only.
                }.await;
    if result.is_err() {
        // A native thread/closed notification detaches a viewer; it makes no claim
        // about execution. Explicit resume rehydrates history before another feed.
        let closed =
            json!({"method":"thread/closed","params":{"threadId":view.cursor.conversation_id}});
        if store
            .commit(view.clone(), view.cursor.clone(), vec![closed], Vec::new())
            .await
            .is_ok()
        {
            wakeup.notify_one();
        }
    }
}
