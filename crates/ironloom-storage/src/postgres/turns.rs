//! Persisted rollout order and immutable outcome versions, independent from current snapshots.
use super::*;
use ironloom_core::AssignmentId;

impl Store {
    async fn require_watermark(
        &self,
        conversation: &ConversationId,
        as_of: u64,
    ) -> Result<(), DatabaseError> {
        let current: Option<String> = sqlx::query_scalar("SELECT (next_event_sequence-1)::text FROM ironloom.conversations WHERE conversation_id=$1")
            .bind(conversation.as_str()).fetch_optional(&self.pool).await?;
        let current: u64 = current
            .ok_or(DatabaseError::NotFound)?
            .parse()
            .map_err(|_| DatabaseError::Corrupt)?;
        if as_of > current {
            return Err(DatabaseError::Conflict);
        }
        Ok(())
    }
    /// Reads a bounded turn page in actual stored rollout order. Invalid/foreign/future anchors
    /// fail rather than restarting traversal; outcomes come from the requested event watermark.
    pub async fn turns(
        &self,
        window: TurnWindow<'_>,
    ) -> Result<Vec<(TurnId, Value)>, DatabaseError> {
        if window.limit == 0 || window.limit > 101 || window.inclusive && window.anchor.is_none() {
            return Err(DatabaseError::Conflict);
        }
        self.require_watermark(window.conversation, window.as_of)
            .await?;
        let anchor: Option<i64> = if let Some(id) = window.anchor {
            Some(sqlx::query_scalar("SELECT t.position FROM ironloom.turns t WHERE t.conversation_id=$1 AND t.turn_id=$2 AND EXISTS(SELECT 1 FROM ironloom.turn_versions v WHERE v.conversation_id=t.conversation_id AND v.turn_id=t.turn_id AND v.sequence<=$3::text::numeric)")
                .bind(window.conversation.as_str()).bind(id.as_str()).bind(window.as_of.to_string()).fetch_optional(&self.pool).await?.ok_or(DatabaseError::Conflict)?)
        } else {
            None
        };
        let rows=sqlx::query("SELECT t.turn_id,v.body FROM ironloom.turns t CROSS JOIN LATERAL(SELECT body FROM ironloom.turn_versions v WHERE v.conversation_id=t.conversation_id AND v.turn_id=t.turn_id AND v.sequence<=$2::text::numeric ORDER BY v.sequence DESC LIMIT 1)v WHERE t.conversation_id=$1 AND ($3::bigint IS NULL OR CASE WHEN $4 THEN (t.position>$3 OR ($5 AND t.position=$3)) ELSE (t.position<$3 OR ($5 AND t.position=$3)) END) ORDER BY CASE WHEN $4 THEN t.position END ASC,CASE WHEN NOT $4 THEN t.position END DESC LIMIT $6")
            .bind(window.conversation.as_str()).bind(window.as_of.to_string()).bind(anchor).bind(window.forward).bind(window.inclusive).bind(i64::from(window.limit)).fetch_all(&self.pool).await?;
        rows.into_iter()
            .map(|row| {
                Ok((
                    TurnId::new(row.get::<String, _>("turn_id"))
                        .map_err(|_| DatabaseError::Corrupt)?,
                    row.get("body"),
                ))
            })
            .collect()
    }
    /// Reads exactly 1..=100 distinct requested items in stored order at one turn/watermark.
    /// Missing, foreign, wrong-turn or not-yet-visible IDs never produce a partial success.
    pub async fn history_items(
        &self,
        conversation: &ConversationId,
        as_of: u64,
        turn: &TurnId,
        items: &[ItemId],
    ) -> Result<Vec<Value>, DatabaseError> {
        if items.is_empty()
            || items.len() > 100
            || items
                .iter()
                .collect::<std::collections::BTreeSet<_>>()
                .len()
                != items.len()
        {
            return Err(DatabaseError::Conflict);
        }
        self.require_watermark(conversation, as_of).await?;
        let ids = items.iter().map(ItemId::as_str).collect::<Vec<_>>();
        let rows:Vec<Value>=sqlx::query_scalar("SELECT v.body FROM ironloom.history_items i CROSS JOIN LATERAL(SELECT body FROM ironloom.history_versions v WHERE v.conversation_id=i.conversation_id AND v.item_id=i.item_id AND v.sequence<=$2::text::numeric ORDER BY v.sequence DESC LIMIT 1)v WHERE i.conversation_id=$1 AND i.turn_id=$3 AND i.item_id=ANY($4::text[]) ORDER BY i.position")
            .bind(conversation.as_str()).bind(as_of.to_string()).bind(turn.as_str()).bind(&ids).fetch_all(&self.pool).await?;
        if rows.len() != items.len() {
            return Err(DatabaseError::NotFound);
        }
        Ok(rows)
    }
}
impl Batch {
    /// Records a turn outcome version after its matching command event. Immutable identity and
    /// assignment binding are checked on every write; identical state need not add another version.
    pub async fn turn_version(
        &mut self,
        conversation: &ConversationId,
        turn: &TurnId,
        assignment: &AssignmentId,
        sequence: u64,
        body: &Value,
    ) -> Result<(), DatabaseError> {
        if body.get("conversation_id").and_then(Value::as_str) != Some(conversation.as_str())
            || body.get("turn_id").and_then(Value::as_str) != Some(turn.as_str())
            || body.get("assignment_id").and_then(Value::as_str) != Some(assignment.as_str())
        {
            return Err(DatabaseError::Corrupt);
        }
        let owned:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM ironloom.events e JOIN ironloom.conversations c USING(conversation_id) WHERE e.conversation_id=$1 AND e.sequence=$2::text::numeric AND e.operator_id=$3 AND e.command_id=$4 AND c.project_id=$5)")
            .bind(conversation.as_str()).bind(sequence.to_string()).bind(self.operator.as_str()).bind(self.command.as_str()).bind(body.get("project_id").and_then(Value::as_str)).fetch_one(&mut *self.tx).await?;
        if !owned {
            return Err(DatabaseError::Conflict);
        }
        sqlx::query("INSERT INTO ironloom.turns(conversation_id,turn_id,assignment_id) VALUES($1,$2,$3) ON CONFLICT(conversation_id,turn_id) DO NOTHING")
            .bind(conversation.as_str()).bind(turn.as_str()).bind(assignment.as_str()).execute(&mut *self.tx).await?;
        let previous:Option<Value>=sqlx::query_scalar("SELECT body FROM ironloom.turn_versions WHERE conversation_id=$1 AND turn_id=$2 ORDER BY sequence DESC LIMIT 1")
            .bind(conversation.as_str()).bind(turn.as_str()).fetch_optional(&mut *self.tx).await?;
        if previous.as_ref() == Some(body) {
            return Ok(());
        }
        let changed=sqlx::query("INSERT INTO ironloom.turn_versions(conversation_id,turn_id,sequence,body) SELECT $1,$2,$3::text::numeric,$4 FROM ironloom.turns WHERE conversation_id=$1 AND turn_id=$2 AND assignment_id=$5")
            .bind(conversation.as_str()).bind(turn.as_str()).bind(sequence.to_string()).bind(body).bind(assignment.as_str()).execute(&mut *self.tx).await?.rows_affected();
        if changed != 1 {
            return Err(DatabaseError::Conflict);
        }
        Ok(())
    }
}
