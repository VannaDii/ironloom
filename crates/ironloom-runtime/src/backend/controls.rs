//! Persisted steering/pause/resume/cancel intent. A request is never a fabricated stop observation.
use super::*;
use assignments::{stored_run, stored_turn};
use ironloom_queue::factory::ExecutionState;

impl FactoryBackend {
    /// Resolves the original expected turn before replay, then checks current mutable preconditions.
    pub(super) async fn steer_command(
        &self,
        session: AuthenticatedSession,
        command: Command,
        request: SteeringInput,
    ) -> Result<CommandReceipt, ServiceError> {
        self.authenticated(&session).await?;
        let turn = stored_turn(
            self.store
                .get("turn", &actor(request.expected_turn_id.as_str())?)
                .await
                .map_err(database)?
                .ok_or_else(forbidden)?,
            &request.expected_turn_id,
        )?;
        if turn.project_id != command.project_id || turn.conversation_id != request.conversation_id
        {
            return Err(forbidden());
        }
        self.assignment_command(session, command, turn.assignment_id, Some(request))
            .await
    }
    /// Assignment controls require actual assignment authority plus source-view access for the
    /// conversation revision/cursor contract. They do not grant permission to submit human input.
    pub(super) async fn control_command(
        &self,
        session: AuthenticatedSession,
        command: Command,
        request: ControlCommand,
    ) -> Result<CommandReceipt, ServiceError> {
        self.assignment_command(session, command, request.assignment_id.clone(), None)
            .await
    }
    async fn assignment_command(
        &self,
        session: AuthenticatedSession,
        command: Command,
        assignment: AssignmentId,
        steer: Option<SteeringInput>,
    ) -> Result<CommandReceipt, ServiceError> {
        self.authenticated(&session).await?;
        let run = stored_run(
            self.store
                .get("assignment", &actor(assignment.as_str())?)
                .await
                .map_err(database)?
                .ok_or_else(forbidden)?,
            &assignment,
        )?;
        if run.project_id != command.project_id {
            return Err(forbidden());
        }
        let initial = self
            .snapshot(session.clone(), run.conversation_id.clone())
            .await?;
        if initial.session.project_id != command.project_id {
            return Err(forbidden());
        }
        let resource = Resource::new(ResourceData {
            kind: ResourceKind::Assignment,
            id: actor(assignment.as_str())?,
            project_id: Some(command.project_id.clone()),
        })
        .map_err(ServiceError::Validation)?;
        let conversation_resource = Resource::new(ResourceData {
            kind: ResourceKind::Conversation,
            id: actor(run.conversation_id.as_str())?,
            project_id: Some(command.project_id.clone()),
        })
        .map_err(ServiceError::Validation)?;
        self.require(&session.operator_id, resource.clone(), Permission::Operate)
            .await?;
        self.require(
            &session.operator_id,
            conversation_resource.clone(),
            if steer.is_some() {
                Permission::Operate
            } else {
                Permission::View
            },
        )
        .await?;
        let operation = self
            .store
            .begin(
                &session.operator_id,
                &command.command_id,
                &value(&command)?,
                &actor(&format!("conversation:{}", run.conversation_id.as_str()))?,
            )
            .await
            .map_err(database)?;
        let mut batch = match operation {
            Operation::Replay(outcome) => {
                self.authenticated(&session).await?;
                self.require(&session.operator_id, resource, Permission::Operate)
                    .await?;
                self.require(
                    &session.operator_id,
                    conversation_resource,
                    if steer.is_some() {
                        Permission::Operate
                    } else {
                        Permission::View
                    },
                )
                .await?;
                let mut receipt = (*read::<CommandReceipt>(outcome)?).clone();
                if receipt.command_id != command.command_id
                    || receipt
                        .cursor
                        .as_ref()
                        .is_none_or(|cursor| cursor.conversation_id != run.conversation_id)
                {
                    return Err(ServiceError::Unavailable);
                }
                receipt.disposition = CommandDisposition::Replayed;
                return CommandReceipt::new(receipt).map_err(ServiceError::Validation);
            }
            Operation::Write(batch) => batch,
        };
        let snapshot = conversations::stored_snapshot(
            batch
                .get("conversation", &actor(run.conversation_id.as_str())?)
                .await
                .map_err(database)?
                .ok_or_else(forbidden)?,
            &run.conversation_id,
        )?;
        let mut run = stored_run(
            batch
                .get("assignment", &actor(assignment.as_str())?)
                .await
                .map_err(database)?
                .ok_or_else(forbidden)?,
            &assignment,
        )?;
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
        self.require(
            &session.operator_id,
            conversation_resource,
            if steer.is_some() {
                Permission::Operate
            } else {
                Permission::View
            },
        )
        .await?;
        if snapshot.revision != command.expected_revision
            || snapshot.active_assignment_id.as_ref() != Some(&assignment)
            || snapshot.session.active_turn_id.as_ref() != Some(&run.turn_id)
            || matches!(
                run.state,
                ExecutionState::Completed | ExecutionState::Terminated | ExecutionState::Failed
            )
        {
            return Err(ServiceError::Conflict);
        }
        let mut next = (*snapshot).clone();
        let history = if let Some(steer) = steer {
            if steer.expected_turn_id != run.turn_id
                || run.state == ExecutionState::CancellationRequested
            {
                return Err(ServiceError::Conflict);
            }
            let item = ItemId::new(uuid::Uuid::new_v4().to_string())
                .map_err(|_| ServiceError::Unavailable)?;
            Some(
                HistoryItem::new(HistoryItemData {
                    conversation_id: run.conversation_id.clone(),
                    turn_id: run.turn_id.clone(),
                    item_id: item,
                    message: ironloom_models::factory::InferenceMessage::new(
                        ironloom_models::factory::InferenceMessageData {
                            role: ironloom_models::factory::MessageRole::User,
                            text: Some(steer.text.clone()),
                            tool_calls: vec![],
                            tool_result: None,
                        },
                    )
                    .map_err(ServiceError::Validation)?,
                })
                .map_err(ServiceError::Validation)?,
            )
        } else {
            let CommandAction::Control(control) = &command.action else {
                return Err(ServiceError::Unavailable);
            };
            match control.action {
                ControlAction::Cancel => {
                    batch
                        .set_dispatch_control(&assignment, &command.project_id, false, true)
                        .await
                        .map_err(database)?;
                    run.pause_requested = false;
                    run.state = ExecutionState::CancellationRequested;
                }
                ControlAction::Pause => {
                    let idle = batch
                        .set_dispatch_control(&assignment, &command.project_id, true, false)
                        .await
                        .map_err(database)?;
                    run.pause_requested = !idle;
                    if idle {
                        run.state = ExecutionState::Paused;
                    }
                }
                ControlAction::Resume => {
                    if run.state != ExecutionState::Paused && !run.pause_requested {
                        return Err(ServiceError::Conflict);
                    }
                    if !snapshot.pending_questions.is_empty()
                        || snapshot.plan.as_ref().is_some_and(|plan| {
                            snapshot.approval.as_ref().is_none_or(|approval| {
                                approval.plan_id != plan.plan_id
                                    || approval.revision != plan.revision
                                    || approval.content_hash != plan.content_hash
                            })
                        })
                    {
                        return Err(ServiceError::ApprovalRequired);
                    }
                    batch
                        .set_dispatch_control(&assignment, &command.project_id, false, false)
                        .await
                        .map_err(database)?;
                    run.pause_requested = false;
                    if run.state == ExecutionState::Paused {
                        run.state = ExecutionState::Queued;
                    }
                }
            }
            run.control_command = Some(command.command_id.clone());
            run.control_operator = Some(session.operator_id.clone());
            let previous = run.revision;
            run.revision = Counter::new(
                previous
                    .get()
                    .checked_add(1)
                    .ok_or(ServiceError::Conflict)?,
            );
            batch
                .put(
                    "assignment",
                    &actor(assignment.as_str())?,
                    Some(&run.project_id),
                    Some(&actor(assignment.as_str())?),
                    Some(previous.get()),
                    &value(&run)?,
                )
                .await
                .map_err(database)?;
            self.persist_turn_state(&mut batch, &run).await?;
            next.execution_state = Some(run.state.clone());
            next.pause_requested = Some(run.pause_requested);
            None
        };
        batch.audit(Some(&command.project_id),if history.is_some(){"assignment.steered"}else{"assignment.control_requested"},&serde_json::json!({"assignment":assignment,"turn":run.turn_id,"state":run.state,"pause_requested":run.pause_requested})).await.map_err(database)?;
        self.commit_conversation_command(batch, &command, &snapshot, next, history)
            .await
    }
}
