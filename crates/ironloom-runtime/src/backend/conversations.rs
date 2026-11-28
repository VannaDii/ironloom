//! Conversation state and history use the same durable authority for web and native callers.
use super::*;
use ironloom_storage::postgres::{HistoryWindow, SessionWindow};

const CONVERSATION_KIND: &str = "conversation";
const MAX_REPLAY_ROWS: i64 = 1000;
const SUBSCRIPTION_BUFFER: usize = 64;
const EVENT_POLL_INTERVAL: std::time::Duration = std::time::Duration::from_millis(150);
impl FactoryBackend {
    /// Reads bounded persisted events after the cursor, rechecking current service/resource grants.
    /// This is a read operation: it never dispatches, resumes or cancels background work.
    pub async fn replay(
        &self,
        session: AuthenticatedSession,
        cursor: ReplayCursor,
    ) -> Result<Vec<ServiceEvent>, ServiceError> {
        let snapshot = self
            .snapshot(session, cursor.conversation_id.clone())
            .await?;
        if cursor.sequence > snapshot.cursor.sequence {
            return Err(ServiceError::Conflict);
        }
        let rows = self
            .store
            .events(
                &cursor.conversation_id,
                cursor.sequence.get(),
                MAX_REPLAY_ROWS,
            )
            .await
            .map_err(database)?;
        let mut events = Vec::with_capacity(rows.len());
        let mut last = cursor.sequence.get();
        for row in rows {
            let event: ServiceEvent = read(row)?;
            if event.cursor.conversation_id != cursor.conversation_id
                || event.project_id != snapshot.session.project_id
            {
                return Err(ServiceError::Unavailable);
            }
            if Some(event.cursor.sequence.get()) != last.checked_add(1) {
                return Err(ServiceError::ResyncRequired);
            }
            last = event.cursor.sequence.get();
            events.push(event);
        }
        Ok(events)
    }
    /// Bridges replay into live delivery by following the same durable log continuously.
    /// There is no volatile subscription boundary where a committed event can be lost.
    /// Slow readers receive resync-required before closure; dropping a reader never cancels work.
    pub async fn subscribe(
        &self,
        session: AuthenticatedSession,
        after: ReplayCursor,
    ) -> Result<EventSubscription, ServiceError> {
        let snapshot = self
            .snapshot(session.clone(), after.conversation_id.clone())
            .await?;
        if after.sequence > snapshot.cursor.sequence {
            return Err(ServiceError::Conflict);
        }
        let (sender, events) = tokio::sync::mpsc::channel(SUBSCRIPTION_BUFFER);
        let service = self.clone();
        let mut shutdown = self.reader_shutdown.subscribe();
        tokio::spawn(async move {
            let mut cursor = after;
            loop {
                if *shutdown.borrow() {
                    return;
                }
                let page = match service.replay(session.clone(), cursor.clone()).await {
                    Ok(page) => page,
                    Err(error) => {
                        let _ = sender.try_send(Err(error));
                        return;
                    }
                };
                for event in page {
                    // Reserve one slot for an explicit terminal transport error.
                    if sender.capacity() < 2 {
                        let _ = sender.try_send(Err(ServiceError::ResyncRequired));
                        return;
                    }
                    cursor = event.cursor.clone();
                    if sender.try_send(Ok(event)).is_err() {
                        return;
                    }
                }
                tokio::select! {
                    _=sender.closed()=>return,
                    _=shutdown.changed()=>return,
                    _=tokio::time::sleep(EVENT_POLL_INTERVAL)=>{},
                }
            }
        });
        Ok(EventSubscription { events })
    }
    /// Lists only currently authorized sessions in the explicitly selected ordering.
    /// Filters apply to current persisted provider/source bindings; no adapter-side history exists.
    pub async fn sessions(
        &self,
        session: AuthenticatedSession,
        query: SessionQuery,
    ) -> Result<Vec<SessionSummary>, ServiceError> {
        self.authenticated(&session).await?;
        if let Some(after) = &query.after {
            self.snapshot(session.clone(), after.clone()).await?;
        }
        let mut after = query.after.clone();
        let mut result = Vec::new();
        loop {
            let rows = self
                .store
                .session_rows(SessionWindow {
                    after: after.as_ref(),
                    limit: MAX_SESSION_PAGE as u32,
                    archived: query.archived,
                    created_order: query.order == SessionOrder::CreatedAt,
                    provider: query.provider.as_ref(),
                    source: query.source.as_ref(),
                })
                .await
                .map_err(database)?;
            let exhausted = rows.len() < MAX_SESSION_PAGE as usize;
            for row in rows {
                let snapshot: ConversationSnapshot = read(row)?;
                after = Some(snapshot.session.conversation_id.clone());
                match self
                    .snapshot(session.clone(), snapshot.session.conversation_id.clone())
                    .await
                {
                    Ok(current) => result.push(current.session.clone()),
                    Err(ServiceError::Authentication(AuthenticationError::Forbidden)) => {}
                    Err(error) => return Err(error),
                }
                if result.len() == query.limit.get() as usize {
                    return Ok(result);
                }
            }
            if exhausted {
                return Ok(result);
            }
        }
    }
    /// Creates an event-free empty conversation with a durable actor/key outcome.
    /// A failed grant publication leaves its durable intent for the identical retry.
    pub async fn create_conversation(
        &self,
        session: AuthenticatedSession,
        request: CreateConversation,
    ) -> Result<ConversationSnapshot, ServiceError> {
        self.authenticated(&session).await?;
        self.require(
            &session.operator_id,
            self.resource(Some(&request.project_id)).await?,
            Permission::Operate,
        )
        .await?;
        let operation = self
            .store
            .begin(
                &session.operator_id,
                &request.command_id,
                &value(&request)?,
                &actor(&format!("project:{}", request.project_id.as_str()))?,
            )
            .await
            .map_err(database)?;
        let snapshot = match operation {
            Operation::Replay(outcome) => read(outcome)?,
            Operation::Write(mut batch) => {
                let conversation = ConversationId::new(uuid::Uuid::new_v4().to_string())
                    .map_err(|_| ServiceError::Unavailable)?;
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map_err(|_| ServiceError::Unavailable)?
                    .as_millis();
                let snapshot = ConversationSnapshot::new(ConversationSnapshotData {
                    session: SessionSummary::new(SessionSummaryData {
                        conversation_id: conversation.clone(),
                        active_turn_id: None,
                        project_id: request.project_id.clone(),
                        archived: false,
                        last_human_interaction_ms: Counter::new(
                            now.try_into().map_err(|_| ServiceError::Unavailable)?,
                        ),
                    })
                    .map_err(ServiceError::Validation)?,
                    cursor: ReplayCursor::new(ReplayCursorData {
                        conversation_id: conversation.clone(),
                        sequence: Counter::new(0),
                    })
                    .map_err(ServiceError::Validation)?,
                    revision: Counter::new(1),
                    active_assignment_id: None,
                    pause_requested: None,
                    execution_state: None,
                    plan: None,
                    approval: None,
                    pending_questions: vec![],
                    budget: None,
                })
                .map_err(ServiceError::Validation)?;
                batch
                    .create_conversation(&conversation, &request.project_id)
                    .await
                    .map_err(database)?;
                batch
                    .put(
                        CONVERSATION_KIND,
                        &actor(conversation.as_str())?,
                        Some(&request.project_id),
                        None,
                        None,
                        &value(&snapshot)?,
                    )
                    .await
                    .map_err(database)?;
                batch.grant_intent(&actor(conversation.as_str())?, &serde_json::json!({"kind":"conversation_parent","project":request.project_id,"conversation":conversation})).await.map_err(database)?;
                batch
                    .human_interaction(&request.project_id)
                    .await
                    .map_err(database)?;
                batch.audit(Some(&request.project_id), "create_conversation", &serde_json::json!({"operation":"create_conversation","conversation":conversation})).await.map_err(database)?;
                (*batch)
                    .commit(&value(&snapshot)?)
                    .await
                    .map_err(database)?;
                snapshot
            }
        };
        // The same cross-node resource guard serializes direct retries and outbox recovery.
        self.recover_conversation_grant(&actor(snapshot.session.conversation_id.as_str())?,serde_json::json!({"kind":"conversation_parent","project":snapshot.session.project_id,"conversation":snapshot.session.conversation_id})).await?;
        Ok(snapshot)
    }
    /// Returns a consistent persisted snapshot after current resource authorization.
    /// Project storage availability never hides durable metadata.
    pub async fn snapshot(
        &self,
        session: AuthenticatedSession,
        conversation: ConversationId,
    ) -> Result<ConversationSnapshot, ServiceError> {
        self.authenticated(&session).await?;
        let record = self
            .store
            .get(CONVERSATION_KIND, &actor(conversation.as_str())?)
            .await
            .map_err(database)?
            .ok_or_else(forbidden)?;
        let snapshot = stored_snapshot(record, &conversation)?;
        self.require(
            &session.operator_id,
            Resource::new(ResourceData {
                kind: ResourceKind::Conversation,
                id: actor(conversation.as_str())?,
                project_id: Some(snapshot.session.project_id.clone()),
            })
            .map_err(ServiceError::Validation)?,
            Permission::View,
        )
        .await?;
        Ok(snapshot)
    }
    /// Returns stable versioned items at an authorized watermark in either traversal direction.
    pub async fn history(
        &self,
        session: AuthenticatedSession,
        query: HistoryQuery,
    ) -> Result<HistoryPage, ServiceError> {
        let snapshot = self
            .snapshot(session, query.as_of.conversation_id.clone())
            .await?;
        if query.as_of.sequence > snapshot.cursor.sequence {
            return Err(ServiceError::Conflict);
        }
        let forward = query.direction == HistoryDirection::Forward;
        let rows = self
            .store
            .history(HistoryWindow {
                conversation: &query.as_of.conversation_id,
                as_of: query.as_of.sequence.get(),
                turn: query.turn_id.as_ref(),
                anchor: if forward {
                    query.after.as_ref()
                } else {
                    query.before.as_ref()
                },
                forward,
                limit: query.limit.get() as u32 + 1,
            })
            .await
            .map_err(database)?;
        let mut items: Vec<HistoryItem> = rows.into_iter().map(read).collect::<Result<_, _>>()?;
        let more = items.len() > query.limit.get() as usize;
        if more {
            if forward {
                items.pop();
            } else {
                items.remove(0);
            }
        }
        let next_before = if more && !forward {
            items.first().map(|item| item.item_id.clone())
        } else {
            None
        };
        let next_after = if more && forward {
            items.last().map(|item| item.item_id.clone())
        } else {
            None
        };
        HistoryPage::new(HistoryPageData {
            as_of: query.as_of.clone(),
            direction: query.direction.clone(),
            turn_id: query.turn_id.clone(),
            items,
            next_before,
            next_after,
        })
        .map_err(|_| ServiceError::Unavailable)
    }
}

/// Validates the durable header and owning payload before any conversation operation.
pub(super) fn stored_snapshot(
    record: Record,
    conversation: &ConversationId,
) -> Result<ConversationSnapshot, ServiceError> {
    let snapshot: ConversationSnapshot = read(record.body)?;
    if &snapshot.session.conversation_id != conversation
        || Some(&snapshot.session.project_id) != record.project.as_ref()
        || snapshot.revision.get() != record.revision
        || record.assignment.is_some()
    {
        return Err(ServiceError::Unavailable);
    }
    Ok(snapshot)
}
