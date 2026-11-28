//! Request identity and confirmed execution observations survive stream/viewer/service loss.
use super::{dispatch::DispatchLease, *};
use ironloom_core::{InferenceId, NodeId, WorkerId};

/// Persisted I/O facts, distinct from an assignment's desired execution state.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum InferenceState {
    /// Identity/request committed before calling an adapter; restart cannot assume no dispatch.
    Prepared,
    /// Adapter dispatch is underway.
    Running,
    /// Cancellation requested, without confirmation.
    CancellationRequested,
    /// Transport/owner interrupted; execution may remain active.
    Uncertain,
    /// Explicit successful terminal response persisted.
    Completed,
    /// Owned execution confirmed ended.
    TerminationConfirmed,
    /// Runtime established that dispatch never happened.
    NotStarted,
}
impl InferenceState {
    fn name(self) -> &'static str {
        match self {
            Self::Prepared => "prepared",
            Self::Running => "running",
            Self::CancellationRequested => "cancellation_requested",
            Self::Uncertain => "uncertain",
            Self::Completed => "completed",
            Self::TerminationConfirmed => "termination_confirmed",
            Self::NotStarted => "not_started",
        }
    }
    fn decode(state: &str) -> Result<Self, DatabaseError> {
        match state {
            "prepared" => Ok(Self::Prepared),
            "running" => Ok(Self::Running),
            "cancellation_requested" => Ok(Self::CancellationRequested),
            "uncertain" => Ok(Self::Uncertain),
            "completed" => Ok(Self::Completed),
            "termination_confirmed" => Ok(Self::TerminationConfirmed),
            "not_started" => Ok(Self::NotStarted),
            _ => Err(DatabaseError::Corrupt),
        }
    }
    /// Only explicit terminal observations allow ownership reconciliation/retry.
    pub fn terminal(self) -> bool {
        matches!(
            self,
            Self::Completed | Self::TerminationConfirmed | Self::NotStarted
        )
    }
    fn permits(self, next: Self) -> bool {
        if self.terminal() {
            return self == next;
        }
        match (self, next) {
            (
                Self::Prepared,
                Self::Running
                | Self::Uncertain
                | Self::NotStarted
                | Self::CancellationRequested
                | Self::TerminationConfirmed,
            ) => true,
            (
                Self::Running | Self::CancellationRequested | Self::Uncertain,
                Self::Completed
                | Self::TerminationConfirmed
                | Self::Uncertain
                | Self::CancellationRequested,
            ) => true,
            _ => self == next,
        }
    }
}
/// Original dispatched identity and outcome. Read/replay never authorizes new dispatch.
pub struct InferenceRecord {
    /// Stable service request identity.
    pub inference: InferenceId,
    /// Immutable assignment scope.
    pub assignment: ironloom_core::AssignmentId,
    /// Actual role worker identity.
    pub worker: WorkerId,
    /// Owning execution node.
    pub node: NodeId,
    /// Exact service process instance, independent of persistent node identity.
    pub instance: ActorId,
    /// Original monotonic dispatch fence.
    pub fence: ironloom_core::Counter,
    /// Latest execution observation; EOF is uncertain.
    pub state: InferenceState,
    /// Exact owning-crate validated request, containing references rather than credentials.
    pub request: Value,
    /// Final/uncertain normalized result metadata when observed.
    pub outcome: Option<Value>,
}
fn row(row: sqlx::postgres::PgRow) -> Result<InferenceRecord, DatabaseError> {
    Ok(InferenceRecord {
        inference: InferenceId::new(row.get::<String, _>("inference_id"))
            .map_err(|_| DatabaseError::Corrupt)?,
        assignment: ironloom_core::AssignmentId::new(row.get::<String, _>("assignment_id"))
            .map_err(|_| DatabaseError::Corrupt)?,
        worker: WorkerId::new(row.get::<String, _>("worker_id"))
            .map_err(|_| DatabaseError::Corrupt)?,
        node: NodeId::new(row.get::<String, _>("node_id")).map_err(|_| DatabaseError::Corrupt)?,
        instance: ActorId::new(row.get::<String, _>("service_instance"))
            .map_err(|_| DatabaseError::Corrupt)?,
        fence: ironloom_core::Counter::new(
            u64::try_from(row.get::<i64, _>("fence")).map_err(|_| DatabaseError::Corrupt)?,
        ),
        state: InferenceState::decode(&row.get::<String, _>("state"))?,
        request: row.get("request"),
        outcome: row.get("outcome"),
    })
}
impl Store {
    /// Returns original request facts for authorized runtime recovery; never dispatches or retries.
    pub async fn inference_record(
        &self,
        id: &InferenceId,
    ) -> Result<Option<InferenceRecord>, DatabaseError> {
        sqlx::query("SELECT * FROM ironloom.inference_requests WHERE inference_id=$1")
            .bind(id.as_str())
            .fetch_optional(&self.pool)
            .await?
            .map(row)
            .transpose()
    }
}
impl Batch {
    /// Persists identity before adapter I/O. False means an identical prior request exists and MUST
    /// NOT dispatch again; changed worker/scope/payload conflicts even after a later claim fence.
    pub async fn prepare_inference(
        &mut self,
        claim: &DispatchLease,
        worker: &WorkerId,
        id: &InferenceId,
        request: &Value,
    ) -> Result<bool, DatabaseError> {
        self.require_dispatch(claim).await?;
        if request.get("assignment_id").and_then(Value::as_str)
            != Some(claim.assignment_id.as_str())
            || request.get("worker_id").and_then(Value::as_str) != Some(worker.as_str())
            || request.get("inference_id").and_then(Value::as_str) != Some(id.as_str())
        {
            return Err(DatabaseError::Conflict);
        }
        let inserted=sqlx::query("INSERT INTO ironloom.inference_requests(inference_id,assignment_id,worker_id,node_id,service_instance,fence,state,request) VALUES($1,$2,$3,$4,$5,$6,'prepared',$7) ON CONFLICT DO NOTHING")
            .bind(id.as_str()).bind(claim.assignment_id.as_str()).bind(worker.as_str()).bind(claim.node_id.as_str()).bind(claim.instance.as_str()).bind(i64::try_from(claim.fence.get()).map_err(|_|DatabaseError::Conflict)?).bind(request).execute(&mut *self.tx).await?.rows_affected();
        if inserted == 1 {
            return Ok(true);
        }
        let existing = row(sqlx::query(
            "SELECT * FROM ironloom.inference_requests WHERE inference_id=$1 FOR UPDATE",
        )
        .bind(id.as_str())
        .fetch_one(&mut *self.tx)
        .await?)?;
        if existing.assignment != claim.assignment_id
            || existing.worker != *worker
            || existing.request != *request
        {
            return Err(DatabaseError::Conflict);
        }
        Ok(false)
    }
    /// Records only this request owner's observations, including after lease expiry. Facts do not
    /// authorize another decision/tool call. Terminal outcomes cannot be overwritten or regressed.
    pub async fn observe_inference(
        &mut self,
        claim: &DispatchLease,
        id: &InferenceId,
        state: InferenceState,
        outcome: Option<&Value>,
    ) -> Result<(), DatabaseError> {
        // Keep the same dispatcher->request lock order as preparation and control operations.
        let _: Option<String> = sqlx::query_scalar(
            "SELECT assignment_id FROM ironloom.dispatch WHERE assignment_id=$1 FOR UPDATE",
        )
        .bind(claim.assignment_id.as_str())
        .fetch_optional(&mut *self.tx)
        .await?;
        let previous = row(sqlx::query(
            "SELECT * FROM ironloom.inference_requests WHERE inference_id=$1 FOR UPDATE",
        )
        .bind(id.as_str())
        .fetch_optional(&mut *self.tx)
        .await?
        .ok_or(DatabaseError::NotFound)?)?;
        if previous.assignment != claim.assignment_id
            || previous.node != claim.node_id
            || previous.instance != claim.instance
            || previous.fence != claim.fence
            || !previous.state.permits(state)
        {
            return Err(DatabaseError::Conflict);
        }
        if previous.state.terminal() {
            return if previous.outcome.as_ref() == outcome {
                Ok(())
            } else {
                Err(DatabaseError::Conflict)
            };
        }
        sqlx::query(
            "UPDATE ironloom.inference_requests SET state=$2,outcome=$3 WHERE inference_id=$1",
        )
        .bind(id.as_str())
        .bind(state.name())
        .bind(outcome)
        .execute(&mut *self.tx)
        .await?;
        Ok(())
    }
}
