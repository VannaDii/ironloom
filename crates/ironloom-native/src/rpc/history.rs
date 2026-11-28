//! Native item pagination over the authorized fixed-watermark service history port.
use super::*;
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
const MAX_CURSOR_BYTES: usize = 4096;
const MAX_PAGE: u64 = 100;
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct Cursor {
    as_of: ReplayCursor,
    turn: Option<TurnId>,
    anchor: ItemId,
}
fn encode(cursor: Cursor) -> Result<String, Failure> {
    Ok(URL_SAFE_NO_PAD.encode(serde_json::to_vec(&cursor).map_err(|_| Failure::Unavailable)?))
}
impl NativeRpc {
    pub(super) async fn item_page(
        &self,
        session: AuthenticatedSession,
        params: &Value,
    ) -> Result<Value, Failure> {
        let conversation = conversation(params)?;
        let snapshot = self
            .service
            .snapshot(session.clone(), conversation.clone())
            .await?;
        if snapshot.cursor.conversation_id != conversation {
            return Err(Failure::Unavailable);
        }
        let turn: Option<TurnId> = optional_text(params, "turnId")?
            .map(TurnId::new)
            .transpose()
            .map_err(|_| Failure::Invalid)?;
        let forward = match optional_text(params, "sortDirection")?.as_deref() {
            None | Some("asc") => true,
            Some("desc") => false,
            _ => return Err(Failure::Invalid),
        };
        let limit = match params.get("limit").filter(|value| !value.is_null()) {
            None => MAX_PAGE,
            Some(value) => value
                .as_u64()
                .filter(|value| *value > 0 && *value <= MAX_PAGE)
                .ok_or(Failure::Invalid)?,
        };
        // Complete supported items are always returned; optional output deferral is unnecessary.
        let mut as_of = snapshot.cursor.clone();
        let anchor = match params.get("cursor").filter(|value| !value.is_null()) {
            None => None,
            Some(Value::String(value)) => {
                if value.len() > MAX_CURSOR_BYTES {
                    return Err(Failure::Invalid);
                }
                let cursor: Cursor = serde_json::from_slice(
                    &URL_SAFE_NO_PAD
                        .decode(value)
                        .map_err(|_| Failure::Invalid)?,
                )
                .map_err(|_| Failure::Invalid)?;
                if cursor.as_of.conversation_id != conversation
                    || cursor.turn != turn
                    || cursor.as_of.sequence > snapshot.cursor.sequence
                {
                    return Err(Failure::Invalid);
                }
                as_of = cursor.as_of;
                Some(cursor.anchor)
            }
            Some(value) if value["type"] == "item" && turn.is_some() => {
                Some(ItemId::new(required(value, "itemId")?).map_err(|_| Failure::Invalid)?)
            }
            _ => return Err(Failure::Invalid),
        };
        let direction = if forward {
            HistoryDirection::Forward
        } else {
            HistoryDirection::Backward
        };
        let query = HistoryQuery::new(HistoryQueryData {
            as_of: as_of.clone(),
            direction: direction.clone(),
            before: if forward { None } else { anchor.clone() },
            after: if forward { anchor } else { None },
            turn_id: turn.clone(),
            limit: Counter::new(limit),
        })
        .map_err(|_| Failure::Invalid)?;
        let page = self.service.history(session, query).await?;
        if page.as_of != as_of
            || page.turn_id != turn
            || page.direction != direction
            || page.items.len() > limit as usize
        {
            return Err(Failure::Unavailable);
        }
        let mut items = page.items.clone();
        if !forward {
            items.reverse();
        }
        let continuation = if forward {
            page.next_after.as_ref()
        } else {
            page.next_before.as_ref()
        };
        let cursor = |anchor: &ItemId| {
            encode(Cursor {
                as_of: as_of.clone(),
                turn: turn.clone(),
                anchor: anchor.clone(),
            })
        };
        let next = continuation.map(cursor).transpose()?;
        let backwards = items
            .first()
            .map(|item| cursor(&item.item_id))
            .transpose()?;
        let data = items.iter().map(|item| {
            Ok(json!({"turnId":item.turn_id,"item":history_item(item)?,"startedAtMs":null,"completedAtMs":null}))
        }).collect::<Result<Vec<_>, Failure>>()?;
        Ok(json!({"data":data,"nextCursor":next,"backwardsCursor":backwards}))
    }
}

