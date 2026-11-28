//! PostgreSQL persistence. Transactions own idempotency, scope serialization and event ordering.
use ironloom_core::{ActorId, CommandId, ConversationId, OperatorId, ProjectId};
use serde_json::Value;
use sha2::{Digest, Sha256};
use sqlx::{PgPool, Postgres, Row, Transaction, postgres::PgPoolOptions};
use std::time::Duration;
use thiserror::Error;

const CONNECTIONS: u32 = 16;
const ACQUIRE_TIMEOUT: Duration = Duration::from_secs(10);
const UNIQUE_VIOLATION: &str = "23505";

/// Redacted durable storage failures; callers never receive SQL or connection secrets.
#[derive(Debug, Error)]
pub enum DatabaseError {
    /// The selected database could not be reached or a transaction failed.
    #[error("selected database unavailable")]
    Unavailable,
    /// Data did not satisfy the current installation contract; never repair/replace it automatically.
    #[error("stored record invalid")]
    Corrupt,
    /// Optimistic revision, identity or ownership does not match.
    #[error("durable state conflict")]
    Conflict,
    /// A requested record does not exist.
    #[error("record not found")]
    NotFound,
}
impl From<sqlx::Error> for DatabaseError {
    fn from(error: sqlx::Error) -> Self {
        if error
            .as_database_error()
            .is_some_and(|error| error.code().as_deref() == Some(UNIQUE_VIOLATION))
        {
            Self::Conflict
        } else {
            Self::Unavailable
        }
    }
}
/// Validated domain payload plus storage-owned revision and scope.
#[derive(Clone, Debug)]
pub struct Record {
    /// Current revision, incremented atomically by storage.
    pub revision: u64,
    /// Owning project; absent for installation configuration.
    pub project: Option<ProjectId>,
    /// Serialized owning-crate model; decode and validate independently before domain use.
    pub body: Value,
}
/// Shared-installation database handle; connecting never initializes or replaces storage.
#[derive(Clone)]
pub struct Store {
    pool: PgPool,
}
impl Store {
    /// Connects only to the configured server; no fallback server or schema is created.
    pub async fn connect(url: &str) -> Result<Self, DatabaseError> {
        let pool = PgPoolOptions::new()
            .max_connections(CONNECTIONS)
            .acquire_timeout(ACQUIRE_TIMEOUT)
            .connect(url)
            .await?;
        Ok(Self { pool })
    }
    /// Builds a handle around a runtime-owned pool, useful for disposable functional fixtures.
    pub fn from_pool(pool: PgPool) -> Self {
        Self { pool }
    }
    /// Returns the installation identity; unavailable/corrupt storage never means first-time setup.
    pub async fn installation(&self) -> Result<(ActorId, Option<OperatorId>, bool), DatabaseError> {
        let row = sqlx::query("SELECT installation_id, administrator_id, grants_initialized_at IS NOT NULL AS grants_ready FROM ironloom.installation WHERE singleton")
            .fetch_optional(&self.pool).await?.ok_or(DatabaseError::NotFound)?;
        let id: String = row.get("installation_id");
        let admin: Option<String> = row.get("administrator_id");
        Ok((
            ActorId::new(id).map_err(|_| DatabaseError::Corrupt)?,
            admin
                .map(OperatorId::new)
                .transpose()
                .map_err(|_| DatabaseError::Corrupt)?,
            row.get("grants_ready"),
        ))
    }
    /// Initializes an explicitly selected empty database once; existing layouts are not upgraded.
    pub async fn initialize(
        &self,
        installation: &ActorId,
        token: &[u8],
    ) -> Result<(), DatabaseError> {
        let mut connection = self.pool.acquire().await?;
        let mut outer = sqlx::Connection::begin(&mut *connection).await?;
        crate::factory::initialize_schema(&mut outer)
            .await
            .map_err(|error| match error {
                crate::factory::InitializationError::AlreadyInitialized => DatabaseError::Conflict,
                _ => DatabaseError::Unavailable,
            })?;
        sqlx::query("INSERT INTO ironloom.installation (installation_id, bootstrap_token_hash) VALUES ($1, $2)")
            .bind(installation.as_str()).bind(digest(token)).execute(&mut *outer).await?;
        outer.commit().await?;
        Ok(())
    }
    /// Checks the unconsumed setup token for initial account provisioning, without granting admin.
    pub async fn setup_token_valid(&self, token: &[u8]) -> Result<bool, DatabaseError> {
        Ok(sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM ironloom.installation WHERE administrator_id IS NULL AND bootstrap_token_hash = $1)")
            .bind(digest(token)).fetch_one(&self.pool).await?)
    }
    /// Creates a local identity atomically; password hashing happens outside persistence.
    pub async fn register_local(
        &self,
        operator: &OperatorId,
        username: &str,
        password_hash: &str,
    ) -> Result<(), DatabaseError> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("INSERT INTO ironloom.operators (operator_id) VALUES ($1)")
            .bind(operator.as_str())
            .execute(&mut *tx)
            .await?;
        sqlx::query("INSERT INTO ironloom.local_logins (operator_id, username, password_hash) VALUES ($1,$2,$3)")
            .bind(operator.as_str()).bind(username).bind(password_hash).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(())
    }
    /// Provisions the initial local account only while the one-time setup token remains valid,
    /// locking bootstrap against concurrent redemption. It grants no administrator authority.
    pub async fn register_initial(
        &self,
        operator: &OperatorId,
        username: &str,
        password_hash: &str,
        token: &[u8],
    ) -> Result<(), DatabaseError> {
        let mut tx = self.pool.begin().await?;
        let valid=sqlx::query_scalar::<_,bool>("SELECT true FROM ironloom.installation WHERE singleton AND administrator_id IS NULL AND bootstrap_token_hash=$1 FOR UPDATE")
            .bind(digest(token)).fetch_optional(&mut *tx).await?.unwrap_or(false);
        if !valid {
            return Err(DatabaseError::Conflict);
        }
        sqlx::query("INSERT INTO ironloom.operators(operator_id) VALUES($1)")
            .bind(operator.as_str())
            .execute(&mut *tx)
            .await?;
        sqlx::query("INSERT INTO ironloom.local_logins(operator_id,username,password_hash) VALUES($1,$2,$3)")
            .bind(operator.as_str()).bind(username).bind(password_hash).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(())
    }
    /// Finds a local password hash; no secret is returned through public service responses.
    pub async fn local_identity(
        &self,
        username: &str,
    ) -> Result<Option<(OperatorId, String)>, DatabaseError> {
        let row = sqlx::query(
            "SELECT operator_id, password_hash FROM ironloom.local_logins WHERE username = $1",
        )
        .bind(username)
        .fetch_optional(&self.pool)
        .await?;
        row.map(|row| {
            let id: String = row.get("operator_id");
            Ok((
                OperatorId::new(id).map_err(|_| DatabaseError::Corrupt)?,
                row.get("password_hash"),
            ))
        })
        .transpose()
    }
    /// Maps a verified OIDC issuer/subject to one durable account; email is never identity authority.
    pub async fn oidc_identity(
        &self,
        issuer: &str,
        subject: &str,
    ) -> Result<OperatorId, DatabaseError> {
        let mut tx = self.pool.begin().await?;
        scope_lock(&mut tx, &format!("oidc:{issuer}:{subject}")).await?;
        if let Some(id) = sqlx::query_scalar::<_, String>(
            "SELECT operator_id FROM ironloom.oidc_logins WHERE issuer=$1 AND subject=$2",
        )
        .bind(issuer)
        .bind(subject)
        .fetch_optional(&mut *tx)
        .await?
        {
            return OperatorId::new(id).map_err(|_| DatabaseError::Corrupt);
        }
        let id = OperatorId::new(uuid::Uuid::new_v4().to_string())
            .map_err(|_| DatabaseError::Corrupt)?;
        sqlx::query("INSERT INTO ironloom.operators VALUES ($1)")
            .bind(id.as_str())
            .execute(&mut *tx)
            .await?;
        sqlx::query("INSERT INTO ironloom.oidc_logins VALUES ($1,$2,$3)")
            .bind(issuer)
            .bind(subject)
            .bind(id.as_str())
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(id)
    }
    /// Persists a hashed opaque session and CSRF proof; no provider tokens are stored here.
    pub async fn save_session(
        &self,
        session: &ActorId,
        operator: &OperatorId,
        token: &[u8],
        csrf: &[u8],
        method: &str,
        lifetime_seconds: i64,
    ) -> Result<u64, DatabaseError> {
        let expiry: i64 = sqlx::query_scalar("INSERT INTO ironloom.sessions (session_id,operator_id,token_hash,csrf_hash,method,expires_at) VALUES ($1,$2,$3,$4,$5,now()+make_interval(secs=>$6::double precision)) RETURNING (extract(epoch FROM expires_at)*1000)::bigint")
            .bind(session.as_str()).bind(operator.as_str()).bind(digest(token)).bind(digest(csrf)).bind(method).bind(lifetime_seconds as f64).fetch_one(&self.pool).await?;
        u64::try_from(expiry).map_err(|_| DatabaseError::Corrupt)
    }
    /// Resolves an unexpired, unrevoked session with optional CSRF proof for mutations.
    pub async fn session(
        &self,
        token: &[u8],
        csrf: Option<&[u8]>,
    ) -> Result<Option<(OperatorId, ActorId, String, u64)>, DatabaseError> {
        let row = sqlx::query("SELECT operator_id,session_id,method,(extract(epoch FROM expires_at)*1000)::bigint AS expiry FROM ironloom.sessions WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now() AND ($2::bytea IS NULL OR csrf_hash=$2)")
            .bind(digest(token)).bind(csrf.map(digest)).fetch_optional(&self.pool).await?;
        row.map(|row| {
            let operator: String = row.get("operator_id");
            let session: String = row.get("session_id");
            let expiry: i64 = row.get("expiry");
            Ok((
                OperatorId::new(operator).map_err(|_| DatabaseError::Corrupt)?,
                ActorId::new(session).map_err(|_| DatabaseError::Corrupt)?,
                row.get("method"),
                u64::try_from(expiry).map_err(|_| DatabaseError::Corrupt)?,
            ))
        })
        .transpose()
    }
    /// Revokes only the authenticated service session.
    pub async fn revoke_session(
        &self,
        session: &ActorId,
        operator: &OperatorId,
    ) -> Result<(), DatabaseError> {
        sqlx::query(
            "UPDATE ironloom.sessions SET revoked_at=now() WHERE session_id=$1 AND operator_id=$2",
        )
        .bind(session.as_str())
        .bind(operator.as_str())
        .execute(&self.pool)
        .await?;
        Ok(())
    }
    /// Atomically consumes bootstrap for one account and retains recoverable grant initialization.
    pub async fn redeem_bootstrap(
        &self,
        operator: &OperatorId,
        token: &[u8],
    ) -> Result<ActorId, DatabaseError> {
        let row = sqlx::query("UPDATE ironloom.installation SET administrator_id=$1,bootstrap_consumed_at=now(),bootstrap_token_hash=NULL WHERE singleton AND administrator_id IS NULL AND bootstrap_token_hash=$2 RETURNING installation_id")
            .bind(operator.as_str()).bind(digest(token)).fetch_optional(&self.pool).await?.ok_or(DatabaseError::Conflict)?;
        ActorId::new(row.get::<String, _>("installation_id")).map_err(|_| DatabaseError::Corrupt)
    }
    /// Marks grant recovery complete only for the fixed bootstrap account.
    pub async fn bootstrap_grants_ready(&self, operator: &OperatorId) -> Result<(), DatabaseError> {
        let result=sqlx::query("UPDATE ironloom.installation SET grants_initialized_at=now() WHERE singleton AND administrator_id=$1")
            .bind(operator.as_str()).execute(&self.pool).await?;
        if result.rows_affected() != 1 {
            return Err(DatabaseError::Conflict);
        }
        Ok(())
    }
    /// Begins one idempotent operation and locks its durable scope across all service instances.
    pub async fn begin(
        &self,
        operator: &OperatorId,
        command: &CommandId,
        payload: &Value,
        scope: &ActorId,
    ) -> Result<Operation, DatabaseError> {
        let fingerprint = hex::encode(digest(
            &serde_json::to_vec(payload).map_err(|_| DatabaseError::Corrupt)?,
        ));
        self.begin_fingerprint(operator, command, &fingerprint, scope)
            .await
    }
    async fn begin_fingerprint(
        &self,
        operator: &OperatorId,
        command: &CommandId,
        fingerprint: &str,
        scope: &ActorId,
    ) -> Result<Operation, DatabaseError> {
        let mut tx = self.pool.begin().await?;
        scope_lock(
            &mut tx,
            &format!("command:{}:{}", operator.as_str(), command.as_str()),
        )
        .await?;
        if let Some(row)=sqlx::query("SELECT payload_hash,receipt FROM ironloom.commands WHERE operator_id=$1 AND command_id=$2")
            .bind(operator.as_str()).bind(command.as_str()).fetch_optional(&mut *tx).await? {
            if row.get::<String,_>("payload_hash")!=fingerprint { return Err(DatabaseError::Conflict); }
            let receipt:Option<Value>=row.get("receipt");
            return receipt.map(Operation::Replay).ok_or(DatabaseError::Corrupt);
        }
        scope_lock(&mut tx, scope.as_str()).await?;
        sqlx::query(
            "INSERT INTO ironloom.commands(operator_id,command_id,payload_hash) VALUES($1,$2,$3)",
        )
        .bind(operator.as_str())
        .bind(command.as_str())
        .bind(fingerprint)
        .execute(&mut *tx)
        .await?;
        Ok(Operation::Write(Box::new(Batch {
            tx,
            operator: operator.clone(),
            command: command.clone(),
        })))
    }
    /// Reads a current record. Decode using the owning crate's validated type before use.
    pub async fn get(&self, kind: &str, id: &ActorId) -> Result<Option<Record>, DatabaseError> {
        let row=sqlx::query("SELECT revision::text,project_id,body FROM ironloom.records WHERE kind=$1 AND record_id=$2")
            .bind(kind).bind(id.as_str()).fetch_optional(&self.pool).await?;
        row.map(record).transpose()
    }
    /// Lists records in a selected scope, using bounded stable identity pagination.
    pub async fn list(
        &self,
        kind: &str,
        project: Option<&ProjectId>,
        after: Option<&ActorId>,
        limit: i64,
    ) -> Result<Vec<(ActorId, Record)>, DatabaseError> {
        let rows=sqlx::query("SELECT record_id,revision::text,project_id,body FROM ironloom.records WHERE kind=$1 AND ($2::text IS NULL OR project_id=$2) AND ($3::text IS NULL OR record_id>$3) ORDER BY record_id LIMIT $4")
            .bind(kind).bind(project.map(ProjectId::as_str)).bind(after.map(ActorId::as_str)).bind(limit.clamp(1,100)).fetch_all(&self.pool).await?;
        rows.into_iter()
            .map(|row| {
                let id = ActorId::new(row.get::<String, _>("record_id"))
                    .map_err(|_| DatabaseError::Corrupt)?;
                Ok((id, record(row)?))
            })
            .collect()
    }
    /// Fetches durable events strictly after the cursor, independently of viewer connection lifetime.
    pub async fn events(
        &self,
        conversation: &ConversationId,
        after: u64,
        limit: i64,
    ) -> Result<Vec<Value>, DatabaseError> {
        let rows=sqlx::query_scalar("SELECT payload FROM ironloom.events WHERE conversation_id=$1 AND sequence>$2::text::numeric ORDER BY sequence LIMIT $3")
            .bind(conversation.as_str()).bind(after.to_string()).bind(limit.clamp(1,1000)).fetch_all(&self.pool).await?;
        Ok(rows)
    }
    /// Checks a trusted service session identity for expiry/revocation before native/direct operations.
    pub async fn session_active(
        &self,
        session: &ActorId,
        operator: &OperatorId,
    ) -> Result<bool, DatabaseError> {
        Ok(sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM ironloom.sessions WHERE session_id=$1 AND operator_id=$2 AND revoked_at IS NULL AND expires_at>now())")
            .bind(session.as_str()).bind(operator.as_str()).fetch_one(&self.pool).await?)
    }
    /// Stores encrypted, expiring single-use OIDC state. No code, verifier or nonce is stored plaintext.
    pub async fn save_oidc_attempt(
        &self,
        state: &[u8],
        protected: &[u8],
        lifetime_seconds: i64,
    ) -> Result<(), DatabaseError> {
        sqlx::query("INSERT INTO ironloom.oidc_attempts(state_hash,protected_context,expires_at) VALUES($1,$2,now()+make_interval(secs=>$3::double precision))")
            .bind(digest(state)).bind(protected).bind(lifetime_seconds as f64).execute(&self.pool).await?;
        Ok(())
    }
    /// Consumes login state atomically; an expired or replayed callback cannot authenticate.
    pub async fn consume_oidc_attempt(
        &self,
        state: &[u8],
    ) -> Result<Option<Vec<u8>>, DatabaseError> {
        Ok(sqlx::query_scalar("DELETE FROM ironloom.oidc_attempts WHERE state_hash=$1 AND expires_at>now() RETURNING protected_context")
            .bind(digest(state)).fetch_optional(&self.pool).await?)
    }
    /// Returns only protected credential material to the trusted resolver, after its live use check.
    pub async fn credential_ciphertext(
        &self,
        id: &ironloom_core::CredentialId,
    ) -> Result<Option<ProtectedCredential>, DatabaseError> {
        let row=sqlx::query("SELECT owner_id,revision,protected_secret FROM ironloom.credentials WHERE credential_id=$1 AND deleted_at IS NULL")
            .bind(id.as_str()).fetch_optional(&self.pool).await?;
        row.map(|row| {
            let owner: String = row.get("owner_id");
            let revision: i64 = row.get("revision");
            Ok(ProtectedCredential {
                owner: OperatorId::new(owner).map_err(|_| DatabaseError::Corrupt)?,
                revision: u64::try_from(revision).map_err(|_| DatabaseError::Corrupt)?,
                ciphertext: row.get("protected_secret"),
            })
        })
        .transpose()
    }
    /// Returns pending already-audited grant intents for retry after a cross-service interruption.
    pub async fn grant_intents(&self) -> Result<Vec<(ActorId, Value)>, DatabaseError> {
        let rows=sqlx::query("SELECT operation_id,body FROM ironloom.authorization_outbox WHERE completed_at IS NULL ORDER BY operation_id LIMIT 100")
            .fetch_all(&self.pool).await?;
        rows.into_iter()
            .map(|row| {
                Ok((
                    ActorId::new(row.get::<String, _>("operation_id"))
                        .map_err(|_| DatabaseError::Corrupt)?,
                    row.get("body"),
                ))
            })
            .collect()
    }
    /// Marks one applied grant intent complete, without assuming a distributed transaction.
    pub async fn grant_applied(&self, id: &ActorId) -> Result<(), DatabaseError> {
        sqlx::query(
            "UPDATE ironloom.authorization_outbox SET completed_at=now() WHERE operation_id=$1",
        )
        .bind(id.as_str())
        .execute(&self.pool)
        .await?;
        Ok(())
    }
    /// Locks the installation's initial-grant operation across nodes. The completion recheck,
    /// external idempotent grant write and ready update must occur while this guard is held.
    pub async fn bootstrap_initialization(
        &self,
        operator: &OperatorId,
    ) -> Result<BootstrapInitialization, DatabaseError> {
        let mut tx = self.pool.begin().await?;
        scope_lock(&mut tx, "installation:bootstrap-grants").await?;
        let initialized:Option<bool>=sqlx::query_scalar("SELECT grants_initialized_at IS NOT NULL FROM ironloom.installation WHERE singleton AND administrator_id=$1 FOR UPDATE")
            .bind(operator.as_str()).fetch_optional(&mut *tx).await?;
        Ok(BootstrapInitialization {
            tx,
            operator: operator.clone(),
            initialized: initialized.ok_or(DatabaseError::Conflict)?,
        })
    }
    /// Serializes fresh authorization binding initialization across installation nodes.
    /// The returned transaction must be committed explicitly; failure never selects another binding.
    pub async fn authorization_initialization(
        &self,
    ) -> Result<AuthorizationInitialization, DatabaseError> {
        let mut tx = self.pool.begin().await?;
        scope_lock(&mut tx, "installation:authorization-initialization").await?;
        let body: Option<Value> = sqlx::query_scalar(
            "SELECT body FROM ironloom.records WHERE kind='authorization' AND record_id='binding'",
        )
        .fetch_optional(&mut *tx)
        .await?;
        Ok(AuthorizationInitialization { tx, body })
    }
    /// Stops pool clients without stopping a database potentially serving other nodes.
    pub async fn close(&self) {
        self.pool.close().await;
    }
}
/// Result of a globally serialized command identity check.
pub enum Operation {
    /// Existing committed outcome; callers must never dispatch again.
    Replay(Value),
    /// New command transaction; dropping it rolls back all effects.
    Write(Box<Batch>),
}
/// One locked durable mutation; raw SQL and connection ownership remain in storage.
pub struct Batch {
    tx: Transaction<'static, Postgres>,
    operator: OperatorId,
    command: CommandId,
}
impl Batch {
    /// Reads and locks a record in this transaction.
    pub async fn get(&mut self, kind: &str, id: &ActorId) -> Result<Option<Record>, DatabaseError> {
        sqlx::query("SELECT revision::text,project_id,body FROM ironloom.records WHERE kind=$1 AND record_id=$2 FOR UPDATE")
            .bind(kind).bind(id.as_str()).fetch_optional(&mut *self.tx).await?.map(record).transpose()
    }
    /// Inserts or compare-and-swaps a record. None requires absence, never overwrites unknown data.
    pub async fn put(
        &mut self,
        kind: &str,
        id: &ActorId,
        project: Option<&ProjectId>,
        assignment: Option<&ActorId>,
        expected: Option<u64>,
        body: &Value,
    ) -> Result<u64, DatabaseError> {
        let next = expected
            .unwrap_or(0)
            .checked_add(1)
            .ok_or(DatabaseError::Conflict)?;
        let affected = if let Some(previous) = expected {
            sqlx::query("UPDATE ironloom.records SET body=$1,revision=$2::text::numeric,updated_at=now() WHERE kind=$3 AND record_id=$4 AND revision=$5::text::numeric")
                .bind(body).bind(next.to_string()).bind(kind).bind(id.as_str()).bind(previous.to_string()).execute(&mut *self.tx).await?.rows_affected()
        } else {
            sqlx::query("INSERT INTO ironloom.records(kind,record_id,project_id,assignment_id,revision,body) VALUES($1,$2,$3,$4,1,$5) ON CONFLICT DO NOTHING")
                .bind(kind).bind(id.as_str()).bind(project.map(ProjectId::as_str)).bind(assignment.map(ActorId::as_str)).bind(body).execute(&mut *self.tx).await?.rows_affected()
        };
        if affected != 1 {
            return Err(DatabaseError::Conflict);
        }
        Ok(next)
    }
    /// Deletes only an explicitly version-matched record; lesson retention is never tied to cleanup.
    pub async fn delete(
        &mut self,
        kind: &str,
        id: &ActorId,
        expected: u64,
    ) -> Result<(), DatabaseError> {
        let result=sqlx::query("DELETE FROM ironloom.records WHERE kind=$1 AND record_id=$2 AND revision=$3::text::numeric")
            .bind(kind).bind(id.as_str()).bind(expected.to_string()).execute(&mut *self.tx).await?;
        if result.rows_affected() != 1 {
            return Err(DatabaseError::Conflict);
        }
        Ok(())
    }
    /// Creates project metadata independently from its filesystem folder.
    pub async fn create_project(
        &mut self,
        project: &ProjectId,
        name: &str,
        node: Option<&ActorId>,
    ) -> Result<(), DatabaseError> {
        sqlx::query("INSERT INTO ironloom.projects(project_id,owner_id,name,owner_node_id) VALUES($1,$2,$3,$4)")
            .bind(project.as_str()).bind(self.operator.as_str()).bind(name).bind(node.map(ActorId::as_str)).execute(&mut *self.tx).await?;
        Ok(())
    }
    /// Allocates an empty durable conversation; it does not dispatch a turn.
    pub async fn create_conversation(
        &mut self,
        id: &ConversationId,
        project: &ProjectId,
    ) -> Result<(), DatabaseError> {
        sqlx::query("INSERT INTO ironloom.conversations(conversation_id,project_id) VALUES($1,$2)")
            .bind(id.as_str())
            .bind(project.as_str())
            .execute(&mut *self.tx)
            .await?;
        sqlx::query("UPDATE ironloom.commands SET conversation_id=$1 WHERE operator_id=$2 AND command_id=$3")
            .bind(id.as_str()).bind(self.operator.as_str()).bind(self.command.as_str()).execute(&mut *self.tx).await?;
        Ok(())
    }
    /// Updates dashboard ordering only for an authenticated human interaction.
    pub async fn human_interaction(&mut self, project: &ProjectId) -> Result<(), DatabaseError> {
        sqlx::query(
            "UPDATE ironloom.projects SET last_human_interaction_at=now() WHERE project_id=$1",
        )
        .bind(project.as_str())
        .execute(&mut *self.tx)
        .await?;
        Ok(())
    }
    /// Allocates the next durable event sequence under a row lock.
    pub async fn next_sequence(
        &mut self,
        conversation: &ConversationId,
    ) -> Result<u64, DatabaseError> {
        let value:String=sqlx::query_scalar("UPDATE ironloom.conversations SET next_event_sequence=next_event_sequence+1 WHERE conversation_id=$1 RETURNING (next_event_sequence-1)::text")
            .bind(conversation.as_str()).fetch_one(&mut *self.tx).await?;
        value.parse().map_err(|_| DatabaseError::Corrupt)
    }
    /// Persists an event and notification/dispatch outbox record in the command transaction.
    pub async fn append_event(
        &mut self,
        conversation: &ConversationId,
        sequence: u64,
        event: &Value,
    ) -> Result<(), DatabaseError> {
        sqlx::query("UPDATE ironloom.commands SET conversation_id=$1 WHERE operator_id=$2 AND command_id=$3")
            .bind(conversation.as_str()).bind(self.operator.as_str()).bind(self.command.as_str()).execute(&mut *self.tx).await?;
        sqlx::query("INSERT INTO ironloom.events VALUES($1,$2::text::numeric,$3,$4,$5)")
            .bind(conversation.as_str())
            .bind(sequence.to_string())
            .bind(self.operator.as_str())
            .bind(self.command.as_str())
            .bind(event)
            .execute(&mut *self.tx)
            .await?;
        sqlx::query(
            "INSERT INTO ironloom.outbox(conversation_id,sequence) VALUES($1,$2::text::numeric)",
        )
        .bind(conversation.as_str())
        .bind(sequence.to_string())
        .execute(&mut *self.tx)
        .await?;
        Ok(())
    }
    /// Writes protected secret material atomically with its metadata and audit, never a worker prompt.
    pub async fn write_credential(
        &mut self,
        id: &ironloom_core::CredentialId,
        owner: &OperatorId,
        expected: Option<u64>,
        protected: &[u8],
    ) -> Result<(), DatabaseError> {
        let affected = if let Some(revision) = expected {
            sqlx::query("UPDATE ironloom.credentials SET protected_secret=$1,revision=revision+1 WHERE credential_id=$2 AND owner_id=$3 AND revision=$4 AND deleted_at IS NULL")
                .bind(protected).bind(id.as_str()).bind(owner.as_str()).bind(i64::try_from(revision).map_err(|_|DatabaseError::Conflict)?).execute(&mut *self.tx).await?.rows_affected()
        } else {
            sqlx::query("INSERT INTO ironloom.credentials(credential_id,owner_id,protected_secret) VALUES($1,$2,$3) ON CONFLICT DO NOTHING")
                .bind(id.as_str()).bind(owner.as_str()).bind(protected).execute(&mut *self.tx).await?.rows_affected()
        };
        if affected != 1 {
            return Err(DatabaseError::Conflict);
        }
        Ok(())
    }
    /// Explicitly deletes version-matched private material; no cleanup path calls this implicitly.
    pub async fn delete_credential(
        &mut self,
        id: &ironloom_core::CredentialId,
        expected: u64,
    ) -> Result<(), DatabaseError> {
        let result =
            sqlx::query("DELETE FROM ironloom.credentials WHERE credential_id=$1 AND revision=$2")
                .bind(id.as_str())
                .bind(i64::try_from(expected).map_err(|_| DatabaseError::Conflict)?)
                .execute(&mut *self.tx)
                .await?;
        if result.rows_affected() != 1 {
            return Err(DatabaseError::Conflict);
        }
        Ok(())
    }
    /// Records a permission mutation for retry against OpenFGA without assuming cross-service atomicity.
    pub async fn grant_intent(&mut self, id: &ActorId, body: &Value) -> Result<(), DatabaseError> {
        sqlx::query("INSERT INTO ironloom.authorization_outbox(operation_id,body) VALUES($1,$2) ON CONFLICT DO NOTHING")
            .bind(id.as_str()).bind(body).execute(&mut *self.tx).await?;
        Ok(())
    }
    /// Adds a redacted resource operation audit record atomically with the state change.
    pub async fn audit(
        &mut self,
        project: Option<&ProjectId>,
        operation: &str,
        body: &Value,
    ) -> Result<(), DatabaseError> {
        sqlx::query(
            "INSERT INTO ironloom.audit(operator_id,project_id,operation,body) VALUES($1,$2,$3,$4)",
        )
        .bind(self.operator.as_str())
        .bind(project.map(ProjectId::as_str))
        .bind(operation)
        .bind(body)
        .execute(&mut *self.tx)
        .await?;
        Ok(())
    }
    /// Commits durable state and the replayable command outcome together; no dispatch before this.
    pub async fn commit(mut self, receipt: &Value) -> Result<(), DatabaseError> {
        sqlx::query(
            "UPDATE ironloom.commands SET receipt=$1 WHERE operator_id=$2 AND command_id=$3",
        )
        .bind(receipt)
        .bind(self.operator.as_str())
        .bind(self.command.as_str())
        .execute(&mut *self.tx)
        .await?;
        self.tx.commit().await?;
        Ok(())
    }
}
fn record(row: sqlx::postgres::PgRow) -> Result<Record, DatabaseError> {
    let revision: String = row.get("revision");
    let project: Option<String> = row.get("project_id");
    Ok(Record {
        revision: revision.parse().map_err(|_| DatabaseError::Corrupt)?,
        project: project
            .map(ProjectId::new)
            .transpose()
            .map_err(|_| DatabaseError::Corrupt)?,
        body: row.get("body"),
    })
}
async fn scope_lock(tx: &mut Transaction<'_, Postgres>, scope: &str) -> Result<(), DatabaseError> {
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))")
        .bind(scope)
        .execute(&mut **tx)
        .await?;
    Ok(())
}
/// Deterministic fingerprint; credentials/tokens are persisted only as hashes or protected ciphertext.
pub fn digest(bytes: &[u8]) -> Vec<u8> {
    Sha256::digest(bytes).to_vec()
}

