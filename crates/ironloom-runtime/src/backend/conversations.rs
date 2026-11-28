//! Conversation state and history use the same durable authority for web and native callers.
use super::*;
use ironloom_policy::live::Relationship;
use ironloom_storage::postgres::{HistoryWindow, SessionWindow};

const CONVERSATION_KIND: &str = "conversation";
impl FactoryBackend {
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
        // This adds only the immutable parent relationship, never a private-project self-grant.
        self.authority
            .write(
                vec![
                    Relationship::new(
                        format!("project:{}", snapshot.session.project_id.as_str()),
                        "project",
                        format!("conversation:{}", snapshot.session.conversation_id.as_str()),
                    )
                    .map_err(|_| ServiceError::Unavailable)?,
                ],
                vec![],
            )
            .await
            .map_err(|_| ServiceError::Unavailable)?;
        self.store
            .grant_applied(&actor(snapshot.session.conversation_id.as_str())?)
            .await
            .map_err(database)?;
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
        let snapshot: ConversationSnapshot = read(record.body)?;
        if snapshot.session.conversation_id != conversation
            || Some(&snapshot.session.project_id) != record.project.as_ref()
            || snapshot.revision.get() != record.revision
        {
            return Err(ServiceError::Unavailable);
        }
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
