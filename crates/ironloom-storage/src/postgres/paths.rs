//! Durable affected-path ownership, held until actual process/mutation reconciliation.
use super::{dispatch::DispatchLease, *};
use ironloom_core::WorkerId;
use ironloom_worktrees::files::ordinary_path;

/// Independent filesystem namespace within an assignment.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PathArea {
    /// Shared assignment worktree.
    Workspace,
    /// Managed role artifact root.
    Artifacts,
}
impl PathArea {
    fn name(self) -> &'static str {
        match self {
            Self::Workspace => "workspace",
            Self::Artifacts => "artifacts",
        }
    }
}
/// Exact-file or directory-subtree ownership, resolved by the authorized gateway.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PathAccess {
    area: PathArea,
    path: String,
    subtree: bool,
}
impl PathAccess {
    /// Rejects traversal and metadata paths before persistence.
    pub fn new(area: PathArea, path: String, subtree: bool) -> Result<Self, DatabaseError> {
        if !ordinary_path(&path) {
            return Err(DatabaseError::Conflict);
        }
        Ok(Self {
            area,
            path,
            subtree,
        })
    }
    fn overlaps(&self, other: &Self) -> bool {
        self.area == other.area
            && (self.path == other.path
                || self.subtree && below(&other.path, &self.path)
                || other.subtree && below(&self.path, &other.path))
    }
}
fn below(path: &str, parent: &str) -> bool {
    path.strip_prefix(parent)
        .is_some_and(|tail| tail.starts_with('/'))
}
/// Durable activity whose confirmed terminal observation releases path ownership.
#[derive(Clone, Debug)]
pub enum PathOperation {
    /// Owned process plus descendants.
    Process(ActorId),
    /// Journaled external filesystem/Git mutation.
    Mutation(ActorId),
}
impl PathOperation {
    fn parts(&self) -> (&'static str, &str) {
        match self {
            Self::Process(id) => ("process", id.as_str()),
            Self::Mutation(id) => ("mutation", id.as_str()),
        }
    }
}
impl Batch {
    /// Acquires all affected paths atomically before scanning/opening filesystem resources.
    /// Concurrent role tools and Git mutations must use this same ledger. Expiry never releases it.
    pub async fn acquire_paths(
        &mut self,
        claim: &DispatchLease,
        worker: &WorkerId,
        operation: &PathOperation,
        paths: &[PathAccess],
    ) -> Result<(), DatabaseError> {
        const MAX_PATHS: usize = 4096;
        if paths.is_empty() || paths.len() > MAX_PATHS {
            return Err(DatabaseError::Conflict);
        }
        self.require_claim(claim).await?;
        self.path_activity(claim, operation, false).await?;
        let (kind, id) = operation.parts();
        let rows=sqlx::query("SELECT area,relative_path,subtree,operation_kind,operation_id,worker_id,fence FROM ironloom.file_owners WHERE assignment_id=$1")
            .bind(claim.assignment_id.as_str()).fetch_all(&mut *self.tx).await?;
        let mut current = Vec::new();
        for row in rows {
            let area = match row.get::<String, _>("area").as_str() {
                "workspace" => PathArea::Workspace,
                "artifacts" => PathArea::Artifacts,
                _ => return Err(DatabaseError::Corrupt),
            };
            let existing = PathAccess::new(area, row.get("relative_path"), row.get("subtree"))?;
            if row.get::<String, _>("operation_kind") == kind
                && row.get::<String, _>("operation_id") == id
            {
                if row.get::<String, _>("worker_id") != worker.as_str()
                    || row.get::<i64, _>("fence")
                        != i64::try_from(claim.fence.get()).map_err(|_| DatabaseError::Conflict)?
                {
                    return Err(DatabaseError::Conflict);
                }
                current.push(existing);
            } else if paths.iter().any(|path| path.overlaps(&existing)) {
                return Err(DatabaseError::Conflict);
            }
        }
        if !current.is_empty() {
            return if current.len() == paths.len()
                && current.iter().all(|path| paths.contains(path))
            {
                Ok(())
            } else {
                Err(DatabaseError::Conflict)
            };
        }
        for (index, path) in paths.iter().enumerate() {
            if paths[..index].contains(path) {
                return Err(DatabaseError::Conflict);
            }
        }
        for path in paths {
            sqlx::query("INSERT INTO ironloom.file_owners(assignment_id,area,relative_path,subtree,worker_id,operation_kind,operation_id,fence) VALUES($1,$2,$3,$4,$5,$6,$7,$8)")
                .bind(claim.assignment_id.as_str()).bind(path.area.name()).bind(&path.path).bind(path.subtree).bind(worker.as_str()).bind(kind).bind(id).bind(i64::try_from(claim.fence.get()).map_err(|_|DatabaseError::Conflict)?).execute(&mut *self.tx).await?;
        }
        Ok(())
    }
    /// Releases only after a durable terminal observation for this exact assignment/fence.
    /// Works after lease expiry so catchable shutdown/restart can reconcile without inventing stop.
    pub async fn release_paths(
        &mut self,
        claim: &DispatchLease,
        operation: &PathOperation,
    ) -> Result<(), DatabaseError> {
        let owned:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM ironloom.dispatch WHERE assignment_id=$1 AND project_id=$2 AND owner_node_id=$3 AND claim_instance=$4 AND fence=$5 AND state='claimed' FOR UPDATE)")
            .bind(claim.assignment_id.as_str()).bind(claim.project_id.as_str()).bind(claim.node_id.as_str()).bind(claim.instance.as_str()).bind(i64::try_from(claim.fence.get()).map_err(|_|DatabaseError::Conflict)?).fetch_one(&mut *self.tx).await?;
        if !owned {
            return Err(DatabaseError::Conflict);
        }
        self.path_activity(claim, operation, true).await?;
        let (kind, id) = operation.parts();
        sqlx::query("DELETE FROM ironloom.file_owners WHERE assignment_id=$1 AND operation_kind=$2 AND operation_id=$3 AND fence=$4")
            .bind(claim.assignment_id.as_str()).bind(kind).bind(id).bind(i64::try_from(claim.fence.get()).map_err(|_|DatabaseError::Conflict)?).execute(&mut *self.tx).await?;
        Ok(())
    }
    async fn path_activity(
        &mut self,
        claim: &DispatchLease,
        operation: &PathOperation,
        terminal: bool,
    ) -> Result<(), DatabaseError> {
        let (kind, id) = operation.parts();
        let state: Option<String> = if kind == "process" {
            sqlx::query_scalar("SELECT state FROM ironloom.processes WHERE process_id=$1 AND assignment_id=$2 AND fence=$3 AND node_id=$4 FOR UPDATE")
                .bind(id).bind(claim.assignment_id.as_str()).bind(i64::try_from(claim.fence.get()).map_err(|_|DatabaseError::Conflict)?).bind(claim.node_id.as_str()).fetch_optional(&mut *self.tx).await?
        } else {
            sqlx::query_scalar("SELECT state FROM ironloom.external_mutations WHERE mutation_id=$1 AND assignment_id=$2 AND fence=$3 FOR UPDATE")
                .bind(id).bind(claim.assignment_id.as_str()).bind(i64::try_from(claim.fence.get()).map_err(|_|DatabaseError::Conflict)?).fetch_optional(&mut *self.tx).await?
        };
        let state = state.ok_or(DatabaseError::Conflict)?;
        let stopped = if kind == "process" {
            matches!(state.as_str(), "stopped" | "not_started")
        } else {
            matches!(state.as_str(), "applied" | "not_applied")
        };
        if stopped != terminal {
            return Err(DatabaseError::Conflict);
        }
        Ok(())
    }
}
