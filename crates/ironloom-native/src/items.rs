//! Confirmed durable item results projected into the pinned native notification shape.
use crate::relay::RelayError;
use ironloom_core::{ConversationId, ItemId, TurnId};
use ironloom_models::factory::{ToolInvocation, ToolResult, ToolResultStatus};
use ironloom_service::factory::HistoryItem;
use serde_json::{Value, json};
/// A service-confirmed completed item. A provider EOF or idle worker cannot create this fact.
#[derive(Clone)]
pub enum CompletedItem {
    /// Complete persisted message content at the requested durable watermark.
    Message(HistoryItem),
    /// Matched persisted tool invocation/result, including failure, resolved by the service.
    Tool {
        /// Authorized containing conversation.
        conversation_id: ConversationId,
        /// Actual persisted owning turn.
        turn_id: TurnId,
        /// Service item whose completion triggered this result, distinct from the native tool ID.
        source_item_id: ItemId,
        /// Original complete invocation; never infer its tool name from the result ID.
        call: ToolInvocation,
        /// Exact correlated result and confirmed outcome.
        result: ToolResult,
    },
}
impl CompletedItem {
    /// Checks the service event scope and renders full final contents without claiming turn completion.
    pub fn notification(
        &self,
        conversation: &ConversationId,
        turn: &TurnId,
        item: &ItemId,
    ) -> Result<Value, RelayError> {
        let value = match self {
            Self::Message(message) => {
                if &message.conversation_id != conversation
                    || &message.turn_id != turn
                    || &message.item_id != item
                {
                    return Err(RelayError::Protocol);
                }
                crate::rpc::history_item(message).map_err(|_| RelayError::Protocol)?
            }
            Self::Tool {
                conversation_id,
                turn_id,
                source_item_id,
                call,
                result,
            } => {
                if conversation_id != conversation
                    || turn_id != turn
                    || source_item_id != item
                    || call.tool_call_id != result.tool_call_id
                {
                    return Err(RelayError::Protocol);
                }
                let success = result.status == ToolResultStatus::Succeeded;
                json!({"type":"dynamicToolCall","id":call.tool_call_id,"tool":call.name,"namespace":null,"arguments":call.arguments,"status":if success{"completed"}else{"failed"},"contentItems":[{"type":"inputText","text":result.content}],"success":success,"durationMs":null})
            }
        };
        Ok(
            json!({"method":"item/completed","params":{"threadId":conversation,"turnId":turn,"item":value}}),
        )
    }
}