/// Protected credential record, never serialized as a client response.
pub struct ProtectedCredential {
    /// Immutable private owner, also part of the encryption-associated context.
    pub owner: OperatorId,
    /// Current secret revision.
    pub revision: u64,
    /// Authenticated ciphertext only; raw secrets exist solely in trusted adapter call scope.
    pub ciphertext: Vec<u8>,
}

impl From<DatabaseError> for crate::factory::StoreFailure {
    fn from(error: DatabaseError) -> Self {
        match error {
            DatabaseError::Unavailable => Self::Unavailable,
            DatabaseError::Corrupt | DatabaseError::NotFound => Self::Corrupt,
            DatabaseError::Conflict => Self::Conflict,
        }
    }
}
impl crate::factory::FactoryStore for Store {
    fn redeem_bootstrap(
        &self,
        operator: OperatorId,
        token_hash: ActorId,
    ) -> ironloom_core::BoxFuture<
        '_,
        Result<crate::factory::BootstrapState, crate::factory::StoreFailure>,
    > {
        Box::pin(async move {
            use crate::factory::{BootstrapState, BootstrapStateData, StoreFailure};
            let hash = hex::decode(token_hash.as_str()).map_err(|_| StoreFailure::Conflict)?;
            if hash.len() != 32 {
                return Err(StoreFailure::Conflict);
            }
            let row = sqlx::query("UPDATE ironloom.installation SET administrator_id=$1,bootstrap_consumed_at=now(),bootstrap_token_hash=NULL WHERE singleton AND administrator_id IS NULL AND bootstrap_token_hash=$2 RETURNING installation_id")
                .bind(operator.as_str()).bind(hash).fetch_optional(&self.pool).await.map_err(DatabaseError::from)?.ok_or(StoreFailure::Conflict)?;
            BootstrapState::new(BootstrapStateData {
                installation_id: ironloom_core::InstallationId::new(
                    row.get::<String, _>("installation_id"),
                )
                .map_err(|_| StoreFailure::Corrupt)?,
                administrator: operator,
                grants_initialized: false,
            })
            .map_err(|_| StoreFailure::Corrupt)
        })
    }
    fn enroll_node(
        &self,
        enrollment: crate::factory::NodeEnrollment,
    ) -> ironloom_core::BoxFuture<'_, Result<(), crate::factory::StoreFailure>> {
        Box::pin(async move {
            let mut tx = self.pool.begin().await.map_err(DatabaseError::from)?;
            let installation: String = sqlx::query_scalar(
                "SELECT installation_id FROM ironloom.installation WHERE singleton",
            )
            .fetch_one(&mut *tx)
            .await
            .map_err(DatabaseError::from)?;
            if installation != enrollment.installation_id.as_str() {
                return Err(crate::factory::StoreFailure::Conflict);
            }
            let body = serde_json::to_value(&enrollment)
                .map_err(|_| crate::factory::StoreFailure::Corrupt)?;
            let changed = sqlx::query("INSERT INTO ironloom.nodes(node_id,host_id,approved_by,enrollment) VALUES($1,$2,$3,$4) ON CONFLICT(node_id) DO UPDATE SET enrollment=EXCLUDED.enrollment WHERE ironloom.nodes.enrollment=EXCLUDED.enrollment")
                .bind(enrollment.node_id.as_str()).bind(enrollment.host_id.as_str()).bind(enrollment.approved_by.as_str()).bind(body).execute(&mut *tx).await.map_err(DatabaseError::from)?.rows_affected();
            if changed != 1 {
                return Err(crate::factory::StoreFailure::Conflict);
            }
            tx.commit().await.map_err(DatabaseError::from)?;
            Ok(())
        })
    }
    fn save_lesson(
        &self,
        lesson: crate::factory::Lesson,
    ) -> ironloom_core::BoxFuture<'_, Result<(), crate::factory::StoreFailure>> {
        Box::pin(async move {
            let mut tx = self.pool.begin().await.map_err(DatabaseError::from)?;
            scope_lock(&mut tx, &format!("lesson:{}", lesson.lesson_id.as_str())).await?;
            let revision = lesson.revision.get();
            let body =
                serde_json::to_value(&lesson).map_err(|_| crate::factory::StoreFailure::Corrupt)?;
            let changed = sqlx::query("INSERT INTO ironloom.records(kind,record_id,project_id,assignment_id,revision,body) SELECT 'lesson',$1,$2,$3,1,$4 WHERE $5::text::numeric=1 ON CONFLICT(kind,record_id) DO NOTHING")
                .bind(lesson.lesson_id.as_str()).bind(lesson.origin_project.as_str()).bind(lesson.origin_assignment.as_str()).bind(&body).bind(revision.to_string()).execute(&mut *tx).await.map_err(DatabaseError::from)?.rows_affected();
            if changed == 0 {
                let changed = sqlx::query("UPDATE ironloom.records SET body=$1,revision=$2::text::numeric,updated_at=now() WHERE kind='lesson' AND record_id=$3 AND revision=$2::text::numeric-1 AND project_id=$4 AND assignment_id=$5")
                    .bind(&body).bind(revision.to_string()).bind(lesson.lesson_id.as_str()).bind(lesson.origin_project.as_str()).bind(lesson.origin_assignment.as_str()).execute(&mut *tx).await.map_err(DatabaseError::from)?.rows_affected();
                if changed != 1 {
                    return Err(crate::factory::StoreFailure::Conflict);
                }
            }
            sqlx::query("INSERT INTO ironloom.context_changes(record_kind,record_id,revision) VALUES('lesson',$1,$2::text::numeric)")
                .bind(lesson.lesson_id.as_str()).bind(revision.to_string()).execute(&mut *tx).await.map_err(DatabaseError::from)?;
            tx.commit().await.map_err(DatabaseError::from)?;
            Ok(())
        })
    }
    fn commit_command(
        &self,
        command: crate::factory::StoredCommand,
    ) -> ironloom_core::BoxFuture<
        '_,
        Result<crate::factory::CommandClaim, crate::factory::StoreFailure>,
    > {
        Box::pin(async move {
            use crate::factory::{CommandClaim, StoreFailure};
            let scope = ActorId::new(
                command
                    .conversation_id
                    .as_ref()
                    .map(ConversationId::as_str)
                    .or_else(|| command.project_id.as_ref().map(ProjectId::as_str))
                    .unwrap_or("installation"),
            )
            .map_err(|_| StoreFailure::Corrupt)?;
            let operation = self
                .begin_fingerprint(
                    &command.operator_id,
                    &command.command_id,
                    command.payload_hash.as_str(),
                    &scope,
                )
                .await;
            let mut batch = match operation {
                Ok(Operation::Replay(_)) => return Ok(CommandClaim::Existing),
                Ok(Operation::Write(batch)) => batch,
                Err(DatabaseError::Conflict) => return Ok(CommandClaim::Conflict),
                Err(error) => return Err(error.into()),
            };
            if let Some(conversation) = &command.conversation_id {
                let project: Option<String> = sqlx::query_scalar(
                    "SELECT project_id FROM ironloom.conversations WHERE conversation_id=$1",
                )
                .bind(conversation.as_str())
                .fetch_optional(&mut *batch.tx)
                .await
                .map_err(DatabaseError::from)?;
                if project.as_deref() != command.project_id.as_ref().map(ProjectId::as_str) {
                    return Err(StoreFailure::Conflict);
                }
                sqlx::query("UPDATE ironloom.commands SET conversation_id=$1 WHERE operator_id=$2 AND command_id=$3")
                    .bind(conversation.as_str()).bind(command.operator_id.as_str()).bind(command.command_id.as_str()).execute(&mut *batch.tx).await.map_err(DatabaseError::from)?;
                if let Some(event) = &command.first_event {
                    let sequence = batch.next_sequence(conversation).await?;
                    batch.append_event(conversation, sequence, event).await?;
                }
            }
            (*batch).commit(&command.receipt).await?;
            Ok(CommandClaim::New)
        })
    }
}

