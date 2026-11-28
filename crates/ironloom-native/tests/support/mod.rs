use ironloom_core::validation::decode;
use ironloom_core::*;
use ironloom_native::{
    items::CompletedItem,
    relay::{Peer, RelayError},
    rpc::{NativeAuthority, StartHints, ThreadContext, TurnMetadata, TurnStatus},
    views::{View, ViewStore},
};
use ironloom_service::factory::*;
use serde_json::{Value, json};
use std::{
    collections::BTreeMap,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicUsize, Ordering},
    },
};
use tokio::sync::Notify;
pub struct Service {
    pub state: Mutex<ConversationSnapshot>,
    pub events: Vec<ServiceEvent>,
    pub subscriptions: Mutex<Vec<ReplayCursor>>,
    pub commands: Mutex<BTreeMap<String, (Command, CommandReceipt)>>,
    pub creation_calls: AtomicUsize,
    pub history_pages: Mutex<std::collections::VecDeque<HistoryPage>>,
    pub history_queries: Mutex<Vec<HistoryQuery>>,
}
impl Service {
    pub fn new(state: ConversationSnapshot, events: Vec<ServiceEvent>) -> Arc<Self> {
        Arc::new(Self {
            state: Mutex::new(state),
            events,
            subscriptions: Mutex::default(),
            commands: Mutex::default(),
            creation_calls: AtomicUsize::new(0),
            history_pages: Mutex::default(),
            history_queries: Mutex::default(),
        })
    }
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
    fn inventory(
        &self,
        _session: AuthenticatedSession,
        _query: ModelInventoryQuery,
    ) -> BoxFuture<'_, Result<ModelInventoryPage, ServiceError>> {
        Box::pin(async { Err(ServiceError::Unavailable) })
    }
    fn assess_model(
        &self,
        _session: AuthenticatedSession,
        _query: ModelAssessmentQuery,
    ) -> BoxFuture<'_, Result<Vec<EngineAssessment>, ServiceError>> {
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
        Box::pin(async {
            self.creation_calls.fetch_add(1, Ordering::SeqCst);
            Ok(self.state.lock().unwrap().clone())
        })
    }
    fn instructions(
        &self,
        _session: AuthenticatedSession,
        _query: InstructionQuery,
    ) -> BoxFuture<'_, Result<InstructionPage, ServiceError>> {
        Box::pin(async { Err(ServiceError::Unavailable) })
    }
    fn instruction(
        &self,
        _session: AuthenticatedSession,
        _request: InstructionCommand,
    ) -> BoxFuture<'_, Result<InstructionTemplate, ServiceError>> {
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
        Box::pin(async { Ok(self.state.lock().unwrap().clone()) })
    }
    fn history(
        &self,
        _session: AuthenticatedSession,
        query: HistoryQuery,
    ) -> BoxFuture<'_, Result<HistoryPage, ServiceError>> {
        Box::pin(async move {
            self.history_queries.lock().unwrap().push(query);
            self.history_pages
                .lock()
                .unwrap()
                .pop_front()
                .ok_or(ServiceError::Unavailable)
        })
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
        command: Command,
    ) -> BoxFuture<'_, Result<CommandReceipt, ServiceError>> {
        Box::pin(async move {
            let mut commands = self.commands.lock().unwrap();
            if let Some((original, receipt)) = commands.get(command.command_id.as_str()) {
                if original != &command {
                    return Err(ServiceError::Conflict);
                }
                let mut receipt = (**receipt).clone();
                receipt.disposition = CommandDisposition::Replayed;
                return Ok(CommandReceipt::new(receipt).unwrap());
            }
            let mut state = self.state.lock().unwrap();
            let mut data = (**state).clone();
            match &command.action {
                CommandAction::Control(_) => {
                    data.session = SessionSummary::new(SessionSummaryData {
                        active_turn_id: None,
                        ..(*data.session).clone()
                    })
                    .unwrap();
                    data.active_assignment_id = None;
                    data.execution_state = None;
                }
                CommandAction::Answer(_) => data.pending_questions.clear(),
                _ => {}
            }
            data.revision = Counter::new(data.revision.get() + 1);
            data.cursor = ReplayCursor::new(ReplayCursorData {
                sequence: Counter::new(data.cursor.sequence.get() + 1),
                ..(*data.cursor).clone()
            })
            .unwrap();
            *state = ConversationSnapshot::new(data).unwrap();
            let receipt = CommandReceipt::new(CommandReceiptData {
                command_id: command.command_id.clone(),
                disposition: CommandDisposition::Accepted,
                cursor: state.cursor.clone(),
            })
            .unwrap();
            commands.insert(
                command.command_id.as_str().into(),
                (command, receipt.clone()),
            );
            Ok(receipt)
        })
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
pub struct Authority {
    pub service: Arc<Service>,
    pub error: Mutex<Option<ServiceError>>,
    saved: Mutex<BTreeMap<String, (String, Command)>>,
    pub completed: Mutex<Vec<CompletedItem>>,
    pub selected: AtomicBool,
    pub item_results: Mutex<Vec<HistoryItem>>,
    pub turn_pages: Mutex<std::collections::VecDeque<ironloom_native::rpc::NativeTurnPage>>,
    pub turn_queries: Mutex<Vec<ironloom_native::rpc::NativeTurnQuery>>,
}
impl Authority {
    pub fn new(service: Arc<Service>) -> Arc<Self> {
        Arc::new(Self {
            service,
            error: Mutex::default(),
            saved: Mutex::default(),
            completed: Mutex::default(),
            selected: AtomicBool::new(true),
            item_results: Mutex::default(),
            turn_pages: Mutex::default(),
            turn_queries: Mutex::default(),
        })
    }
    fn check(&self) -> Result<(), ServiceError> {
        if let Some(error) = self.error.lock().unwrap().clone() {
            Err(error)
        } else {
            Ok(())
        }
    }
}
impl NativeAuthority for Authority {
    fn session(&self, _: Peer) -> BoxFuture<'_, Result<AuthenticatedSession, ServiceError>> {
        Box::pin(async {
            self.check()?;
            decode(br#"{"operator_id":"operator","session_id":"session","method":"local","expires_at_ms":"100"}"#).map_err(ServiceError::Validation)
        })
    }
    fn home(
        &self,
        _: AuthenticatedSession,
    ) -> BoxFuture<'_, Result<std::path::PathBuf, ServiceError>> {
        Box::pin(async { Ok("/configured/native-metadata".into()) })
    }
    fn turn(
        &self,
        _: AuthenticatedSession,
        _: ConversationId,
        _: TurnId,
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
    fn items(
        &self,
        _: AuthenticatedSession,
        _: ReplayCursor,
        _: TurnId,
        _: Vec<ItemId>,
    ) -> BoxFuture<'_, Result<Vec<HistoryItem>, ServiceError>> {
        Box::pin(async {
            self.check()?;
            Ok(self.item_results.lock().unwrap().clone())
        })
    }
    fn turns(
        &self,
        _: AuthenticatedSession,
        query: ironloom_native::rpc::NativeTurnQuery,
    ) -> BoxFuture<'_, Result<ironloom_native::rpc::NativeTurnPage, ServiceError>> {
        Box::pin(async move {
            self.check()?;
            self.turn_queries.lock().unwrap().push(query);
            self.turn_pages
                .lock()
                .unwrap()
                .pop_front()
                .ok_or(ServiceError::Unavailable)
        })
    }
    fn completed(
        &self,
        _: AuthenticatedSession,
        _: ReplayCursor,
        _: ItemId,
    ) -> BoxFuture<'_, Result<Vec<CompletedItem>, ServiceError>> {
        Box::pin(async {
            self.check()?;
            Ok(self.completed.lock().unwrap().clone())
        })
    }
    fn project(
        &self,
        _: AuthenticatedSession,
        project: Option<ProjectId>,
        _: Option<String>,
    ) -> BoxFuture<'_, Result<ProjectId, ServiceError>> {
        Box::pin(async move {
            self.check()?;
            Ok(project.unwrap_or(ProjectId::new("p").unwrap()))
        })
    }
    fn start(
        &self,
        session: AuthenticatedSession,
        request: CreateConversation,
        hints: StartHints,
        _: String,
    ) -> BoxFuture<'_, Result<ConversationSnapshot, ServiceError>> {
        Box::pin(async move {
            self.check()?;
            if !self.selected.load(Ordering::SeqCst)
                && (hints.model.is_some() || hints.provider.is_some() || hints.effort.is_some())
            {
                return Err(ServiceError::Validation(
                    ironloom_core::validation::ValidationErrors::field("model", "no_selected_role"),
                ));
            }

            if hints
                .model
                .as_ref()
                .is_some_and(|v| v.as_str() != "selected")
                || hints
                    .provider
                    .as_ref()
                    .is_some_and(|v| v.as_str() != "fixture")
                || hints
                    .effort
                    .as_ref()
                    .is_some_and(|v| v.as_str() != "medium")
            {
                return Err(ServiceError::Validation(
                    ironloom_core::validation::ValidationErrors::field(
                        "model",
                        "selection_mismatch",
                    ),
                ));
            }
            self.service.create_conversation(session, request).await
        })
    }
    fn context(
        &self,
        _: AuthenticatedSession,
        _: ConversationId,
    ) -> BoxFuture<'_, Result<ThreadContext, ServiceError>> {
        Box::pin(async {
            self.check()?;
            Ok(ThreadContext {
                name: "fixture".into(),
                cwd: "/configured/project".into(),
                model: self
                    .selected
                    .load(Ordering::SeqCst)
                    .then(|| ActorId::new("selected").unwrap()),
                provider: self
                    .selected
                    .load(Ordering::SeqCst)
                    .then(|| ActorId::new("fixture").unwrap()),
                effort: self
                    .selected
                    .load(Ordering::SeqCst)
                    .then(|| ActorId::new("medium").unwrap()),
                created_at_ms: Counter::new(1),
                approval_policy: json!("on-request"),
                sandbox: json!({"type":"readOnly"}),
            })
        })
    }
    fn replay(
        &self,
        _: AuthenticatedSession,
        key: CommandId,
        fingerprint: String,
    ) -> BoxFuture<'_, Result<Option<Command>, ServiceError>> {
        Box::pin(async move {
            self.check()?;
            self.saved
                .lock()
                .unwrap()
                .get(key.as_str())
                .map(|(hash, command)| {
                    if hash == &fingerprint {
                        Ok(command.clone())
                    } else {
                        Err(ServiceError::Conflict)
                    }
                })
                .transpose()
        })
    }
    fn prepare(
        &self,
        session: AuthenticatedSession,
        fingerprint: String,
        candidate: Command,
    ) -> BoxFuture<'_, Result<Command, ServiceError>> {
        Box::pin(async move {
            if let Some(command) = self
                .replay(session, candidate.command_id.clone(), fingerprint.clone())
                .await?
            {
                return Ok(command);
            }
            self.saved.lock().unwrap().insert(
                candidate.command_id.as_str().into(),
                (fingerprint, candidate.clone()),
            );
            Ok(candidate)
        })
    }
}
#[derive(Default)]
pub struct Store {
    pub view: Mutex<Option<View>>,
    pub messages: Mutex<Vec<Value>>,
    pub changed: Notify,
}
impl ViewStore for Store {
    fn watch(&self, view: View) -> BoxFuture<'_, Result<(), RelayError>> {
        Box::pin(async move {
            *self.view.lock().unwrap() = Some(view);
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
        after: View,
        messages: Vec<Value>,
        _: Option<Vec<Value>>,
    ) -> BoxFuture<'_, Result<(), RelayError>> {
        Box::pin(async move {
            let mut current = self.view.lock().unwrap();
            let current = current.as_mut().ok_or(RelayError::Protocol)?;
            assert_eq!(current.cursor, view.cursor);
            assert!(after.cursor.sequence >= current.cursor.sequence);
            *current = after;
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
