//! Durable authorization outbox recovery. No model, worker dispatch or identity reset occurs here.
use super::*;
use ironloom_policy::live::Relationship;

const GRANT_PAGE: usize = 100;
const MAINTENANCE_INTERVAL: std::time::Duration = std::time::Duration::from_secs(1);
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct LessonIntent {
    resource_kind: String,
    resource_id: LessonId,
    revision: Counter,
    operator_id: OperatorId,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ConversationIntent {
    kind: String,
    project: ProjectId,
    conversation: ConversationId,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct AssignmentIntent {
    kind: String,
    project: ProjectId,
    assignment: AssignmentId,
}
impl FactoryBackend {
    /// Recovers already-committed resource grant intents using current metadata/current grants.
    /// Failed resources remain pending while other independent resources continue to recover.
    pub async fn recover_grants(&self) -> Result<usize, ServiceError> {
        let mut after = None;
        let mut completed = 0;
        let mut first_error = None;
        loop {
            let pending = self
                .store
                .grant_intents(after.as_ref())
                .await
                .map_err(database)?;
            let exhausted = pending.len() < GRANT_PAGE;
            for (id, body) in pending {
                after = Some(id.clone());
                let result = if body.get("resource_kind").and_then(Value::as_str) == Some("lesson")
                {
                    match serde_json::from_value::<LessonIntent>(body) {
                        Ok(intent)
                            if intent.resource_kind == "lesson" && intent.revision.get() > 0 =>
                        {
                            self.synchronize_lesson(&intent.operator_id, &intent.resource_id)
                                .await
                        }
                        _ => Err(ServiceError::Unavailable),
                    }
                } else if body.get("kind").and_then(Value::as_str) == Some("conversation_parent") {
                    self.recover_conversation_grant(&id, body).await
                } else if body.get("kind").and_then(Value::as_str) == Some("assignment_parent") {
                    self.recover_assignment_grant(&id, body).await
                } else {
                    continue;
                };
                match result {
                    Ok(()) => completed += 1,
                    Err(error) => {
                        first_error.get_or_insert(error);
                    }
                }
            }
            if exhausted {
                break;
            }
        }
        first_error.map_or(Ok(completed), Err)
    }
    async fn recover_conversation_grant(
        &self,
        intent: &ActorId,
        body: Value,
    ) -> Result<(), ServiceError> {
        let intent_body: ConversationIntent =
            serde_json::from_value(body).map_err(|_| ServiceError::Unavailable)?;
        if intent_body.kind != "conversation_parent"
            || intent.as_str() != intent_body.conversation.as_str()
        {
            return Err(ServiceError::Unavailable);
        }
        let record = self
            .store
            .get("conversation", &actor(intent_body.conversation.as_str())?)
            .await
            .map_err(database)?
            .ok_or(ServiceError::Unavailable)?;
        let snapshot: ConversationSnapshot = read(record.body)?;
        if snapshot.session.conversation_id != intent_body.conversation
            || snapshot.session.project_id != intent_body.project
            || record.project.as_ref() != Some(&intent_body.project)
            || record.assignment.is_some()
        {
            return Err(ServiceError::Unavailable);
        }
        // Immutable parent linkage grants nothing independently from current project membership.
        self.authority
            .write(
                vec![
                    Relationship::new(
                        format!("project:{}", intent_body.project.as_str()),
                        "project",
                        format!("conversation:{}", intent_body.conversation.as_str()),
                    )
                    .map_err(|_| ServiceError::Unavailable)?,
                ],
                vec![],
            )
            .await
            .map_err(|_| ServiceError::Unavailable)?;
        self.store.grant_applied(intent).await.map_err(database)
    }
    async fn recover_assignment_grant(
        &self,
        intent: &ActorId,
        body: Value,
    ) -> Result<(), ServiceError> {
        let body: AssignmentIntent =
            serde_json::from_value(body).map_err(|_| ServiceError::Unavailable)?;
        if body.kind != "assignment_parent" || intent.as_str() != body.assignment.as_str() {
            return Err(ServiceError::Unavailable);
        }
        let run = assignments::stored_run(
            self.store
                .get("assignment", intent)
                .await
                .map_err(database)?
                .ok_or(ServiceError::Unavailable)?,
            &body.assignment,
        )?;
        if run.project_id != body.project {
            return Err(ServiceError::Unavailable);
        }
        self.authority
            .write(
                vec![
                    Relationship::new(
                        format!("project:{}", body.project.as_str()),
                        "project",
                        format!("assignment:{}", body.assignment.as_str()),
                    )
                    .map_err(|_| ServiceError::Unavailable)?,
                ],
                vec![],
            )
            .await
            .map_err(|_| ServiceError::Unavailable)?;
        self.store.grant_applied(intent).await.map_err(database)
    }
    /// Starts bounded asynchronous resource recovery independently from viewers and telemetry.
    /// The service owns this task and closes it with the same transport shutdown signal.
    pub fn start_maintenance(&self) -> tokio::task::JoinHandle<()> {
        let service = self.clone();
        let mut stop = self.reader_shutdown.subscribe();
        tokio::spawn(async move {
            loop {
                if *stop.borrow() {
                    return;
                }
                tokio::select! {_=stop.changed()=>return,_=service.recover_grants()=>{}}
                tokio::select! {_=stop.changed()=>return,_=tokio::time::sleep(MAINTENANCE_INTERVAL)=>{}}
            }
        })
    }
}
