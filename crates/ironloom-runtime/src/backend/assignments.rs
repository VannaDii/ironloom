//! Durable assignment orchestration records. Role instructions own workflow judgment.
use super::*;
use ironloom_config::factory::{FactorySetup, ModelProfileConfiguration, RoleConfiguration};
use ironloom_queue::factory::ExecutionState;

/// Runtime's persisted assignment, using existing shared identities/configuration/state models.
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct AssignmentRun {
    /// Stable assignment/worktree ownership scope.
    pub assignment_id: AssignmentId,
    /// Immutable actual project.
    pub project_id: ProjectId,
    /// Immutable conversation.
    pub conversation_id: ConversationId,
    /// Current service-assigned turn.
    pub turn_id: TurnId,
    /// Authorizing human; browser disconnection does not revoke background ownership.
    pub operator_id: OperatorId,
    /// Tools and workspace stay on this enrolled node.
    pub owner_node: NodeId,
    /// Durable optimistic assignment revision.
    pub revision: Counter,
    /// Actual execution state, separate from requested pause/cancellation.
    pub state: ExecutionState,
    /// Pending pause, acknowledged only at a controllable boundary.
    pub pause_requested: bool,
    /// Last authorized human control causing a pending boundary change.
    pub control_command: Option<CommandId>,
    /// Actual controller, distinct from the assignment's originating human.
    pub control_operator: Option<OperatorId>,
    /// Explicit configured role routing; never a substituted model/engine/billing choice.
    pub next_roles: Vec<ActorId>,
    /// Human-selected role configuration captured for the assignment.
    pub roles: Vec<RoleConfiguration>,
    /// Explicit model configurations, rechecked against current configuration before dispatch.
    pub models: Vec<ModelProfileConfiguration>,
    /// Explicit lesson handling and delivery permissions; actual grants are rechecked separately.
    pub setup: FactorySetup,
}
/// Stable source turn binding and actual lifecycle timestamps, independent from browser state.
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct TurnRecord {
    /// Immutable source turn identity.
    pub turn_id: TurnId,
    /// Immutable source conversation.
    pub conversation_id: ConversationId,
    /// Immutable project scope.
    pub project_id: ProjectId,
    /// Owning assignment.
    pub assignment_id: AssignmentId,
    /// Persisted record revision.
    pub revision: Counter,
    /// Actual assignment lifecycle, not EOF/disconnect.
    pub state: ExecutionState,
    /// Absent until execution actually starts.
    pub started_at_ms: Option<Counter>,
    /// Absent until terminal execution is recorded.
    pub completed_at_ms: Option<Counter>,
}
impl FactoryBackend {
    /// Returns current copied content and acknowledgment under live assignment-view authority.
    pub async fn instruction_copies(
        &self,
        session: AuthenticatedSession,
        assignment: AssignmentId,
    ) -> Result<Vec<ironloom_process_graph::factory::InstructionCopy>, ServiceError> {
        self.authenticated(&session).await?;
        let run = stored_run(
            self.store
                .get("assignment", &actor(assignment.as_str())?)
                .await
                .map_err(database)?
                .ok_or_else(forbidden)?,
            &assignment,
        )?;
        self.require(
            &session.operator_id,
            Resource::new(ResourceData {
                kind: ResourceKind::Assignment,
                id: actor(assignment.as_str())?,
                project_id: Some(run.project_id.clone()),
            })
            .map_err(ServiceError::Validation)?,
            Permission::View,
        )
        .await?;
        let mut copies = Vec::new();
        let mut after = None;
        loop {
            let rows = self
                .store
                .assignment_records(
                    "instruction_copy",
                    &assignment,
                    after.as_ref(),
                    MAX_SESSION_PAGE as u32,
                )
                .await
                .map_err(database)?;
            let exhausted = rows.len() < MAX_SESSION_PAGE as usize;
            for (id, record) in rows {
                after = Some(id);
                let copy: ironloom_process_graph::factory::InstructionCopy = read(record.body)?;
                if copy.assignment_id != assignment
                    || record.assignment.as_ref() != Some(&assignment)
                    || record.project.as_ref() != Some(&run.project_id)
                {
                    return Err(ServiceError::Unavailable);
                }
                copies.push(copy);
            }
            if exhausted {
                return Ok(copies);
            }
        }
    }
    /// Persists a new turn, original human wording, copied instructions and node-owned queue entry.
    pub(super) async fn input_command(
        &self,
        session: AuthenticatedSession,
        command: Command,
        request: InputCommand,
    ) -> Result<CommandReceipt, ServiceError> {
        let initial = self
            .snapshot(session.clone(), request.conversation_id.clone())
            .await?;
        if initial.session.project_id != command.project_id {
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
        let project_resource = Resource::new(ResourceData {
            kind: ResourceKind::Project,
            id: actor(command.project_id.as_str())?,
            project_id: Some(command.project_id.clone()),
        })
        .map_err(ServiceError::Validation)?;
        self.require(
            &session.operator_id,
            project_resource.clone(),
            Permission::Operate,
        )
        .await?;
        let operation = self
            .store
            .begin(
                &session.operator_id,
                &command.command_id,
                &value(&command)?,
                &actor(&format!(
                    "conversation:{}",
                    request.conversation_id.as_str()
                ))?,
            )
            .await
            .map_err(database)?;
        let mut batch = match operation {
            Operation::Replay(outcome) => {
                self.require(
                    &session.operator_id,
                    project_resource.clone(),
                    Permission::Operate,
                )
                .await?;
                return self
                    .replayed_conversation_command(
                        &session,
                        &command,
                        &request.conversation_id,
                        &resource,
                        outcome,
                    )
                    .await;
            }
            Operation::Write(batch) => batch,
        };
        let global = batch
            .get(CONFIGURATION_KIND, &configuration_key(None)?)
            .await
            .map_err(database)?
            .map(|record| configuration_record(record, None))
            .transpose()?;
        let local = batch
            .get(
                CONFIGURATION_KIND,
                &configuration_key(Some(&command.project_id))?,
            )
            .await
            .map_err(database)?
            .map(|record| configuration_record(record, Some(&command.project_id)))
            .transpose()?;
        let configuration = self
            .effective_configuration(
                &session,
                Some(&command.project_id),
                global.as_ref(),
                local.as_ref(),
                Some(&mut batch),
            )
            .await?;
        let key = actor(request.conversation_id.as_str())?;
        let snapshot = conversations::stored_snapshot(
            batch
                .get("conversation", &key)
                .await
                .map_err(database)?
                .ok_or_else(forbidden)?,
            &request.conversation_id,
        )?;
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
        self.require(&session.operator_id, project_resource, Permission::Operate)
            .await?;
        if snapshot.revision != command.expected_revision
            || snapshot
                .execution_state
                .as_ref()
                .is_some_and(|state| !terminal(state))
        {
            return Err(ServiceError::Conflict);
        }
        if !configuration.execution_ready {
            return Err(ServiceError::Unavailable);
        }
        let role = ironloom_supervisor::routing::concept_role(&configuration.roles)
            .ok_or_else(|| {
                ServiceError::Validation(validation::ValidationErrors::field(
                    "roles",
                    "concept_role_unavailable",
                ))
            })?
            .role_id
            .clone();
        let owner = batch
            .project_node(&command.project_id)
            .await
            .map_err(database)?;
        let assignment = AssignmentId::new(uuid::Uuid::new_v4().to_string())
            .map_err(|_| ServiceError::Unavailable)?;
        let turn =
            TurnId::new(uuid::Uuid::new_v4().to_string()).map_err(|_| ServiceError::Unavailable)?;
        let item =
            ItemId::new(uuid::Uuid::new_v4().to_string()).map_err(|_| ServiceError::Unavailable)?;
        let run = AssignmentRun {
            assignment_id: assignment.clone(),
            project_id: command.project_id.clone(),
            conversation_id: request.conversation_id.clone(),
            turn_id: turn.clone(),
            operator_id: session.operator_id.clone(),
            owner_node: owner.clone(),
            revision: Counter::new(1),
            state: ExecutionState::Queued,
            pause_requested: false,
            control_command: None,
            control_operator: None,
            next_roles: vec![role],
            roles: configuration.roles.clone(),
            models: configuration.models.clone(),
            setup: configuration
                .setup
                .clone()
                .ok_or(ServiceError::Unavailable)?,
        };
        let assignment_key = actor(assignment.as_str())?;
        batch
            .put(
                "assignment",
                &assignment_key,
                Some(&command.project_id),
                Some(&assignment_key),
                None,
                &value(&run)?,
            )
            .await
            .map_err(database)?;
        let turn_record = TurnRecord {
            turn_id: turn.clone(),
            conversation_id: request.conversation_id.clone(),
            project_id: command.project_id.clone(),
            assignment_id: assignment.clone(),
            revision: Counter::new(1),
            state: ExecutionState::Queued,
            started_at_ms: None,
            completed_at_ms: None,
        };
        batch
            .put(
                "turn",
                &actor(turn.as_str())?,
                Some(&command.project_id),
                Some(&assignment_key),
                None,
                &value(&turn_record)?,
            )
            .await
            .map_err(database)?;
        self.copy_assignment_instructions(&mut batch, &run).await?;
        batch.grant_intent(&assignment_key,&serde_json::json!({"kind":"assignment_parent","project":command.project_id,"assignment":assignment})).await.map_err(database)?;
        batch.enqueue_dispatch(&assignment,&command.project_id,&owner,&serde_json::json!({"assignment_id":assignment,"conversation_id":request.conversation_id})).await.map_err(database)?;
        let mut next = (*snapshot).clone();
        let mut summary = (*next.session).clone();
        summary.active_turn_id = Some(turn.clone());
        next.session = SessionSummary::new(summary).map_err(ServiceError::Validation)?;
        next.active_assignment_id = Some(assignment.clone());
        next.pause_requested = Some(false);
        next.execution_state = Some(ExecutionState::Queued);
        next.plan = None;
        next.approval = None;
        next.pending_questions.clear();
        let receipt = self
            .commit_conversation_command(
                batch,
                &command,
                &snapshot,
                next,
                Some(
                    HistoryItem::new(HistoryItemData {
                        conversation_id: request.conversation_id.clone(),
                        turn_id: turn,
                        item_id: item,
                        message: ironloom_models::factory::InferenceMessage::new(
                            ironloom_models::factory::InferenceMessageData {
                                role: ironloom_models::factory::MessageRole::User,
                                text: Some(request.text.clone()),
                                tool_calls: vec![],
                                tool_result: None,
                            },
                        )
                        .map_err(ServiceError::Validation)?,
                    })
                    .map_err(ServiceError::Validation)?,
                ),
            )
            .await?;
        self.recover_assignment_grant(&assignment_key,serde_json::json!({"kind":"assignment_parent","project":command.project_id,"assignment":assignment})).await?;
        Ok(receipt)
    }
    /// Records lifecycle facts at controllable boundaries, retaining stable terminal timestamps.
    pub(super) async fn persist_turn_state(
        &self,
        batch: &mut Batch,
        run: &AssignmentRun,
    ) -> Result<(), ServiceError> {
        let record = batch
            .get("turn", &actor(run.turn_id.as_str())?)
            .await
            .map_err(database)?
            .ok_or(ServiceError::Unavailable)?;
        let mut turn = stored_turn(record, &run.turn_id)?;
        if turn.assignment_id != run.assignment_id
            || turn.project_id != run.project_id
            || turn.conversation_id != run.conversation_id
        {
            return Err(ServiceError::Unavailable);
        }
        if terminal(&turn.state) && turn.state != run.state {
            return Err(ServiceError::Conflict);
        }
        if turn.state == run.state {
            return Ok(());
        }
        let previous = turn.revision;
        turn.revision = Counter::new(
            previous
                .get()
                .checked_add(1)
                .ok_or(ServiceError::Conflict)?,
        );
        turn.state = run.state.clone();
        if run.state == ExecutionState::Running && turn.started_at_ms.is_none() {
            turn.started_at_ms = Some(Counter::new(
                batch.database_time_ms().await.map_err(database)?,
            ));
        }
        if terminal(&run.state) && turn.completed_at_ms.is_none() {
            turn.completed_at_ms = Some(Counter::new(
                batch.database_time_ms().await.map_err(database)?,
            ));
        }
        batch
            .put(
                "turn",
                &actor(run.turn_id.as_str())?,
                Some(&run.project_id),
                Some(&actor(run.assignment_id.as_str())?),
                Some(previous.get()),
                &value(&turn)?,
            )
            .await
            .map_err(database)?;
        Ok(())
    }
    async fn copy_assignment_instructions(
        &self,
        batch: &mut Batch,
        run: &AssignmentRun,
    ) -> Result<(), ServiceError> {
        for role in run.roles.iter().filter(|role| role.enabled) {
            let stored = batch
                .get("instruction", &actor(role.instructions_id.as_str())?)
                .await
                .map_err(database)?;
            let template = if let Some(record) = stored {
                let template: InstructionTemplate = read(record.body)?;
                if template.revision.get() != record.revision
                    || template.project_id != record.project
                    || template.instruction_id != role.instructions_id
                    || record.assignment.is_some()
                {
                    return Err(ServiceError::Unavailable);
                }
                if template
                    .project_id
                    .as_ref()
                    .is_some_and(|project| project != &run.project_id)
                {
                    return Err(forbidden());
                }
                template
            } else {
                let standard = ironloom_config::team::standard_team()
                    .into_iter()
                    .find(|standard| standard.instruction_id == role.instructions_id)
                    .ok_or_else(|| {
                        ServiceError::Validation(validation::ValidationErrors::field(
                            "roles.instructions_id",
                            "instruction_required",
                        ))
                    })?;
                InstructionTemplate::new(InstructionTemplateData {
                    instruction_id: standard.instruction_id,
                    project_id: None,
                    revision: Counter::new(1),
                    content: standard.instructions.into(),
                })
                .map_err(ServiceError::Validation)?
            };
            let copy = ironloom_process_graph::factory::InstructionCopy::new(
                ironloom_process_graph::factory::InstructionCopyData {
                    instruction_id: template.instruction_id.clone(),
                    assignment_id: run.assignment_id.clone(),
                    revision: Counter::new(1),
                    acknowledged_revision: Counter::new(0),
                    content: template.content.clone(),
                },
            )
            .map_err(ServiceError::Validation)?;
            let copy_id = actor(&format!(
                "{}:{}",
                run.assignment_id.as_str(),
                role.instructions_id.as_str()
            ))?;
            // Multiple configured roles may explicitly share one template; retain one copy.
            if batch
                .get("instruction_copy", &copy_id)
                .await
                .map_err(database)?
                .is_none()
            {
                batch
                    .put(
                        "instruction_copy",
                        &copy_id,
                        Some(&run.project_id),
                        Some(&actor(run.assignment_id.as_str())?),
                        None,
                        &value(&copy)?,
                    )
                    .await
                    .map_err(database)?;
                batch.audit(Some(&run.project_id),"instructions.copied",&serde_json::json!({"assignment":run.assignment_id,"instruction":template.instruction_id,"source_revision":template.revision,"copy_revision":copy.revision})).await.map_err(database)?;
            }
        }
        Ok(())
    }
}
fn terminal(state: &ExecutionState) -> bool {
    matches!(
        state,
        ExecutionState::Completed | ExecutionState::Failed | ExecutionState::Terminated
    )
}

/// Validates immutable assignment scope and configuration before recovery/dispatch.
pub(super) fn stored_run(record: Record, id: &AssignmentId) -> Result<AssignmentRun, ServiceError> {
    let run: AssignmentRun =
        serde_json::from_value(record.body).map_err(|_| ServiceError::Unavailable)?;
    if &run.assignment_id != id
        || record.project.as_ref() != Some(&run.project_id)
        || record.assignment.as_ref() != Some(id)
        || run.revision.get() == 0
        || run.revision.get() != record.revision
    {
        return Err(ServiceError::Unavailable);
    }
    let roles = run
        .roles
        .iter()
        .map(|role| &role.role_id)
        .collect::<BTreeSet<_>>();
    let models = run
        .models
        .iter()
        .map(|model| &model.profile_id)
        .collect::<BTreeSet<_>>();
    if roles.len() != run.roles.len()
        || models.len() != run.models.len()
        || run.next_roles.iter().collect::<BTreeSet<_>>().len() != run.next_roles.len()
        || run.next_roles.iter().any(|id| {
            !run.roles
                .iter()
                .any(|role| &role.role_id == id && role.enabled)
        })
        || run.roles.iter().any(|role| {
            role.enabled
                && role
                    .model_profile_id
                    .as_ref()
                    .is_none_or(|profile| !models.contains(profile))
        })
    {
        return Err(ServiceError::Unavailable);
    }
    Ok(run)
}

/// Checks immutable turn/header scope for native paging, controls and recorded outcomes.
pub(super) fn stored_turn(record: Record, id: &TurnId) -> Result<TurnRecord, ServiceError> {
    let turn: TurnRecord =
        serde_json::from_value(record.body).map_err(|_| ServiceError::Unavailable)?;
    if &turn.turn_id != id
        || record.project.as_ref() != Some(&turn.project_id)
        || record.assignment.as_ref() != Some(&turn.assignment_id)
        || turn.revision.get() != record.revision
        || turn.revision.get() == 0
        || turn
            .started_at_ms
            .zip(turn.completed_at_ms)
            .is_some_and(|(start, end)| end < start)
    {
        return Err(ServiceError::Unavailable);
    }
    Ok(turn)
}