const MAX_RESULT_BYTES: usize = 16 * 1024 * 1024;
const MAX_FULL_ITEMS: usize = 16384;
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct TurnCursor {
    as_of: ReplayCursor,
    anchor: TurnId,
    direction: HistoryDirection,
    inclusive: bool,
}
fn turn_cursor(value: TurnCursor) -> Result<String, Failure> {
    Ok(URL_SAFE_NO_PAD.encode(serde_json::to_vec(&value).map_err(|_| Failure::Unavailable)?))
}
fn charge(value: &Value, remaining: &mut usize) -> Result<(), Failure> {
    let length = serde_json::to_vec(value)
        .map_err(|_| Failure::Unavailable)?
        .len();
    *remaining = remaining.checked_sub(length).ok_or(Failure::Unsupported)?;
    Ok(())
}
impl NativeRpc {
    pub(super) async fn item_read(
        &self,
        session: AuthenticatedSession,
        params: &Value,
    ) -> Result<Value, Failure> {
        let conversation = conversation(params)?;
        let turn = TurnId::new(required(params, "turnId")?).map_err(|_| Failure::Invalid)?;
        let requested = params["itemIds"]
            .as_array()
            .filter(|items| !items.is_empty() && items.len() <= MAX_PAGE as usize)
            .ok_or(Failure::Invalid)?;
        let ids = requested
            .iter()
            .map(|item| {
                ItemId::new(item.as_str().ok_or(Failure::Invalid)?).map_err(|_| Failure::Invalid)
            })
            .collect::<Result<Vec<_>, _>>()?;
        let expected = ids.iter().cloned().collect::<BTreeSet<_>>();
        if expected.len() != ids.len() {
            return Err(Failure::Invalid);
        }
        let snapshot = self
            .service
            .snapshot(session.clone(), conversation.clone())
            .await?;
        if snapshot.cursor.conversation_id != conversation {
            return Err(Failure::Unavailable);
        }
        let items = self
            .authority
            .items(session, snapshot.cursor.clone(), turn.clone(), ids)
            .await?;
        if items.len() != expected.len() {
            return Err(Failure::Unavailable);
        }
        let mut found = BTreeSet::new();
        let mut remaining = MAX_RESULT_BYTES;
        let mut data = Vec::new();
        for item in items {
            if item.conversation_id != conversation
                || item.turn_id != turn
                || !expected.contains(&item.item_id)
                || !found.insert(item.item_id.clone())
            {
                return Err(Failure::Unavailable);
            }
            let entry = json!({"turnId":item.turn_id,"item":history_item(&item)?,"startedAtMs":null,"completedAtMs":null});
            charge(&entry, &mut remaining)?;
            data.push(entry);
        }
        Ok(json!({"data":data}))
    }
    pub(super) async fn turn_page(
        &self,
        session: AuthenticatedSession,
        params: &Value,
    ) -> Result<Value, Failure> {
        let conversation = conversation(params)?;
        let snapshot = self
            .service
            .snapshot(session.clone(), conversation.clone())
            .await?;
        if snapshot.cursor.conversation_id != conversation {
            return Err(Failure::Unavailable);
        }
        let direction = match optional_text(params, "sortDirection")?.as_deref() {
            None | Some("desc") => HistoryDirection::Backward,
            Some("asc") => HistoryDirection::Forward,
            _ => return Err(Failure::Invalid),
        };
        let limit = match params.get("limit").filter(|v| !v.is_null()) {
            None => MAX_PAGE,
            Some(value) => value
                .as_u64()
                .filter(|v| *v > 0 && *v <= MAX_PAGE)
                .ok_or(Failure::Invalid)?,
        };
        let view = optional_text(params, "itemsView")?.unwrap_or_else(|| "summary".into());
        if !matches!(view.as_str(), "summary" | "full" | "notLoaded") {
            return Err(Failure::Invalid);
        }
        let mut as_of = snapshot.cursor.clone();
        let mut anchor = None;
        let mut inclusive = false;
        if let Some(value) = optional_text(params, "cursor")? {
            if value.len() > MAX_CURSOR_BYTES {
                return Err(Failure::Invalid);
            }
            let cursor: TurnCursor = serde_json::from_slice(
                &URL_SAFE_NO_PAD
                    .decode(value)
                    .map_err(|_| Failure::Invalid)?,
            )
            .map_err(|_| Failure::Invalid)?;
            if cursor.as_of.conversation_id != conversation
                || cursor.as_of.sequence > as_of.sequence
                || cursor.direction != direction
            {
                return Err(Failure::Invalid);
            }
            if !cursor.inclusive {
                as_of = cursor.as_of;
            }
            inclusive = cursor.inclusive;
            anchor = Some(cursor.anchor);
        }
        let page = self
            .authority
            .turns(
                session.clone(),
                NativeTurnQuery {
                    as_of: as_of.clone(),
                    direction: direction.clone(),
                    anchor,
                    inclusive,
                    limit: Counter::new(limit),
                },
            )
            .await?;
        if page.as_of != as_of
            || page.direction != direction
            || page.turns.len() > limit as usize
            || page
                .next_anchor
                .as_ref()
                .is_some_and(|id| page.turns.last().is_none_or(|turn| &turn.turn_id != id))
        {
            return Err(Failure::Unavailable);
        }
        let mut found = BTreeSet::new();
        let mut remaining = MAX_RESULT_BYTES;
        let mut data = Vec::new();
        for entry in &page.turns {
            if !found.insert(entry.turn_id.clone()) {
                return Err(Failure::Unavailable);
            }
            let items = self
                .turn_items(
                    session.clone(),
                    &as_of,
                    &entry.turn_id,
                    &view,
                    &mut remaining,
                )
                .await?;
            let metadata = &entry.metadata;
            let mut value = turn(entry.turn_id.as_str(), items, "inProgress", &view);
            value["status"] =
                serde_json::to_value(metadata.status).map_err(|_| Failure::Unavailable)?;
            value["startedAt"] = timestamp(metadata.started_at_ms)?;
            value["completedAt"] = timestamp(metadata.completed_at_ms)?;
            value["durationMs"] = metadata
                .duration_ms
                .map(|v| {
                    i64::try_from(v.get())
                        .map(Value::from)
                        .map_err(|_| Failure::Unavailable)
                })
                .transpose()?
                .unwrap_or(Value::Null);
            charge(&json!({"id":entry.turn_id}), &mut remaining)?;
            data.push(value);
        }
        let next = page
            .next_anchor
            .map(|anchor| {
                turn_cursor(TurnCursor {
                    as_of: as_of.clone(),
                    anchor,
                    direction: direction.clone(),
                    inclusive: false,
                })
            })
            .transpose()?;
        let reverse = if direction == HistoryDirection::Forward {
            HistoryDirection::Backward
        } else {
            HistoryDirection::Forward
        };
        let backwards = page
            .turns
            .first()
            .map(|entry| {
                turn_cursor(TurnCursor {
                    as_of: as_of.clone(),
                    anchor: entry.turn_id.clone(),
                    direction: reverse,
                    inclusive: true,
                })
            })
            .transpose()?;
        Ok(json!({"data":data,"nextCursor":next,"backwardsCursor":backwards}))
    }
    async fn turn_items(
        &self,
        session: AuthenticatedSession,
        as_of: &ReplayCursor,
        turn_id: &TurnId,
        view: &str,
        remaining: &mut usize,
    ) -> Result<Vec<Value>, Failure> {
        if view == "notLoaded" {
            return Ok(Vec::new());
        }
        let full = view == "full";
        let direction = if full {
            HistoryDirection::Forward
        } else {
            HistoryDirection::Backward
        };
        let mut after = None;
        let mut seen = BTreeSet::new();
        let mut items = Vec::new();
        loop {
            let page = self
                .service
                .history(
                    session.clone(),
                    HistoryQuery::new(HistoryQueryData {
                        as_of: as_of.clone(),
                        direction: direction.clone(),
                        before: None,
                        after: after.clone(),
                        turn_id: Some(turn_id.clone()),
                        limit: Counter::new(if full { MAX_PAGE } else { 1 }),
                    })
                    .map_err(|_| Failure::Invalid)?,
                )
                .await?;
            if page.as_of != *as_of
                || page.turn_id.as_ref() != Some(turn_id)
                || page.direction != direction
                || (!full && page.items.len() > 1)
            {
                return Err(Failure::Unavailable);
            }
            for item in &page.items {
                if !seen.insert(item.item_id.clone()) || items.len() >= MAX_FULL_ITEMS {
                    return Err(Failure::Unavailable);
                }
                let value = history_item(item)?;
                charge(&value, remaining)?;
                items.push(value);
            }
            if !full || page.next_after.is_none() {
                return Ok(items);
            }
            after = page.next_after.clone();
        }
    }
}
