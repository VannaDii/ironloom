//! Durable factory orchestration. Public inputs are validated; authority is checked on actual resources.
use crate::authentication::{AuthenticationBackend, model_revision};
use ironloom_config::{factory::ModelProfileConfiguration, team::ReadinessFacts};
use ironloom_core::{
    validation::{Wire, decode},
    *,
};
use ironloom_models::factory::{DeviceIdentity, EngineIdentity};
use ironloom_policy::{
    factory::{
        AuthorityCheck, AuthorityCheckData, AuthorizationOutcome, Permission, Resource,
        ResourceData, ResourceKind,
    },
    live::Authority,
};
use ironloom_service::{
    configuration::{effective_snapshot, merge_overrides},
    factory::*,
};
use ironloom_storage::postgres::{Batch, DatabaseError, Operation, Record, Store};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{BTreeMap, BTreeSet},
    path::PathBuf,
    sync::Arc,
};

const CONFIGURATION_KIND: &str = "configuration";
const CONFIGURATION_SCOPE: &str = "configuration";
mod assignments;
mod boundaries;
mod commands;
mod configuration_bindings;
mod controls;
mod conversations;
mod lessons;
mod maintenance;
mod projects;
/// Trusted current execution bindings supplied by runtime/adapter composition, never browser claims.
#[derive(Clone)]
pub struct BackendInfrastructure {
    /// Stable enrolled owning node identity.
    pub node_id: NodeId,
    /// Explicit registered provider identities; absence never chooses a fallback.
    pub providers: BTreeSet<ActorId>,
    /// Exact registered local engine identities, observed without loading or inference.
    pub engines: Vec<EngineIdentity>,
    /// Canonical trusted device metadata; fixtures remain unqualified.
    pub devices: Vec<DeviceIdentity>,
    /// Native process/filesystem enforcement availability; launch still enforces independently.
    pub sandbox_available: bool,
    /// Infrastructure-selected project root, independent from model/database persistence.
    pub projects_root: PathBuf,
}
/// PostgreSQL-backed application service. Runtime owns adapter composition and background execution.
#[derive(Clone)]
pub struct FactoryBackend {
    store: Store,
    authentication: Arc<AuthenticationBackend>,
    authority: Arc<dyn Authority>,
    installation: ActorId,
    infrastructure: BackendInfrastructure,
    reader_shutdown: tokio::sync::watch::Sender<bool>,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct StoredConfiguration {
    project_id: Option<ProjectId>,
    revision: Counter,
    changes: ConfigurationChange,
}
impl FactoryBackend {
    /// Opens the selected existing installation and trusted infrastructure bindings without dispatch.
    pub async fn new(
        store: Store,
        authentication: Arc<AuthenticationBackend>,
        authority: Arc<dyn Authority>,
        infrastructure: BackendInfrastructure,
    ) -> Result<Self, ServiceError> {
        let (installation, _, _) = store.installation().await.map_err(database)?;
        Ok(Self {
            store,
            authentication,
            authority,
            installation,
            infrastructure,
            reader_shutdown: tokio::sync::watch::channel(false).0,
        })
    }
    /// Closes transport readers during service shutdown so graceful HTTP draining can finish.
    /// This never cancels or confirms termination of assignment/process execution.
    pub fn close_subscriptions(&self) {
        self.reader_shutdown.send_replace(true);
    }
    async fn resource(&self, project: Option<&ProjectId>) -> Result<Resource, ServiceError> {
        if let Some(project) = project {
            if !self.store.project_exists(project).await.map_err(database)? {
                return Err(forbidden());
            }
            Resource::new(ResourceData {
                kind: ResourceKind::Project,
                id: actor(project.as_str())?,
                project_id: Some(project.clone()),
            })
            .map_err(ServiceError::Validation)
        } else {
            Resource::new(ResourceData {
                kind: ResourceKind::Installation,
                id: self.installation.clone(),
                project_id: None,
            })
            .map_err(ServiceError::Validation)
        }
    }
    async fn require(
        &self,
        operator: &OperatorId,
        resource: Resource,
        permission: Permission,
    ) -> Result<(), ServiceError> {
        let request = AuthorityCheck::new(AuthorityCheckData {
            operator_id: operator.clone(),
            worker_id: None,
            assignment_id: None,
            resource,
            permission,
            authorization_model: model_revision(),
        })
        .map_err(ServiceError::Validation)?;
        match self.authority.check(request).await {
            AuthorizationOutcome::Allowed => Ok(()),
            AuthorizationOutcome::Denied => Err(forbidden()),
            AuthorizationOutcome::ApprovalRequired => Err(ServiceError::ApprovalRequired),
            AuthorizationOutcome::Unavailable => Err(ServiceError::Unavailable),
        }
    }
    async fn authenticated(&self, session: &AuthenticatedSession) -> Result<(), ServiceError> {
        self.authentication
            .ensure_session(session)
            .await
            .map_err(ServiceError::Authentication)
    }
    async fn configuration_records(
        &self,
        project: Option<&ProjectId>,
    ) -> Result<(Option<StoredConfiguration>, Option<StoredConfiguration>), ServiceError> {
        let global = configuration_key(None)?;
        let mut keys = vec![global.clone()];
        if let Some(project) = project {
            keys.push(configuration_key(Some(project))?);
        }
        let mut records = self
            .store
            .get_many(CONFIGURATION_KIND, &keys)
            .await
            .map_err(database)?;
        let global = records
            .remove(&global)
            .map(|record| configuration_record(record, None))
            .transpose()?;
        let local = if let Some(project) = project {
            records
                .remove(&configuration_key(Some(project))?)
                .map(|record| configuration_record(record, Some(project)))
                .transpose()?
        } else {
            None
        };
        Ok((global, local))
    }
    async fn usable_profiles(
        &self,
        operator: &OperatorId,
        profiles: &[ModelProfileConfiguration],
        endpoints: &[ironloom_config::factory::ProviderEndpoint],
        preferences: &[ironloom_config::factory::DevicePreference],
        mut batch: Option<&mut Batch>,
    ) -> Result<BTreeSet<ModelProfileId>, ServiceError> {
        let mut available = BTreeSet::new();
        for profile in profiles {
            let adapter = if let Some(engine) = &profile.engine {
                self.infrastructure.engines.contains(engine)
            } else {
                self.infrastructure.providers.contains(&profile.provider)
            };
            if !adapter {
                continue;
            }
            if profile.engine.is_none()
                && !endpoints.iter().any(|endpoint| {
                    endpoint.provider == profile.provider && endpoint.billing == profile.billing
                })
            {
                continue;
            }
            if profile.engine.is_none() && profile.credential_id.is_none() {
                continue;
            }
            if let Some(credential) = &profile.credential_id {
                let exists = if let Some(batch) = batch.as_deref_mut() {
                    batch.credential_exists(credential).await
                } else {
                    self.store.credential_exists(credential).await
                }
                .map_err(database)?;
                if !exists {
                    continue;
                }
                let resource = Resource::new(ResourceData {
                    kind: ResourceKind::Credential,
                    id: actor(credential.as_str())?,
                    project_id: None,
                })
                .map_err(ServiceError::Validation)?;
                match self
                    .require(operator, resource, Permission::UseCredential)
                    .await
                {
                    Ok(()) => {}
                    Err(ServiceError::Authentication(AuthenticationError::Forbidden)) => continue,
                    Err(error) => return Err(error),
                }
            }
            if profile.engine.is_some() {
                let record = if let Some(batch) = batch.as_deref_mut() {
                    batch.get("inventory", &profile.model_id).await
                } else {
                    self.store.get("inventory", &profile.model_id).await
                }
                .map_err(database)?;
                let Some(record) = record else {
                    continue;
                };
                let inventory: ModelInventoryItem = read(record.body)?;
                if inventory.verification != ModelVerification::Verified
                    || !inventory.storage_available
                {
                    continue;
                }
                if ironloom_config::team::permitted_devices(
                    profile,
                    None,
                    preferences,
                    &self.infrastructure.devices,
                )
                .is_empty()
                {
                    continue;
                }
            }
            available.insert(profile.profile_id.clone());
        }
        Ok(available)
    }
    async fn effective_configuration(
        &self,
        session: &AuthenticatedSession,
        project: Option<&ProjectId>,
        global: Option<&StoredConfiguration>,
        local: Option<&StoredConfiguration>,
        mut batch: Option<&mut Batch>,
    ) -> Result<ConfigurationSnapshot, ServiceError> {
        let empty = BTreeSet::new();
        let facts = ReadinessFacts {
            usable_profiles: &empty,
            workspace_available: true,
            sandbox_available: self.infrastructure.sandbox_available,
            node_enrolled: false,
        };
        let base = effective_snapshot(
            None,
            global
                .map(|state| state.revision)
                .unwrap_or(Counter::new(1)),
            None,
            global.map(|state| &state.changes),
            self.infrastructure.devices.clone(),
            &facts,
        )
        .map_err(ServiceError::Validation)?;
        let effective = if let Some(project) = project {
            effective_snapshot(
                Some(project.clone()),
                local.map(|state| state.revision).unwrap_or(Counter::new(1)),
                Some(&base),
                local.map(|state| &state.changes),
                self.infrastructure.devices.clone(),
                &facts,
            )
            .map_err(ServiceError::Validation)?
        } else {
            base
        };
        let mut available = self
            .usable_profiles(
                &session.operator_id,
                &effective.models,
                &effective.endpoints,
                &effective.device_preferences,
                batch.as_deref_mut(),
            )
            .await?;
        for role in effective.roles.iter().filter(|role| role.enabled) {
            if let Some(profile) = effective
                .models
                .iter()
                .find(|profile| Some(&profile.profile_id) == role.model_profile_id.as_ref())
                && profile.engine.is_none()
                && role.reasoning_effort.as_ref().is_some_and(|effort| {
                    !effective.endpoints.iter().any(|endpoint| {
                        endpoint.provider == profile.provider
                            && endpoint.reasoning_efforts.contains(effort)
                    })
                })
            {
                available.remove(&profile.profile_id);
            }
        }
        let node = if let Some(batch) = batch {
            batch.node_enrollment(&self.infrastructure.node_id).await
        } else {
            self.store
                .node_enrollment(&self.infrastructure.node_id)
                .await
        }
        .map_err(database)?;
        let enrolled = node
            .as_ref()
            .is_some_and(|node| node.installation_id.as_str() == self.installation.as_str());
        let facts = ReadinessFacts {
            usable_profiles: &available,
            workspace_available: self.infrastructure.projects_root.is_dir(),
            sandbox_available: self.infrastructure.sandbox_available,
            node_enrolled: enrolled,
        };
        effective_snapshot(
            effective.project_id.clone(),
            effective.revision,
            Some(&effective),
            None,
            effective.discovered_devices.clone(),
            &facts,
        )
        .map_err(ServiceError::Validation)
    }
    /// Reads authorized effective setup/team/model/device settings at one durable settings watermark.
    pub async fn configuration(
        &self,
        session: AuthenticatedSession,
        project: Option<ProjectId>,
    ) -> Result<ConfigurationSnapshot, ServiceError> {
        self.authenticated(&session).await?;
        self.require(
            &session.operator_id,
            self.resource(project.as_ref()).await?,
            Permission::View,
        )
        .await?;
        let (global, local) = self.configuration_records(project.as_ref()).await?;
        self.effective_configuration(
            &session,
            project.as_ref(),
            global.as_ref(),
            local.as_ref(),
            None,
        )
        .await
    }
    /// Commits an actor-scoped retry outcome with optimistic settings revision checks before projects exist.
    pub async fn configure(
        &self,
        session: AuthenticatedSession,
        request: ConfigurationCommand,
    ) -> Result<ConfigurationSnapshot, ServiceError> {
        self.authenticated(&session).await?;
        let resource = self.resource(request.project_id.as_ref()).await?;
        self.require(&session.operator_id, resource.clone(), Permission::Manage)
            .await?;
        if request.changes.setup.as_ref().is_some_and(|setup| {
            setup.lesson_handling == ironloom_config::factory::LessonHandling::ShareAcrossProjects
        }) {
            self.require(&session.operator_id, resource.clone(), Permission::Share)
                .await?;
        }
        let payload = value(&request)?;
        let operation = self
            .store
            .begin(
                &session.operator_id,
                &request.command_id,
                &payload,
                &actor(CONFIGURATION_SCOPE)?,
            )
            .await
            .map_err(database)?;
        let mut batch = match operation {
            Operation::Replay(outcome) => {
                self.authenticated(&session).await?;
                self.require(&session.operator_id, resource.clone(), Permission::Manage)
                    .await?;
                if request.changes.setup.as_ref().is_some_and(|setup| {
                    setup.lesson_handling
                        == ironloom_config::factory::LessonHandling::ShareAcrossProjects
                }) {
                    self.require(&session.operator_id, resource, Permission::Share)
                        .await?;
                }
                return read(outcome);
            }
            Operation::Write(batch) => batch,
        };
        if !batch
            .session_active(&session.session_id)
            .await
            .map_err(database)?
        {
            return Err(ServiceError::Authentication(
                AuthenticationError::Unauthenticated,
            ));
        }
        self.require(&session.operator_id, resource.clone(), Permission::Manage)
            .await?;
        if request.changes.setup.as_ref().is_some_and(|setup| {
            setup.lesson_handling == ironloom_config::factory::LessonHandling::ShareAcrossProjects
        }) {
            self.require(&session.operator_id, resource, Permission::Share)
                .await?;
        }
        let key = configuration_key(request.project_id.as_ref())?;
        let previous = batch
            .get(CONFIGURATION_KIND, &key)
            .await
            .map_err(database)?
            .map(|record| configuration_record(record, request.project_id.as_ref()))
            .transpose()?;
        let current = previous
            .as_ref()
            .map(|state| state.revision.get())
            .unwrap_or(1);
        if current != request.expected_revision.get() {
            return Err(ServiceError::Conflict);
        }
        let revision = current.checked_add(1).ok_or(ServiceError::Conflict)?;
        let changes = merge_overrides(
            previous.as_ref().map(|state| &state.changes),
            &request.changes,
        )
        .map_err(ServiceError::Validation)?;
        let state = StoredConfiguration {
            project_id: request.project_id.clone(),
            revision: Counter::new(revision),
            changes,
        };
        let global = if request.project_id.is_some() {
            batch
                .get(CONFIGURATION_KIND, &configuration_key(None)?)
                .await
                .map_err(database)?
                .map(|record| configuration_record(record, None))
                .transpose()?
        } else {
            None
        };
        let (global, local) = if request.project_id.is_some() {
            (global.as_ref(), Some(&state))
        } else {
            (Some(&state), None)
        };
        let before = self
            .effective_configuration(
                &session,
                request.project_id.as_ref(),
                if request.project_id.is_some() {
                    global
                } else {
                    previous.as_ref()
                },
                if request.project_id.is_some() {
                    previous.as_ref()
                } else {
                    None
                },
                Some(&mut batch),
            )
            .await?;
        let snapshot = self
            .effective_configuration(
                &session,
                request.project_id.as_ref(),
                global,
                local,
                Some(&mut batch),
            )
            .await?;
        self.authorize_destination_changes(&session.operator_id, &before, &snapshot)
            .await?;
        if request.project_id.is_none() {
            let mut after = None;
            let empty = BTreeSet::new();
            let facts = ReadinessFacts {
                usable_profiles: &empty,
                workspace_available: true,
                sandbox_available: false,
                node_enrolled: false,
            };
            loop {
                let rows = batch
                    .list(CONFIGURATION_KIND, after.as_ref(), 100)
                    .await
                    .map_err(database)?;
                if rows.is_empty() {
                    break;
                }
                for (id, record) in rows {
                    after = Some(id.clone());
                    let Some(project) = record.project.clone() else {
                        continue;
                    };
                    if configuration_key(Some(&project))? != id {
                        return Err(ServiceError::Unavailable);
                    }
                    let local = configuration_record(record, Some(&project))?;
                    let candidate = effective_snapshot(
                        Some(project.clone()),
                        local.revision,
                        Some(&snapshot),
                        Some(&local.changes),
                        vec![],
                        &facts,
                    )
                    .map_err(|_| {
                        ServiceError::Validation(
                            ironloom_core::validation::ValidationErrors::field(
                                "changes",
                                "incompatible_project_configuration",
                            ),
                        )
                    })?;
                    let previous = effective_snapshot(
                        Some(project),
                        local.revision,
                        Some(&before),
                        Some(&local.changes),
                        vec![],
                        &facts,
                    )
                    .map_err(|_| ServiceError::Unavailable)?;
                    self.authorize_destination_changes(&session.operator_id, &previous, &candidate)
                        .await?;
                }
            }
        }
        if previous.is_some() {
            batch
                .put(
                    CONFIGURATION_KIND,
                    &key,
                    request.project_id.as_ref(),
                    None,
                    Some(current),
                    &value(&state)?,
                )
                .await
                .map_err(database)?;
        } else {
            batch
                .insert_record(
                    CONFIGURATION_KIND,
                    &key,
                    request.project_id.as_ref(),
                    None,
                    revision,
                    &value(&state)?,
                )
                .await
                .map_err(database)?;
        }
        batch
            .context_change(CONFIGURATION_KIND, &key, revision)
            .await
            .map_err(database)?;
        batch
            .audit(
                request.project_id.as_ref(),
                "configuration.changed",
                &serde_json::json!({"revision":revision.to_string()}),
            )
            .await
            .map_err(database)?;
        (*batch)
            .commit(&value(&snapshot)?)
            .await
            .map_err(database)?;
        Ok(snapshot)
    }
    /// Lists currently viewable installation/project templates with stable public identity pagination.
    pub async fn instructions(
        &self,
        session: AuthenticatedSession,
        query: InstructionQuery,
    ) -> Result<InstructionPage, ServiceError> {
        self.authenticated(&session).await?;
        self.require(
            &session.operator_id,
            self.resource(query.project_id.as_ref()).await?,
            Permission::View,
        )
        .await?;
        let mut templates = BTreeMap::new();
        for role in ironloom_config::team::standard_team() {
            if query
                .after
                .as_ref()
                .is_none_or(|after| &role.instruction_id > after)
            {
                templates.insert(
                    role.instruction_id.clone(),
                    InstructionTemplate::new(InstructionTemplateData {
                        instruction_id: role.instruction_id,
                        project_id: None,
                        revision: Counter::new(1),
                        content: role.instructions.to_owned(),
                    })
                    .map_err(ServiceError::Validation)?,
                );
            }
        }
        for (id, record) in self
            .store
            .instruction_rows(
                query.project_id.as_ref(),
                query.after.as_ref(),
                query.limit.get() as i64 + 1,
            )
            .await
            .map_err(database)?
        {
            let template: InstructionTemplate = read(record.body)?;
            if template.instruction_id.as_str() != id.as_str()
                || template.revision.get() != record.revision
                || template.project_id != record.project
            {
                return Err(ServiceError::Unavailable);
            }
            templates.insert(template.instruction_id.clone(), template);
        }
        let more = templates.len() > query.limit.get() as usize;
        let instructions = templates
            .into_values()
            .take(query.limit.get() as usize)
            .collect::<Vec<_>>();
        let next_after = if more {
            instructions
                .last()
                .map(|template| template.instruction_id.clone())
        } else {
            None
        };
        InstructionPage::new(InstructionPageData {
            instructions,
            next_after,
        })
        .map_err(ServiceError::Validation)
    }
    /// Atomically edits one globally identified template and explicitly selected active worker copies.
    pub async fn instruction(
        &self,
        session: AuthenticatedSession,
        request: InstructionCommand,
    ) -> Result<InstructionTemplate, ServiceError> {
        self.authenticated(&session).await?;
        self.require(
            &session.operator_id,
            self.resource(request.project_id.as_ref()).await?,
            Permission::Manage,
        )
        .await?;
        let operation = self
            .store
            .begin(
                &session.operator_id,
                &request.command_id,
                &value(&request)?,
                &actor("instructions")?,
            )
            .await
            .map_err(database)?;
        let mut batch = match operation {
            Operation::Replay(outcome) => return read(outcome),
            Operation::Write(batch) => batch,
        };
        let key = actor(request.instruction_id.as_str())?;
        let previous = batch.get("instruction", &key).await.map_err(database)?;
        let current = if let Some(record) = &previous {
            let template: InstructionTemplate = read(record.body.clone())?;
            if template.instruction_id != request.instruction_id
                || template.revision.get() != record.revision
                || template.project_id != record.project
            {
                return Err(ServiceError::Unavailable);
            }
            if template.project_id != request.project_id {
                return Err(forbidden());
            }
            template.revision.get()
        } else if ironloom_config::team::standard_team()
            .iter()
            .any(|role| role.instruction_id == request.instruction_id)
        {
            if request.project_id.is_some() {
                return Err(forbidden());
            }
            1
        } else {
            0
        };
        if current != request.expected_revision.get() {
            return Err(ServiceError::Conflict);
        }
        let revision = current.checked_add(1).ok_or(ServiceError::Conflict)?;
        let template = InstructionTemplate::new(InstructionTemplateData {
            instruction_id: request.instruction_id.clone(),
            project_id: request.project_id.clone(),
            revision: Counter::new(revision),
            content: request.content.clone(),
        })
        .map_err(ServiceError::Validation)?;
        for assignment in &request.assignments {
            let record = batch
                .get("assignment", &actor(assignment.as_str())?)
                .await
                .map_err(database)?
                .ok_or(ServiceError::Validation(
                    ironloom_core::validation::ValidationErrors::field(
                        "assignments",
                        "active_assignment_required",
                    ),
                ))?;
            let active: AssignmentInstructionTarget =
                serde_json::from_value(record.body).map_err(|_| ServiceError::Unavailable)?;
            if record.project.as_ref() != Some(&active.project_id) {
                return Err(ServiceError::Unavailable);
            }
            if request
                .project_id
                .as_ref()
                .is_some_and(|project| project != &active.project_id)
            {
                return Err(forbidden());
            }
            if matches!(
                active.state,
                ironloom_queue::factory::ExecutionState::Completed
                    | ironloom_queue::factory::ExecutionState::Failed
                    | ironloom_queue::factory::ExecutionState::Terminated
            ) {
                return Err(ServiceError::Conflict);
            }
            let resource = Resource::new(ResourceData {
                kind: ResourceKind::Assignment,
                id: actor(assignment.as_str())?,
                project_id: Some(active.project_id.clone()),
            })
            .map_err(ServiceError::Validation)?;
            self.require(&session.operator_id, resource, Permission::Manage)
                .await?;
            let mut after = None;
            let mut updated = 0;
            loop {
                let rows = batch
                    .assigned_records("instruction_copy", assignment, after.as_ref(), 100)
                    .await
                    .map_err(database)?;
                if rows.is_empty() {
                    break;
                }
                for (id, record) in rows {
                    after = Some(id.clone());
                    let copy: ironloom_process_graph::factory::InstructionCopy = read(record.body)?;
                    if copy.assignment_id != *assignment
                        || record.project.as_ref() != Some(&active.project_id)
                    {
                        return Err(ServiceError::Unavailable);
                    }
                    if copy.instruction_id != request.instruction_id {
                        continue;
                    }
                    let mut draft = (*copy).clone();
                    draft.revision = Counter::new(
                        copy.revision
                            .get()
                            .checked_add(1)
                            .ok_or(ServiceError::Conflict)?,
                    );
                    draft.content = request.content.clone();
                    let copy = ironloom_process_graph::factory::InstructionCopy::new(draft)
                        .map_err(ServiceError::Validation)?;
                    let next = batch
                        .put(
                            "instruction_copy",
                            &id,
                            Some(&active.project_id),
                            Some(&actor(assignment.as_str())?),
                            Some(record.revision),
                            &value(&copy)?,
                        )
                        .await
                        .map_err(database)?;
                    batch
                        .context_change("instruction_copy", &id, next)
                        .await
                        .map_err(database)?;
                    updated += 1;
                }
            }
            if updated == 0 {
                return Err(ServiceError::Validation(
                    ironloom_core::validation::ValidationErrors::field(
                        "assignments",
                        "instruction_not_copied",
                    ),
                ));
            }
        }
        if let Some(previous) = previous {
            batch
                .put(
                    "instruction",
                    &key,
                    request.project_id.as_ref(),
                    None,
                    Some(previous.revision),
                    &value(&template)?,
                )
                .await
                .map_err(database)?;
        } else {
            batch
                .insert_record(
                    "instruction",
                    &key,
                    request.project_id.as_ref(),
                    None,
                    revision,
                    &value(&template)?,
                )
                .await
                .map_err(database)?;
        }
        let history = actor(&format!("{}:{}", request.instruction_id.as_str(), revision))?;
        batch
            .put(
                "instruction_revision",
                &history,
                request.project_id.as_ref(),
                None,
                None,
                &value(&template)?,
            )
            .await
            .map_err(database)?;
        batch
            .context_change("instruction", &key, revision)
            .await
            .map_err(database)?;
        batch.audit(request.project_id.as_ref(),"instruction.changed",&serde_json::json!({"instruction_id":request.instruction_id,"revision":revision.to_string(),"active_update":request.active_update,"assignments":request.assignments})).await.map_err(database)?;
        (*batch)
            .commit(&value(&template)?)
            .await
            .map_err(database)?;
        Ok(template)
    }
}
fn configuration_key(project: Option<&ProjectId>) -> Result<ActorId, ServiceError> {
    actor(
        &project
            .map(|id| format!("project:{}", id.as_str()))
            .unwrap_or_else(|| "installation".into()),
    )
}
fn configuration_record(
    record: Record,
    project: Option<&ProjectId>,
) -> Result<StoredConfiguration, ServiceError> {
    let state: StoredConfiguration =
        serde_json::from_value(record.body).map_err(|_| ServiceError::Unavailable)?;
    if state.revision.get() == 0
        || state.revision.get() != record.revision
        || state.project_id.as_ref() != project
        || record.project.as_ref() != project
        || record.assignment.is_some()
    {
        return Err(ServiceError::Unavailable);
    }
    Ok(state)
}
fn actor(id: &str) -> Result<ActorId, ServiceError> {
    ActorId::new(id).map_err(|_| ServiceError::Unavailable)
}
fn database(error: DatabaseError) -> ServiceError {
    match error {
        DatabaseError::Conflict => ServiceError::Conflict,
        _ => ServiceError::Unavailable,
    }
}
fn forbidden() -> ServiceError {
    ServiceError::Authentication(AuthenticationError::Forbidden)
}
fn value<T: Serialize>(input: &T) -> Result<Value, ServiceError> {
    serde_json::to_value(input).map_err(|_| ServiceError::Unavailable)
}
fn read<T: Wire>(body: Value) -> Result<T, ServiceError> {
    decode(&serde_json::to_vec(&body).map_err(|_| ServiceError::Unavailable)?)
        .map_err(|_| ServiceError::Unavailable)
}

#[derive(Deserialize)]
struct AssignmentInstructionTarget {
    project_id: ProjectId,
    state: ironloom_queue::factory::ExecutionState,
}
