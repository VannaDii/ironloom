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
