//! Authenticated durable commands. Replay is checked before mutable execution preconditions.
use super::*;
use ironloom_observability::budget::BudgetError;

impl FactoryBackend {
    /// Executes supported typed commands under their existing resource/actor identities.
    /// An unavailable unfinished operation never dispatches work or fabricates a success receipt.
    pub async fn command(
        &self,
        session: AuthenticatedSession,
        command: Command,
    ) -> Result<CommandReceipt, ServiceError> {
        match &command.action {
            CommandAction::Lesson(_) => self.lesson_command(session, command).await,
            CommandAction::Budget(request) => {
                self.budget_command(session, command.clone(), request.clone())
                    .await
            }
            _ => Err(ServiceError::Unavailable),
        }
    }
    async fn budget_command(
        &self,
        session: AuthenticatedSession,
        command: Command,
        request: BudgetCommand,
    ) -> Result<CommandReceipt, ServiceError> {
        let current = self
            .snapshot(session.clone(), request.conversation_id.clone())
            .await?;
        if command.project_id != current.session.project_id {
            return Err(forbidden());
        }
        let resource = Resource::new(ResourceData {
            kind: ResourceKind::Conversation,
            id: actor(request.conversation_id.as_str())?,
            project_id: Some(command.project_id.clone()),
        })
        .map_err(ServiceError::Validation)?;
        self.require(&session.operator_id, resource.clone(), Permission::Operate)
            .await?;
        let scope = actor(&format!(
            "conversation:{}",
            request.conversation_id.as_str()
        ))?;
        let operation = self
            .store
            .begin(
                &session.operator_id,
                &command.command_id,
                &value(&command)?,
                &scope,
            )
            .await
            .map_err(database)?;
        let mut batch = match operation {
            Operation::Replay(outcome) => {
                self.authenticated(&session).await?;
                self.require(&session.operator_id, resource.clone(), Permission::Operate)
                    .await?;
                let mut receipt = (*read::<CommandReceipt>(outcome)?).clone();
                if receipt.command_id != command.command_id
                    || receipt
                        .cursor
                        .as_ref()
                        .is_none_or(|cursor| cursor.conversation_id != request.conversation_id)
                {
                    return Err(ServiceError::Unavailable);
                }
                receipt.disposition = CommandDisposition::Replayed;
                return CommandReceipt::new(receipt).map_err(ServiceError::Validation);
            }
            Operation::Write(batch) => batch,
        };
        let key = actor(request.conversation_id.as_str())?;
        let record = batch
            .get("conversation", &key)
            .await
            .map_err(database)?
            .ok_or_else(forbidden)?;
        let snapshot = conversations::stored_snapshot(record, &request.conversation_id)?;
        if snapshot.session.project_id != command.project_id {
            return Err(forbidden());
        }
        if !batch
            .session_active(&session.session_id)
            .await
            .map_err(database)?
        {
            return Err(ServiceError::Authentication(
                AuthenticationError::Unauthenticated,
            ));
        }
        self.require(&session.operator_id, resource, Permission::Operate)
            .await?;
        if snapshot.revision != command.expected_revision {
            return Err(ServiceError::Conflict);
        }
        let budget =
            ironloom_observability::budget::edit(snapshot.budget.as_ref(), &request.budget)
                .map_err(|error| match error {
                    BudgetError::Conflict => ServiceError::Conflict,
                    BudgetError::Invalid(mut errors) => {
                        for error in &mut errors.fields {
                            error.field = format!("action.data.budget.{}", error.field);
                        }
                        ServiceError::Validation(errors)
                    }
                })?;
        let mut draft = (*snapshot).clone();
        draft.revision = Counter::new(
            snapshot
                .revision
                .get()
                .checked_add(1)
                .ok_or(ServiceError::Conflict)?,
        );
        draft.budget = Some(budget);
        let mut summary = (*draft.session).clone();
        summary.last_human_interaction_ms = Counter::new(
            batch
                .conversation_interaction(&request.conversation_id)
                .await
                .map_err(database)?,
        );
        draft.session = SessionSummary::new(summary).map_err(ServiceError::Validation)?;
        batch
            .human_interaction(&command.project_id)
            .await
            .map_err(database)?;
        draft.cursor = ReplayCursor::new(ReplayCursorData {
            conversation_id: request.conversation_id.clone(),
            sequence: Counter::new(
                batch
                    .next_sequence(&request.conversation_id)
                    .await
                    .map_err(database)?,
            ),
        })
        .map_err(ServiceError::Validation)?;
        let next = ConversationSnapshot::new(draft).map_err(ServiceError::Validation)?;
        batch
            .put(
                "conversation",
                &key,
                Some(&command.project_id),
                None,
                Some(snapshot.revision.get()),
                &value(&next)?,
            )
            .await
            .map_err(database)?;
        let event = ServiceEvent::new(ServiceEventData {
            cursor: next.cursor.clone(),
            command_id: command.command_id.clone(),
            project_id: command.project_id.clone(),
            event: None,
            snapshot: Some(next.clone()),
        })
        .map_err(ServiceError::Validation)?;
        batch
            .append_event(
                &request.conversation_id,
                next.cursor.sequence.get(),
                &value(&event)?,
            )
            .await
            .map_err(database)?;
        batch.audit(Some(&command.project_id),"budget.changed",&serde_json::json!({"conversation":request.conversation_id,"revision":next.budget.as_ref().map(|budget|budget.revision)})).await.map_err(database)?;
        let receipt = CommandReceipt::new(CommandReceiptData {
            command_id: command.command_id.clone(),
            disposition: CommandDisposition::Accepted,
            cursor: Some(next.cursor.clone()),
        })
        .map_err(ServiceError::Validation)?;
        (*batch).commit(&value(&receipt)?).await.map_err(database)?;
        Ok(receipt)
    }
}
