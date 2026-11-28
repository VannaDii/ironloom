//! Owned supervisor boundary observations. No inference/tool execution or invented stop proof.
use super::*;
use assignments::stored_run;
use commands::ConversationChange;
use ironloom_queue::factory::ExecutionState;
use ironloom_storage::postgres::dispatch::DispatchLease;

impl FactoryBackend {
    /// Confirms a requested pause/cancellation only when this node's exact live claim has no
    /// surviving/uncertain request, process, mutation or path owner. The scheduler calls this
    /// at controllable boundaries; it is independent from viewers and creates no model calls.
    pub async fn reconcile_control_boundary(
        &self,
        claim: &DispatchLease,
    ) -> Result<Option<CommandReceipt>, ServiceError> {
        let record = self
            .store
            .get("assignment", &actor(claim.assignment_id.as_str())?)
            .await
            .map_err(database)?
            .ok_or(ServiceError::Unavailable)?;
        let original = stored_run(record, &claim.assignment_id)?;
        if claim.node_id != self.infrastructure.node_id
            || original.owner_node != claim.node_id
            || original.project_id != claim.project_id
        {
            return Err(forbidden());
        }
        if original.state != ExecutionState::CancellationRequested && !original.pause_requested {
            return Ok(None);
        }
        if original.control_command.is_none() || original.control_operator.is_none() {
            return Err(ServiceError::Unavailable);
        }
        let command = CommandId::new(format!(
            "control-boundary-{}-{}",
            claim.assignment_id.as_str(),
            claim.fence.get()
        ))
        .map_err(|_| ServiceError::Unavailable)?;
        let operation=self.store.begin(&original.operator_id,&command,&serde_json::json!({"assignment":claim.assignment_id,"fence":claim.fence,"instance":claim.instance}),&actor(&format!("conversation:{}",original.conversation_id.as_str()))?).await.map_err(database)?;
        let mut batch = match operation {
            Operation::Replay(outcome) => return Ok(Some(read(outcome)?)),
            Operation::Write(batch) => batch,
        };
        let snapshot = conversations::stored_snapshot(
            batch
                .get("conversation", &actor(original.conversation_id.as_str())?)
                .await
                .map_err(database)?
                .ok_or(ServiceError::Unavailable)?,
            &original.conversation_id,
        )?;
        let mut run = stored_run(
            batch
                .get("assignment", &actor(claim.assignment_id.as_str())?)
                .await
                .map_err(database)?
                .ok_or(ServiceError::Unavailable)?,
            &claim.assignment_id,
        )?;
        if snapshot.active_assignment_id.as_ref() != Some(&run.assignment_id)
            || snapshot.session.active_turn_id.as_ref() != Some(&run.turn_id)
        {
            return Err(ServiceError::Conflict);
        }
        if !batch.claim_quiescent(claim).await.map_err(database)? {
            return Ok(None);
        }
        let mut next = (*snapshot).clone();
        if run.state == ExecutionState::CancellationRequested {
            batch.finish_claim(claim).await.map_err(database)?;
            run.state = ExecutionState::Terminated;
            run.pause_requested = false;
            let mut summary = (*next.session).clone();
            summary.active_turn_id = None;
            next.session = SessionSummary::new(summary).map_err(ServiceError::Validation)?;
            next.active_assignment_id = None;
            next.pending_questions.clear();
            next.pause_requested = None;
        } else if run.pause_requested {
            batch.yield_suspended_claim(claim).await.map_err(database)?;
            run.state = ExecutionState::Paused;
            run.pause_requested = false;
            next.pause_requested = Some(false);
        } else {
            return Ok(None);
        }
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
                &actor(run.assignment_id.as_str())?,
                Some(&run.project_id),
                Some(&actor(run.assignment_id.as_str())?),
                Some(previous.get()),
                &value(&run)?,
            )
            .await
            .map_err(database)?;
        self.persist_turn_state(&mut batch, &run).await?;
        next.execution_state = Some(run.state.clone());
        batch.audit(Some(&run.project_id),"assignment.control_confirmed",&serde_json::json!({"assignment":run.assignment_id,"node":claim.node_id,"instance":claim.instance,"fence":claim.fence,"state":run.state,"control_command":run.control_command,"control_operator":run.control_operator})).await.map_err(database)?;
        self.commit_conversation_change(
            batch,
            ConversationChange {
                command_id: command,
                project_id: run.project_id,
                human_interaction: false,
            },
            &snapshot,
            next,
            None,
        )
        .await
        .map(Some)
    }
}
