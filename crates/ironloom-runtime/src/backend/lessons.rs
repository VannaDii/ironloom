//! Lesson content authority and dynamic applicability, independent from private source records.
use super::*;
use ironloom_policy::live::Relationship;
use ironloom_storage::factory::{Lesson, RecordScope};

const KIND: &str = "lesson";
const DELETED: &str = "lesson_deleted";
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct RemovedLesson {
    lesson_id: LessonId,
    origin_project: ProjectId,
    origin_assignment: AssignmentId,
    scope: RecordScope,
    revision: Counter,
}
fn lesson(record: Record, id: &LessonId) -> Result<Lesson, ServiceError> {
    let body: Lesson = read(record.body)?;
    if &body.lesson_id != id
        || Some(&body.origin_project) != record.project.as_ref()
        || Some(&body.origin_assignment) != record.assignment.as_ref()
        || body.revision.get() != record.revision
    {
        return Err(ServiceError::Unavailable);
    }
    Ok(body)
}
fn removed(record: &Record, id: &LessonId) -> Result<RemovedLesson, ServiceError> {
    let body: RemovedLesson =
        serde_json::from_value(record.body.clone()).map_err(|_| ServiceError::Unavailable)?;
    if &body.lesson_id != id
        || body.revision.get() != record.revision
        || Some(&body.origin_project) != record.project.as_ref()
        || Some(&body.origin_assignment) != record.assignment.as_ref()
    {
        return Err(ServiceError::Unavailable);
    }
    Ok(body)
}
fn resource(
    id: &LessonId,
    project: &ProjectId,
    scope: &RecordScope,
) -> Result<Resource, ServiceError> {
    Resource::new(ResourceData {
        kind: ResourceKind::Lesson,
        id: actor(id.as_str())?,
        project_id: if *scope == RecordScope::Installation {
            None
        } else {
            Some(project.clone())
        },
    })
    .map_err(ServiceError::Validation)
}
impl FactoryBackend {
    /// Lists currently authorized content in the selected context, without loading source records.
    /// Assignment filtering controls application; omitting it permits authorized project review.
    pub async fn lessons(
        &self,
        session: AuthenticatedSession,
        query: LessonQuery,
    ) -> Result<LessonPage, ServiceError> {
        self.authenticated(&session).await?;
        self.require(
            &session.operator_id,
            self.resource(Some(&query.project_id)).await?,
            Permission::View,
        )
        .await?;
        if let Some(assignment) = &query.assignment_id {
            let record = self
                .store
                .get("assignment", &actor(assignment.as_str())?)
                .await
                .map_err(database)?
                .ok_or_else(forbidden)?;
            if record.project.as_ref() != Some(&query.project_id) {
                return Err(forbidden());
            }
            self.require(
                &session.operator_id,
                Resource::new(ResourceData {
                    kind: ResourceKind::Assignment,
                    id: actor(assignment.as_str())?,
                    project_id: Some(query.project_id.clone()),
                })
                .map_err(ServiceError::Validation)?,
                Permission::View,
            )
            .await?;
        }
        let mut after = query.after.clone();
        let mut found = Vec::new();
        loop {
            let rows = self
                .store
                .lesson_rows(
                    &query.project_id,
                    query.assignment_id.as_ref(),
                    query.scope.as_ref(),
                    after.as_ref(),
                    MAX_SESSION_PAGE as u32,
                )
                .await
                .map_err(database)?;
            let exhausted = rows.len() < MAX_SESSION_PAGE as usize;
            for (id, record) in rows {
                let id = LessonId::new(id.as_str()).map_err(|_| ServiceError::Unavailable)?;
                after = Some(id.clone());
                let current = lesson(record, &id)?;
                match self
                    .require(
                        &session.operator_id,
                        resource(&id, &current.origin_project, &current.scope)?,
                        Permission::View,
                    )
                    .await
                {
                    Ok(()) => found.push(current),
                    Err(ServiceError::Authentication(AuthenticationError::Forbidden)) => {}
                    Err(error) => return Err(error),
                }
                if found.len() > query.limit.get() as usize {
                    found.pop();
                    let next_after = found.last().map(|lesson| lesson.lesson_id.clone());
                    return LessonPage::new(LessonPageData {
                        lessons: found,
                        next_after,
                    })
                    .map_err(ServiceError::Validation);
                }
            }
            if exhausted {
                return LessonPage::new(LessonPageData {
                    lessons: found,
                    next_after: None,
                })
                .map_err(ServiceError::Validation);
            }
        }
    }
    /// Persists a resource-only lesson command with no conversation cursor. Current lesson manage
    /// and explicit broadening share grants are checked independently from source conversation access.
    pub async fn lesson_command(
        &self,
        session: AuthenticatedSession,
        command: Command,
    ) -> Result<CommandReceipt, ServiceError> {
        let CommandAction::Lesson(request) = &command.action else {
            return Err(ServiceError::Validation(
                ironloom_core::validation::ValidationErrors::field("action", "lesson_required"),
            ));
        };
        self.authenticated(&session).await?;
        self.require(
            &session.operator_id,
            self.resource(Some(&command.project_id)).await?,
            Permission::View,
        )
        .await?;
        if command.expected_revision != request.expected_revision {
            return Err(ServiceError::Conflict);
        }
        let key = actor(request.lesson_id.as_str())?;
        let operation = self
            .store
            .begin(
                &session.operator_id,
                &command.command_id,
                &value(&command)?,
                &actor(&format!("lesson:{}", key.as_str()))?,
            )
            .await
            .map_err(database)?;
        let receipt = match operation {
            Operation::Replay(outcome) => {
                // Current grants still apply to a retained outcome, including a deletion marker.
                self.authorize_lesson(&session, &request.lesson_id).await?;
                let prior: CommandReceipt = read(outcome)?;
                let mut data = (*prior).clone();
                data.disposition = CommandDisposition::Replayed;
                CommandReceipt::new(data).map_err(ServiceError::Validation)?
            }
            Operation::Write(mut batch) => {
                let record = batch
                    .get(KIND, &key)
                    .await
                    .map_err(database)?
                    .ok_or_else(forbidden)?;
                let current = lesson(record, &request.lesson_id)?;
                self.require(
                    &session.operator_id,
                    resource(&current.lesson_id, &current.origin_project, &current.scope)?,
                    Permission::Manage,
                )
                .await?;
                if current.revision != request.expected_revision {
                    return Err(ServiceError::Conflict);
                }
                let next = current
                    .revision
                    .get()
                    .checked_add(1)
                    .ok_or(ServiceError::Conflict)?;
                if request.operation == LessonOperation::SetScope {
                    let target = request.scope.as_ref().ok_or(ServiceError::Conflict)?;
                    let broadens = matches!(
                        (&current.scope, target),
                        (
                            RecordScope::Assignment,
                            RecordScope::Project | RecordScope::Installation
                        ) | (RecordScope::Project, RecordScope::Installation)
                    );
                    if broadens {
                        self.require(
                            &session.operator_id,
                            resource(&current.lesson_id, &current.origin_project, &current.scope)?,
                            Permission::Share,
                        )
                        .await?;
                    }
                    if *target == RecordScope::Installation
                        && current.scope != RecordScope::Installation
                    {
                        self.require(
                            &session.operator_id,
                            self.resource(None).await?,
                            Permission::Share,
                        )
                        .await?;
                    }
                }
                if request.operation == LessonOperation::Delete {
                    let removed = RemovedLesson {
                        lesson_id: current.lesson_id.clone(),
                        origin_project: current.origin_project.clone(),
                        origin_assignment: current.origin_assignment.clone(),
                        scope: current.scope.clone(),
                        revision: Counter::new(next),
                    };
                    batch
                        .delete(KIND, &key, current.revision.get())
                        .await
                        .map_err(database)?;
                    batch
                        .insert_record(
                            DELETED,
                            &key,
                            Some(&current.origin_project),
                            Some(&actor(current.origin_assignment.as_str())?),
                            next,
                            &value(&removed)?,
                        )
                        .await
                        .map_err(database)?;
                } else {
                    let mut updated = (*current).clone();
                    updated.revision = Counter::new(next);
                    if let Some(content) = &request.content {
                        updated.content = content.clone();
                    }
                    if let Some(scope) = &request.scope {
                        updated.scope = scope.clone();
                    }
                    let updated = Lesson::new(updated).map_err(ServiceError::Validation)?;
                    batch
                        .put(
                            KIND,
                            &key,
                            Some(&current.origin_project),
                            Some(&actor(current.origin_assignment.as_str())?),
                            Some(current.revision.get()),
                            &value(&updated)?,
                        )
                        .await
                        .map_err(database)?;
                }
                batch
                    .context_change(KIND, &key, next)
                    .await
                    .map_err(database)?;
                batch.grant_intent(&actor(&format!("lesson:{}:{next}",key.as_str()))?,&serde_json::json!({"resource_kind":KIND,"resource_id":key,"revision":next.to_string(),"operator_id":session.operator_id})).await.map_err(database)?;
                batch.audit(Some(&command.project_id),"lesson_mutation",&serde_json::json!({"lesson_id":key,"revision":next.to_string(),"operation":request.operation})).await.map_err(database)?;
                let receipt = CommandReceipt::new(CommandReceiptData {
                    command_id: command.command_id.clone(),
                    disposition: CommandDisposition::Accepted,
                    cursor: None,
                })
                .map_err(ServiceError::Validation)?;
                (*batch).commit(&value(&receipt)?).await.map_err(database)?;
                receipt
            }
        };
        self.synchronize_lesson(&session.operator_id, &request.lesson_id)
            .await?;
        Ok(receipt)
    }
    async fn authorize_lesson(
        &self,
        session: &AuthenticatedSession,
        id: &LessonId,
    ) -> Result<(), ServiceError> {
        if let Some(record) = self
            .store
            .get(KIND, &actor(id.as_str())?)
            .await
            .map_err(database)?
        {
            let current = lesson(record, id)?;
            return self
                .require(
                    &session.operator_id,
                    resource(id, &current.origin_project, &current.scope)?,
                    Permission::Manage,
                )
                .await;
        }
        let record = self
            .store
            .get(DELETED, &actor(id.as_str())?)
            .await
            .map_err(database)?
            .ok_or_else(forbidden)?;
        let removed = removed(&record, id)?;
        self.require(
            &session.operator_id,
            resource(id, &removed.origin_project, &removed.scope)?,
            Permission::Manage,
        )
        .await
    }
    /// Projects only the latest locked desired visibility; retries never restore an older scope.
    pub(super) async fn synchronize_lesson(
        &self,
        operator: &OperatorId,
        id: &LessonId,
    ) -> Result<(), ServiceError> {
        let guard = self
            .store
            .resource_grants(KIND, &actor(id.as_str())?)
            .await
            .map_err(database)?;
        if guard.current().is_some() && guard.deleted().is_some() {
            return Err(ServiceError::Unavailable);
        }
        let (project, assignment, scope) = if let Some(record) = guard.current() {
            let current = lesson(record.clone(), id)?;
            (
                current.origin_project.clone(),
                current.origin_assignment.clone(),
                Some(current.scope.clone()),
            )
        } else {
            let removed = removed(guard.deleted().ok_or_else(forbidden)?, id)?;
            (removed.origin_project, removed.origin_assignment, None)
        };
        let object = format!("lesson:{}", id.as_str());
        let mut writes = vec![];
        let mut deletes = vec![];
        for (enabled, user, relation) in [
            (
                matches!(
                    scope,
                    Some(RecordScope::Project | RecordScope::Installation)
                ),
                format!("project:{}", project.as_str()),
                "project",
            ),
            (
                scope == Some(RecordScope::Assignment),
                format!("assignment:{}", assignment.as_str()),
                "assignment",
            ),
            (
                scope == Some(RecordScope::Installation),
                "operator:*".into(),
                "viewer",
            ),
        ] {
            let tuple = Relationship::new(user, relation, object.clone())
                .map_err(|_| ServiceError::Unavailable)?;
            if enabled {
                writes.push(tuple);
            } else {
                deletes.push(tuple);
            }
        }
        // Recheck after taking the same resource lock as mutations. Current desired scope is used,
        // never the old request's scope, so a delayed retry cannot restore a later restriction.
        self.require(
            operator,
            Resource::new(ResourceData {
                kind: ResourceKind::Lesson,
                id: actor(id.as_str())?,
                project_id: if scope == Some(RecordScope::Installation) {
                    None
                } else {
                    Some(project)
                },
            })
            .map_err(ServiceError::Validation)?,
            Permission::Manage,
        )
        .await?;
        self.authority
            .write(writes, deletes)
            .await
            .map_err(|_| ServiceError::Unavailable)?;
        guard.complete().await.map_err(database)
    }
}
