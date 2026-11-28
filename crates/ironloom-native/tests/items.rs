use ironloom_core::{ConversationId, ItemId, TurnId, validation::decode};
use ironloom_native::items::CompletedItem;
use serde_json::json;
#[test]
fn confirmed_items_include_full_text_and_matched_tool_success_or_failure() {
    let conversation = ConversationId::new("c").unwrap();
    let turn = TurnId::new("t").unwrap();
    let item = ItemId::new("i").unwrap();
    let message=CompletedItem::Message(decode(&serde_json::to_vec(&json!({"conversation_id":"c","turn_id":"t","item_id":"i","message":{"role":"assistant","text":"complete final output","tool_calls":[]}})).unwrap()).unwrap());
    let value = message.notification(&conversation, &turn, &item).unwrap();
    assert_eq!(value["method"], "item/completed");
    assert_eq!(value["params"]["item"]["text"], "complete final output");
    for (status, native, success) in [
        ("succeeded", "completed", true),
        ("failed", "failed", false),
    ] {
        let tool = CompletedItem::Tool {
            conversation_id: conversation.clone(),
            turn_id: turn.clone(),
            source_item_id: item.clone(),
            call: decode(br#"{"tool_call_id":"call","name":"read","arguments":{"path":"file"}}"#)
                .unwrap(),
            result: decode(
                &serde_json::to_vec(
                    &json!({"tool_call_id":"call","status":status,"content":"exact result"}),
                )
                .unwrap(),
            )
            .unwrap(),
        };
        let value = tool.notification(&conversation, &turn, &item).unwrap();
        assert_eq!(value["params"]["item"]["id"], "call");
        assert_eq!(value["params"]["item"]["tool"], "read");
        assert_eq!(value["params"]["item"]["status"], native);
        assert_eq!(value["params"]["item"]["success"], success);
        assert_eq!(
            value["params"]["item"]["contentItems"][0]["text"],
            "exact result"
        );
        assert!(
            tool.notification(&conversation, &TurnId::new("other").unwrap(), &item)
                .is_err()
        );
    }
}
