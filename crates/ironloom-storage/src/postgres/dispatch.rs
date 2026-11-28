//! Atomic node/instance claims. Expiration fences dispatch but never proves process termination.
use super::*;
use ironloom_core::{AssignmentId, Counter, NodeId};

const MAX_LEASE_MS: u64 = 300_000;
/// Durable dispatch ownership, separate from the domain's worker execution state.
#[derive(Clone, Debug)]
pub struct DispatchLease {
    /// Claimed assignment; tools remain on this assignment's workspace node.
    pub assignment_id: AssignmentId,
    /// Immutable project scope.
    pub project_id: ProjectId,
    /// Workspace-owning enrolled node.
    pub node_id: NodeId,
    /// Exact service-process instance, independent from shared persistent node identity.
    pub instance: ActorId,
    /// Monotonic fence checked before each dispatch and fenced commit.
    pub fence: Counter,
    /// Database-owned deadline; expiration is not termination confirmation.
    pub expires_at_ms: Counter,
    /// Owning runtime's validated durable job; decode before dispatch.
    pub body: Value,
}
fn ttl(duration: Duration) -> Result<i64, DatabaseError> {
    let value = u64::try_from(duration.as_millis()).map_err(|_| DatabaseError::Conflict)?;
    if value == 0 || value > MAX_LEASE_MS {
        return Err(DatabaseError::Conflict);
    }
    i64::try_from(value).map_err(|_| DatabaseError::Conflict)
}
fn lease(row: sqlx::postgres::PgRow) -> Result<DispatchLease, DatabaseError> {
    Ok(DispatchLease {
        assignment_id: AssignmentId::new(row.get::<String, _>("assignment_id"))
            .map_err(|_| DatabaseError::Corrupt)?,
        project_id: ProjectId::new(row.get::<String, _>("project_id"))
            .map_err(|_| DatabaseError::Corrupt)?,
        node_id: NodeId::new(row.get::<String, _>("owner_node_id"))
            .map_err(|_| DatabaseError::Corrupt)?,
        instance: ActorId::new(row.get::<String, _>("claim_instance"))
            .map_err(|_| DatabaseError::Corrupt)?,
        fence: Counter::new(
            u64::try_from(row.get::<i64, _>("fence")).map_err(|_| DatabaseError::Corrupt)?,
        ),
        expires_at_ms: Counter::new(
            row.get::<String, _>("expires_ms")
                .parse()
                .map_err(|_| DatabaseError::Corrupt)?,
        ),
        body: row.get("body"),
    })
}
impl Store {
    /// Atomically claims one queued job on the selected owning node. Concurrent instances use
    /// SKIP LOCKED; a leased or expired-but-unreconciled job is never silently stolen or retried.
    pub async fn claim_next(
        &self,
        node: &NodeId,
        instance: &ActorId,
        duration: Duration,
    ) -> Result<Option<DispatchLease>, DatabaseError> {
        let ttl = ttl(duration)?;
        sqlx::query("WITH candidate AS (SELECT assignment_id FROM ironloom.dispatch WHERE owner_node_id=$1 AND state='queued' AND NOT suspended AND NOT requires_reconciliation AND claim_node_id IS NULL ORDER BY queued_at,assignment_id FOR UPDATE SKIP LOCKED LIMIT 1) UPDATE ironloom.dispatch d SET claim_node_id=$1,claim_instance=$2,fence=fence+1,lease_expires_at=clock_timestamp()+$3::bigint*interval '1 millisecond',state='claimed' FROM candidate c WHERE d.assignment_id=c.assignment_id AND d.fence<9223372036854775807 RETURNING d.*,floor(extract(epoch from lease_expires_at)*1000)::text AS expires_ms")
            .bind(node.as_str()).bind(instance.as_str()).bind(ttl).fetch_optional(&self.pool).await?.map(lease).transpose()
    }
    /// Renews only a still-live exact instance/fence. An expired claim must enter reconciliation;
    /// it cannot revive itself merely because the same persistent node ID has returned.
    pub async fn renew_claim(
        &self,
        claim: &DispatchLease,
        duration: Duration,
    ) -> Result<DispatchLease, DatabaseError> {
        sqlx::query("UPDATE ironloom.dispatch SET lease_expires_at=clock_timestamp()+$5::bigint*interval '1 millisecond' WHERE assignment_id=$1 AND claim_node_id=$2 AND claim_instance=$3 AND fence=$4 AND state='claimed' AND NOT requires_reconciliation AND lease_expires_at>clock_timestamp() RETURNING *,floor(extract(epoch from lease_expires_at)*1000)::text AS expires_ms")
            .bind(claim.assignment_id.as_str()).bind(claim.node_id.as_str()).bind(claim.instance.as_str()).bind(i64::try_from(claim.fence.get()).map_err(|_|DatabaseError::Conflict)?).bind(ttl(duration)?).fetch_optional(&self.pool).await?.ok_or(DatabaseError::Conflict).and_then(lease)
    }
    /// Returns the selected node's uncertain/expired owned jobs for process and external-mutation
    /// reconciliation. Merely reading this list does not release ownership, workspaces or resources.
    pub async fn uncertain_claims(
        &self,
        node: &NodeId,
        after: Option<&AssignmentId>,
    ) -> Result<Vec<DispatchLease>, DatabaseError> {
        sqlx::query("SELECT *,floor(extract(epoch from lease_expires_at)*1000)::text AS expires_ms FROM ironloom.dispatch WHERE owner_node_id=$1 AND state='claimed' AND (requires_reconciliation OR lease_expires_at<=clock_timestamp()) AND ($2::text IS NULL OR assignment_id COLLATE \"C\">$2 COLLATE \"C\") ORDER BY assignment_id COLLATE \"C\" LIMIT 100")
            .bind(node.as_str()).bind(after.map(AssignmentId::as_str)).fetch_all(&self.pool).await?.into_iter().map(lease).collect()
    }
    /// Fences one exact owner's job after catchable shutdown/failure, without asserting termination.
    /// This remains legal after expiry, so a stale executor can record its own uncertainty safely.
    pub async fn uncertain_claim(&self, claim: &DispatchLease) -> Result<(), DatabaseError> {
        let changed=sqlx::query("UPDATE ironloom.dispatch SET requires_reconciliation=true WHERE assignment_id=$1 AND claim_node_id=$2 AND claim_instance=$3 AND fence=$4 AND state='claimed'")
            .bind(claim.assignment_id.as_str()).bind(claim.node_id.as_str()).bind(claim.instance.as_str()).bind(i64::try_from(claim.fence.get()).map_err(|_|DatabaseError::Conflict)?).execute(&self.pool).await?.rows_affected();
        if changed != 1 {
            return Err(DatabaseError::Conflict);
        }
        Ok(())
    }
}
impl Batch {
    /// Enqueues the owning runtime's validated assignment atomically with command/state/events.
    /// Only the persisted workspace node can claim it; identity sharing does not share local files.
    pub async fn enqueue_dispatch(
        &mut self,
        assignment: &AssignmentId,
        project: &ProjectId,
        node: &NodeId,
        body: &Value,
    ) -> Result<(), DatabaseError> {
        sqlx::query("INSERT INTO ironloom.dispatch(assignment_id,project_id,owner_node_id,state,body) VALUES($1,$2,$3,'queued',$4)")
            .bind(assignment.as_str()).bind(project.as_str()).bind(node.as_str()).bind(body).execute(&mut *self.tx).await?;
        Ok(())
    }
    /// Locks and verifies live dispatch ownership before committing worker decisions/tool starts.
    /// Database serialization prevents an explicit recovery from racing a fenced decision commit.
    pub async fn require_claim(&mut self, claim: &DispatchLease) -> Result<(), DatabaseError> {
        let found:Option<String>=sqlx::query_scalar("SELECT assignment_id FROM ironloom.dispatch WHERE assignment_id=$1 AND project_id=$2 AND owner_node_id=$3 AND claim_node_id=$3 AND claim_instance=$4 AND fence=$5 AND state='claimed' AND NOT requires_reconciliation AND lease_expires_at>clock_timestamp() FOR UPDATE")
            .bind(claim.assignment_id.as_str()).bind(claim.project_id.as_str()).bind(claim.node_id.as_str()).bind(claim.instance.as_str()).bind(i64::try_from(claim.fence.get()).map_err(|_|DatabaseError::Conflict)?).fetch_optional(&mut *self.tx).await?;
        if found.is_none() {
            return Err(DatabaseError::Conflict);
        }
        Ok(())
    }
    /// Checks both ownership and current pause/cancellation before starting external work.
    /// Observational terminal writes use require_claim/owned request identity instead.
    pub async fn require_dispatch(&mut self, claim: &DispatchLease) -> Result<(), DatabaseError> {
        self.require_claim(claim).await?;
        let allowed:bool=sqlx::query_scalar("SELECT NOT suspended AND NOT cancellation_requested FROM ironloom.dispatch WHERE assignment_id=$1")
            .bind(claim.assignment_id.as_str()).fetch_one(&mut *self.tx).await?;
        if !allowed {
            return Err(DatabaseError::Conflict);
        }
        Ok(())
    }
    /// Persists pause/cancellation under the same row lock as all fenced starts. Cancellation
    /// is monotonic. Returns true only when every owned request/process/mutation/path is quiescent.
    pub async fn set_dispatch_control(
        &mut self,
        assignment: &AssignmentId,
        project: &ProjectId,
        suspended: bool,
        cancel: bool,
    ) -> Result<bool, DatabaseError> {
        if suspended && cancel {
            return Err(DatabaseError::Conflict);
        }
        let previous:Option<bool>=sqlx::query_scalar("SELECT cancellation_requested FROM ironloom.dispatch WHERE assignment_id=$1 AND project_id=$2 AND state<>'finished' FOR UPDATE")
            .bind(assignment.as_str()).bind(project.as_str()).fetch_optional(&mut *self.tx).await?;
        let previous = previous.ok_or(DatabaseError::Conflict)?;
        if previous && !cancel {
            return Err(DatabaseError::Conflict);
        }
        sqlx::query("UPDATE ironloom.dispatch SET suspended=$2,cancellation_requested=cancellation_requested OR $3 WHERE assignment_id=$1")
            .bind(assignment.as_str()).bind(suspended).bind(cancel).execute(&mut *self.tx).await?;
        match self.require_quiescent(assignment).await {
            Ok(()) => Ok(true),
            Err(DatabaseError::Conflict) => Ok(false),
            Err(error) => Err(error),
        }
    }
    /// Returns whether this exact live owner has confirmed quiescent execution ledgers.
    pub async fn claim_quiescent(&mut self, claim: &DispatchLease) -> Result<bool, DatabaseError> {
        self.require_claim(claim).await?;
        match self.require_quiescent(&claim.assignment_id).await {
            Ok(()) => Ok(true),
            Err(DatabaseError::Conflict) => Ok(false),
            Err(error) => Err(error),
        }
    }
    /// Yields only a suspended quiescent assignment. Human/tool waits do not retain an executor
    /// claim or pin model residency; resuming acquires a new monotonic dispatch fence.
    pub async fn yield_suspended_claim(
        &mut self,
        claim: &DispatchLease,
    ) -> Result<(), DatabaseError> {
        self.require_claim(claim).await?;
        self.require_quiescent(&claim.assignment_id).await?;
        let changed=sqlx::query("UPDATE ironloom.dispatch SET state='queued',claim_node_id=NULL,claim_instance=NULL,lease_expires_at=NULL WHERE assignment_id=$1 AND suspended AND NOT cancellation_requested")
            .bind(claim.assignment_id.as_str()).execute(&mut *self.tx).await?.rows_affected();
        if changed != 1 {
            return Err(DatabaseError::Conflict);
        }
        Ok(())
    }
    /// Finishes a still-live exact claim in the same transaction as its terminal domain event.
    /// The runtime must already have confirmed owned execution stopped and reconciled mutations.
    pub async fn finish_claim(&mut self, claim: &DispatchLease) -> Result<(), DatabaseError> {
        self.require_claim(claim).await?;
        self.require_quiescent(&claim.assignment_id).await?;
        sqlx::query("UPDATE ironloom.dispatch SET state='finished' WHERE assignment_id=$1")
            .bind(claim.assignment_id.as_str())
            .execute(&mut *self.tx)
            .await?;
        Ok(())
    }
    /// Explicitly releases an uncertain/expired fence only after the runtime has persisted actual
    /// process-termination and external-mutation reconciliation outcomes. The old fence is retained
    /// and incremented on the next claim; lease expiration alone never calls this operation.
    pub async fn reconcile_claim(
        &mut self,
        claim: &DispatchLease,
        retry: bool,
    ) -> Result<(), DatabaseError> {
        // Lock the dispatch row before inspecting child ledgers. A competing start also needs
        // this row via require_claim, so no process/mutation can race the quiescence decision.
        let _: Option<String> = sqlx::query_scalar(
            "SELECT assignment_id FROM ironloom.dispatch WHERE assignment_id=$1 FOR UPDATE",
        )
        .bind(claim.assignment_id.as_str())
        .fetch_optional(&mut *self.tx)
        .await?;
        self.require_quiescent(&claim.assignment_id).await?;
        let changed=sqlx::query("UPDATE ironloom.dispatch SET state=CASE WHEN $6 THEN 'queued' ELSE 'finished' END,claim_node_id=NULL,claim_instance=NULL,lease_expires_at=NULL,requires_reconciliation=false WHERE assignment_id=$1 AND project_id=$2 AND owner_node_id=$3 AND claim_instance=$4 AND fence=$5 AND state='claimed' AND (requires_reconciliation OR lease_expires_at<=clock_timestamp())")
            .bind(claim.assignment_id.as_str()).bind(claim.project_id.as_str()).bind(claim.node_id.as_str()).bind(claim.instance.as_str()).bind(i64::try_from(claim.fence.get()).map_err(|_|DatabaseError::Conflict)?).bind(retry).execute(&mut *self.tx).await?.rows_affected();
        if changed != 1 {
            return Err(DatabaseError::Conflict);
        }
        Ok(())
    }
    async fn require_quiescent(&mut self, assignment: &AssignmentId) -> Result<(), DatabaseError> {
        let blocked:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM ironloom.processes WHERE assignment_id=$1 AND state NOT IN ('stopped','not_started')) OR EXISTS(SELECT 1 FROM ironloom.external_mutations WHERE assignment_id=$1 AND state IN ('pending','uncertain')) OR EXISTS(SELECT 1 FROM ironloom.file_owners WHERE assignment_id=$1) OR EXISTS(SELECT 1 FROM ironloom.inference_requests WHERE assignment_id=$1 AND state NOT IN ('completed','termination_confirmed','not_started'))")
            .bind(assignment.as_str()).fetch_one(&mut *self.tx).await?;
        if blocked {
            return Err(DatabaseError::Conflict);
        }
        Ok(())
    }
}
