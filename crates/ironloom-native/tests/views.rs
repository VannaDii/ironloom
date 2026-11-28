use ironloom_core::validation::decode;
use ironloom_core::*;
use ironloom_native::{
    relay::{Peer, RelayError},
    rpc::{NativeAuthority, ThreadContext, TurnMetadata, TurnStatus},
    views::{NativeViews, View, ViewStore},
};
use ironloom_service::factory::*;
use serde_json::{Value, json};
use std::sync::{Arc, Mutex};
use tokio::sync::Notify;
struct Service {
    state: ConversationSnapshot,
    events: Vec<ServiceEvent>,
    subscriptions: Mutex<Vec<ReplayCursor>>,
}
impl FactoryService for Service {
    fn projects(
        &self,
        _session: AuthenticatedSession,
        _query: ProjectQuery,
    ) -> BoxFuture<'_, Result<ProjectPage, ServiceError>> {
        Box::pin(async { Err(ServiceError::Unavailable) })
    }
    fn create_project(
        &self,
        _session: AuthenticatedSession,
        _request: CreateProject,
    ) -> BoxFuture<'_, Result<ProjectSummary, ServiceError>> {
        Box::pin(async { Err(ServiceError::Unavailable) })
    }
    fn self_grant_project(
        &self,
        _session: AuthenticatedSession,
        _project: ProjectId,
        _command: CommandId,
    ) -> BoxFuture<'_, Result<ProjectSummary, ServiceError>> {
        Box::pin(async { Err(ServiceError::Unavailable) })
    }
    fn credentials(
        &self,
        _session: AuthenticatedSession,
    ) -> BoxFuture<'_, Result<Vec<CredentialSummary>, ServiceError>> {
        Box::pin(async { Err(ServiceError::Unavailable) })
    }
    fn credential(
        &self,
        _session: AuthenticatedSession,
        _request: CredentialCommand,
    ) -> BoxFuture<'_, Result<Option<CredentialSummary>, ServiceError>> {
        Box::pin(async { Err(ServiceError::Unavailable) })
    }
    fn native_connection(
        &self,
        _session: AuthenticatedSession,
        _node: NodeId,
    ) -> BoxFuture<'_, Result<NativeConnectionState, ServiceError>> {
        Box::pin(async { Err(ServiceError::Unavailable) })
    }
    fn configure_native(
        &self,
        _session: AuthenticatedSession,
        _request: NativeConnectionCommand,
    ) -> BoxFuture<'_, Result<NativeConnectionState, ServiceError>> {
        Box::pin(async { Err(ServiceError::Unavailable) })
    }
    fn source_search(
        &self,
        _session: AuthenticatedSession,
        _project: Option<ProjectId>,
        _query: ironloom_models::factory::SourceQuery,
    ) -> BoxFuture<'_, Result<ironloom_models::factory::SourcePage, ServiceError>> {
        Box::pin(async { Err(ServiceError::Unavailable) })
    }
    fn download_status(
        &self,
        _session: AuthenticatedSession,
        _download: ActorId,
    ) -> BoxFuture<'_, Result<ironloom_models::factory::DownloadProgress, ServiceError>> {
        Box::pin(async { Err(ServiceError::Unavailable) })
    }
    fn download(
        &self,
        _session: AuthenticatedSession,
        _request: DownloadCommand,
    ) -> BoxFuture<'_, Result<ironloom_models::factory::DownloadProgress, ServiceError>> {
        Box::pin(async { Err(ServiceError::Unavailable) })
    }
    fn create_conversation(
        &self,
        _session: AuthenticatedSession,
        _request: CreateConversation,
    ) -> BoxFuture<'_, Result<ConversationSnapshot, ServiceError>> {
        Box::pin(async { Err(ServiceError::Unavailable) })
    }
    fn configuration(
        &self,
        _session: AuthenticatedSession,
        _project: Option<ProjectId>,
    ) -> BoxFuture<'_, Result<ConfigurationSnapshot, ServiceError>> {
        Box::pin(async { Err(ServiceError::Unavailable) })
    }
    fn configure(
        &self,
        _session: AuthenticatedSession,
        _request: ConfigurationCommand,
    ) -> BoxFuture<'_, Result<ConfigurationSnapshot, ServiceError>> {
        Box::pin(async { Err(ServiceError::Unavailable) })
    }
    fn lessons(
        &self,
        _session: AuthenticatedSession,
        _query: LessonQuery,
    ) -> BoxFuture<'_, Result<LessonPage, ServiceError>> {
        Box::pin(async { Err(ServiceError::Unavailable) })
    }
    fn snapshot(
        &self,
        _session: AuthenticatedSession,
        _conversation: ConversationId,
    ) -> BoxFuture<'_, Result<ConversationSnapshot, ServiceError>> {
        Box::pin(async { Ok(self.state.clone()) })
    }
    fn history(
        &self,
        _session: AuthenticatedSession,
        _query: HistoryQuery,
    ) -> BoxFuture<'_, Result<HistoryPage, ServiceError>> {
        Box::pin(async { Err(ServiceError::Unavailable) })
    }
    fn subscribe(
        &self,
        _session: AuthenticatedSession,
        after: ReplayCursor,
    ) -> BoxFuture<'_, Result<EventSubscription, ServiceError>> {
        Box::pin(async move {
            self.subscriptions.lock().unwrap().push(after.clone());
            let (tx, rx) = tokio::sync::mpsc::channel(16);
            for event in &self.events {
                if event.cursor.sequence > after.sequence {
                    tx.send(Ok(event.clone())).await.unwrap();
                }
            }
            Ok(EventSubscription { events: rx })
        })
    }
    fn command(
        &self,
        _session: AuthenticatedSession,
        _command: Command,
    ) -> BoxFuture<'_, Result<CommandReceipt, ServiceError>> {
        Box::pin(async { Err(ServiceError::Unavailable) })
    }
    fn replay(
        &self,
        _session: AuthenticatedSession,
        _cursor: ReplayCursor,
    ) -> BoxFuture<'_, Result<Vec<ServiceEvent>, ServiceError>> {
        Box::pin(async { Err(ServiceError::Unavailable) })
    }
    fn sessions(
        &self,
        _session: AuthenticatedSession,
        _query: SessionQuery,
    ) -> BoxFuture<'_, Result<Vec<SessionSummary>, ServiceError>> {
        Box::pin(async { Err(ServiceError::Unavailable) })
    }
}
struct Authority;
impl NativeAuthority for Authority {
    fn session(&self, _peer: Peer) -> BoxFuture<'_, Result<AuthenticatedSession, ServiceError>> {
        Box::pin(async {
            decode(br#"{"operator_id":"operator","session_id":"session","method":"local","expires_at_ms":"100"}"#).map_err(ServiceError::Validation)
        })
    }
    fn home(
        &self,
        _session: AuthenticatedSession,
    ) -> BoxFuture<'_, Result<std::path::PathBuf, ServiceError>> {
        Box::pin(async { Err(ServiceError::Unavailable) })
    }
    fn turn(
        &self,
        _session: AuthenticatedSession,
        _conversation: ConversationId,
        _turn: TurnId,
    ) -> BoxFuture<'_, Result<TurnMetadata, ServiceError>> {
        Box::pin(async {
            Ok(TurnMetadata {
                status: TurnStatus::Completed,
                started_at_ms: Some(Counter::new(1)),
                completed_at_ms: Some(Counter::new(2)),
                duration_ms: Some(Counter::new(1)),
            })
        })
    }
    fn project(
        &self,
        _session: AuthenticatedSession,
        _project: Option<ProjectId>,
        _cwd: Option<String>,
    ) -> BoxFuture<'_, Result<ProjectId, ServiceError>> {
        Box::pin(async { Err(ServiceError::Unavailable) })
    }
    fn context(
        &self,
        _session: AuthenticatedSession,
        _conversation: ConversationId,
    ) -> BoxFuture<'_, Result<ThreadContext, ServiceError>> {
        Box::pin(async { Err(ServiceError::Unavailable) })
    }
    fn prepare(
        &self,
        _session: AuthenticatedSession,
        _fingerprint: String,
        _candidate: Command,
    ) -> BoxFuture<'_, Result<Command, ServiceError>> {
        Box::pin(async { Err(ServiceError::Unavailable) })
    }
}
#[derive(Default)]
struct Store {
    view: Mutex<Option<View>>,
    messages: Mutex<Vec<Value>>,
    changed: Notify,
}
impl ViewStore for Store {
    fn watch(&self, peer: Peer, after: ReplayCursor) -> BoxFuture<'_, Result<(), RelayError>> {
        Box::pin(async move {
            *self.view.lock().unwrap() = Some(View {
                peer,
                cursor: after,
            });
            Ok(())
        })
    }
    fn views(&self, peer: Peer) -> BoxFuture<'_, Result<Vec<View>, RelayError>> {
        Box::pin(async move {
            Ok(self
                .view
                .lock()
                .unwrap()
                .iter()
                .filter(|v| v.peer == peer)
                .cloned()
                .collect())
        })
    }
    fn commit(
        &self,
        view: View,
        after: ReplayCursor,
        messages: Vec<Value>,
        _: Vec<Value>,
    ) -> BoxFuture<'_, Result<(), RelayError>> {
        Box::pin(async move {
            let mut current = self.view.lock().unwrap();
            let current = current.as_mut().ok_or(RelayError::Protocol)?;
            assert_eq!(current.cursor, view.cursor);
            assert!(after.sequence >= current.cursor.sequence);
            current.cursor = after;
            self.messages.lock().unwrap().extend(messages);
            self.changed.notify_one();
            Ok(())
        })
    }
    fn remove(&self, _: Peer, _: Option<ConversationId>) -> BoxFuture<'_, Result<(), RelayError>> {
        Box::pin(async {
            *self.view.lock().unwrap() = None;
            Ok(())
        })
    }
}
fn state() -> ConversationSnapshot {
    decode(&serde_json::to_vec(&json!({"session":{"conversation_id":"c","project_id":"p","archived":false,"last_human_interaction_ms":"1"},"cursor":{"conversation_id":"c","sequence":"99"},"revision":"4","pending_questions":[]})).unwrap()).unwrap()
}
fn event(sequence: u64, kind: &str, state: Option<&str>) -> ServiceEvent {
    decode(&serde_json::to_vec(&json!({"cursor":{"conversation_id":"c","sequence":sequence.to_string()},"command_id":"command","project_id":"p","event":{"worker_id":"worker","turn_id":"turn","item_id":"item","assignment_id":"assignment","inference_id":"inference","kind":kind,"state":state,"text":if kind=="text_delta"{"fixture"}else{""}}})).unwrap()).unwrap()
}
#[tokio::test]
async fn feed_eof_and_provider_completion_never_complete_turn_and_reconnect_uses_committed_cursor()
{
    for terminal in [false, true] {
        let mut events = vec![event(10, "text_delta", None), event(11, "completed", None)];
        if terminal {
            events.push(event(12, "state_changed", Some("completed")));
        }
        let service = Arc::new(Service {
            state: state(),
            events,
            subscriptions: Mutex::default(),
        });
        let store = Arc::new(Store::default());
        let adapter = NativeViews::new(
            service.clone(),
            Arc::new(Authority),
            store.clone(),
            Arc::new(Notify::new()),
        );
        let peer = Peer {
            client: ActorId::new("client").unwrap(),
            stream: ActorId::new("stream").unwrap(),
        };
        let mut initial = (*state()).clone();
        initial.cursor = ReplayCursor::new(ReplayCursorData {
            conversation_id: ConversationId::new("c").unwrap(),
            sequence: Counter::new(9),
        })
        .unwrap();
        adapter
            .watch(peer.clone(), &ConversationSnapshot::new(initial).unwrap())
            .await
            .unwrap();
        adapter.ready(peer.clone()).await.unwrap();
        tokio::time::timeout(std::time::Duration::from_secs(2), async {
            loop {
                let notified = store.changed.notified();
                if store
                    .messages
                    .lock()
                    .unwrap()
                    .iter()
                    .any(|v| v["method"] == "thread/closed")
                {
                    break;
                }
                notified.await;
            }
        })
        .await
        .unwrap();
        adapter.disconnected().await;
        let messages = store.messages.lock().unwrap().clone();
        assert_eq!(
            messages
                .iter()
                .filter(|v| v["method"] == "item/agentMessage/delta")
                .count(),
            1
        );
        assert_eq!(
            messages
                .iter()
                .filter(|v| v["method"] == "turn/completed")
                .count(),
            usize::from(terminal)
        );
        let expected = if terminal { 12 } else { 11 };
        assert_eq!(
            store
                .view
                .lock()
                .unwrap()
                .as_ref()
                .unwrap()
                .cursor
                .sequence
                .get(),
            expected
        );
        adapter.ready(peer).await.unwrap();
        tokio::time::timeout(std::time::Duration::from_secs(2), async {
            loop {
                tokio::task::yield_now().await;
                if service.subscriptions.lock().unwrap().len() == 2 {
                    break;
                }
            }
        })
        .await
        .unwrap();
        adapter.disconnected().await;
        assert_eq!(
            service.subscriptions.lock().unwrap()[1].sequence.get(),
            expected
        );
        assert_eq!(
            store
                .messages
                .lock()
                .unwrap()
                .iter()
                .filter(|v| v["method"] == "item/agentMessage/delta")
                .count(),
            1
        );
    }
}
