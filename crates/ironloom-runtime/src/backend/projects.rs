//! Authorized project catalog. Filesystem loss does not remove metadata or create replacement roots.
use super::*;
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use ironloom_storage::postgres::projects::ProjectMetadata;

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct ProjectCursor {
    time: Counter,
    project: ProjectId,
}
fn cursor(row: &ProjectMetadata) -> Result<ActorId, ServiceError> {
    actor(
        &URL_SAFE_NO_PAD.encode(
            serde_json::to_vec(&ProjectCursor {
                time: Counter::new(row.interacted_ms),
                project: row.project.clone(),
            })
            .map_err(|_| ServiceError::Unavailable)?,
        ),
    )
}
fn decode_after(value: Option<&ActorId>) -> Result<Option<ProjectCursor>, ServiceError> {
    value
        .map(|value| {
            if value.as_str().len() > MAX_CURSOR_LENGTH {
                return Err(ServiceError::Conflict);
            }
            serde_json::from_slice(
                &URL_SAFE_NO_PAD
                    .decode(value.as_str())
                    .map_err(|_| ServiceError::Conflict)?,
            )
            .map_err(|_| ServiceError::Conflict)
        })
        .transpose()
}
impl FactoryBackend {
    /// Lists currently viewable projects even if their node/mount/Git repository is unavailable.
    /// Permission vectors describe present grants and never authorize a later operation.
    pub async fn projects(
        &self,
        session: AuthenticatedSession,
        query: ProjectQuery,
    ) -> Result<ProjectPage, ServiceError> {
        self.authenticated(&session).await?;
        let mut after = decode_after(query.after.as_ref())?;
        if let Some(after) = &after {
            self.require(
                &session.operator_id,
                self.resource(Some(&after.project)).await?,
                Permission::View,
            )
            .await?;
        }
        let mut found = Vec::new();
        loop {
            let rows = self
                .store
                .project_page(
                    after
                        .as_ref()
                        .map(|after| (after.time.get(), &after.project)),
                    MAX_SESSION_PAGE as u32,
                )
                .await
                .map_err(database)?;
            let exhausted = rows.len() < MAX_SESSION_PAGE as usize;
            for row in rows {
                after = Some(ProjectCursor {
                    time: Counter::new(row.interacted_ms),
                    project: row.project.clone(),
                });
                let resource = self.resource(Some(&row.project)).await?;
                match self
                    .require(&session.operator_id, resource.clone(), Permission::View)
                    .await
                {
                    Ok(()) => {}
                    Err(ServiceError::Authentication(AuthenticationError::Forbidden)) => continue,
                    Err(error) => return Err(error),
                }
                if found.len() == query.limit.get() as usize {
                    let last: &(ProjectMetadata, ProjectSummary) =
                        found.last().ok_or(ServiceError::Unavailable)?;
                    let next_after = Some(cursor(&last.0)?);
                    return ProjectPage::new(ProjectPageData {
                        projects: found.into_iter().map(|(_, summary)| summary).collect(),
                        next_after,
                    })
                    .map_err(ServiceError::Validation);
                }
                let mut permissions = vec![Permission::View];
                for permission in [
                    Permission::Operate,
                    Permission::Approve,
                    Permission::Manage,
                    Permission::SelfGrant,
                ] {
                    match self
                        .require(&session.operator_id, resource.clone(), permission.clone())
                        .await
                    {
                        Ok(()) => permissions.push(permission),
                        Err(
                            ServiceError::Authentication(AuthenticationError::Forbidden)
                            | ServiceError::ApprovalRequired,
                        ) => {}
                        Err(error) => return Err(error),
                    }
                }
                let node = row.node.clone().ok_or(ServiceError::Unavailable)?;
                let storage = if node == self.infrastructure.node_id
                    && project_directory_available(&self.infrastructure.projects_root, &row.project)
                        .await
                {
                    ProjectStorageState::Available
                } else {
                    ProjectStorageState::Unavailable
                };
                let summary = ProjectSummary::new(ProjectSummaryData {
                    project_id: row.project.clone(),
                    name: row.name.clone(),
                    owner: row.owner.clone(),
                    owner_node: node,
                    storage,
                    last_human_interaction_ms: Counter::new(row.interacted_ms),
                    permissions,
                })
                .map_err(ServiceError::Validation)?;
                found.push((row, summary));
            }
            if exhausted {
                return ProjectPage::new(ProjectPageData {
                    projects: found.into_iter().map(|(_, summary)| summary).collect(),
                    next_after: None,
                })
                .map_err(ServiceError::Validation);
            }
        }
    }
}
async fn project_directory_available(root: &std::path::Path, project: &ProjectId) -> bool {
    // Only service-assigned single-component IDs identify managed directories. Missing roots and
    // symlinks are unavailable; discovering them never creates a fresh project/workspace.
    if !ironloom_worktrees::files::ordinary_path(project.as_str()) || project.as_str().contains('/')
    {
        return false;
    }
    for path in [
        root.to_owned(),
        root.join(project.as_str()),
        root.join(project.as_str()).join("repository"),
        root.join(project.as_str()).join("repository/.git"),
    ] {
        if !tokio::fs::symlink_metadata(path)
            .await
            .is_ok_and(|metadata| metadata.is_dir() && !metadata.is_symlink())
        {
            return false;
        }
    }
    let mut command = tokio::process::Command::new("/usr/bin/git");
    command
        .env_clear()
        .env("PATH", "/usr/bin:/bin")
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .arg("--no-optional-locks")
        .args([
            "-c",
            "core.hooksPath=/dev/null",
            "-c",
            "core.fsmonitor=false",
            "-C",
        ])
        .arg(root.join(project.as_str()).join("repository"))
        .args(["rev-parse", "--git-dir"])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .kill_on_drop(true);
    tokio::time::timeout(std::time::Duration::from_secs(2), command.status())
        .await
        .is_ok_and(|result| result.is_ok_and(|status| status.success()))
}