/// Exclusive infrastructure initialization transaction; not a project or user command.
pub struct AuthorizationInitialization {
    tx: Transaction<'static, Postgres>,
    body: Option<Value>,
}
impl AuthorizationInitialization {
    /// Returns the persisted current binding. Decode failure must fail closed without replacement.
    pub fn binding(&self) -> Option<&Value> {
        self.body.as_ref()
    }
    /// Persists a new binding only when absent, or confirms the identical current binding.
    pub async fn commit(mut self, binding: &Value) -> Result<(), DatabaseError> {
        if self.body.as_ref().is_some_and(|current| current != binding) {
            return Err(DatabaseError::Conflict);
        }
        if self.body.is_none() {
            sqlx::query("INSERT INTO ironloom.records(kind,record_id,revision,body) VALUES('authorization','binding',1,$1)")
                .bind(binding).execute(&mut *self.tx).await?;
        }
        self.tx.commit().await?;
        Ok(())
    }
}

/// Storage-owned cross-node bootstrap serialization guard. Dropping it rolls back completion.
pub struct BootstrapInitialization {
    tx: Transaction<'static, Postgres>,
    operator: OperatorId,
    initialized: bool,
}
impl BootstrapInitialization {
    /// Returns completion rechecked after acquiring the exclusive installation lock.
    pub fn initialized(&self) -> bool {
        self.initialized
    }
    /// Commits completion while still holding the lock, after the initial grant write succeeds.
    /// Already-complete callers commit without writing or restoring any external relationship.
    pub async fn complete(mut self) -> Result<(), DatabaseError> {
        if !self.initialized {
            sqlx::query("UPDATE ironloom.installation SET grants_initialized_at=now() WHERE singleton AND administrator_id=$1")
                .bind(self.operator.as_str()).execute(&mut *self.tx).await?;
        }
        self.tx.commit().await?;
        Ok(())
    }
}
