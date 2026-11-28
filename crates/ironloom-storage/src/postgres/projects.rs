//! Project metadata survives unavailable workspace mounts and is ordered only by human activity.
use super::*;
use ironloom_core::NodeId;

/// Stored project metadata, independent from current filesystem/authorization availability.
#[derive(Clone)]
pub struct ProjectMetadata {
    /// Stable project identity.
    pub project: ProjectId,
    /// Original/current durable owner.
    pub owner: OperatorId,
    /// Human-readable display name.
    pub name: String,
    /// Owning enrolled workspace node; absent is invalid for execution.
    pub node: Option<NodeId>,
    /// Browser-safe milliseconds used consistently in ordering and continuation.
    pub interacted_ms: u64,
}
fn metadata(row: sqlx::postgres::PgRow) -> Result<ProjectMetadata, DatabaseError> {
    Ok(ProjectMetadata {
        project: ProjectId::new(row.get::<String, _>("project_id"))
            .map_err(|_| DatabaseError::Corrupt)?,
        owner: OperatorId::new(row.get::<String, _>("owner_id"))
            .map_err(|_| DatabaseError::Corrupt)?,
        name: row.get("name"),
        node: row
            .get::<Option<String>, _>("owner_node_id")
            .map(NodeId::new)
            .transpose()
            .map_err(|_| DatabaseError::Corrupt)?,
        interacted_ms: row
            .get::<String, _>("interacted_ms")
            .parse()
            .map_err(|_| DatabaseError::Corrupt)?,
    })
}
impl Store {
    /// Reads authoritative metadata without touching or recreating the workspace.
    pub async fn project_metadata(
        &self,
        project: &ProjectId,
    ) -> Result<Option<ProjectMetadata>, DatabaseError> {
        sqlx::query("SELECT *,floor(extract(epoch from last_human_interaction_at)*1000)::text AS interacted_ms FROM ironloom.projects WHERE project_id=$1")
            .bind(project.as_str()).fetch_optional(&self.pool).await?.map(metadata).transpose()
    }
    /// Traverses candidate metadata using a millisecond/ID key. Service checks current grants
    /// before returning any row and continues over denied rows without leaking them in cursors.
    pub async fn project_page(
        &self,
        after: Option<(u64, &ProjectId)>,
        limit: u32,
    ) -> Result<Vec<ProjectMetadata>, DatabaseError> {
        if limit == 0 || limit > 101 {
            return Err(DatabaseError::Conflict);
        }
        sqlx::query("SELECT *,floor(extract(epoch from last_human_interaction_at)*1000)::text AS interacted_ms FROM ironloom.projects WHERE $1::text IS NULL OR (floor(extract(epoch from last_human_interaction_at)*1000),project_id COLLATE \"C\") < ($1::numeric,$2 COLLATE \"C\") ORDER BY floor(extract(epoch from last_human_interaction_at)*1000) DESC,project_id COLLATE \"C\" DESC LIMIT $3")
            .bind(after.map(|(time,_)|time.to_string())).bind(after.map(|(_,id)|id.as_str())).bind(i64::from(limit)).fetch_all(&self.pool).await?.into_iter().map(metadata).collect()
    }
}
