mod support;
use ironloom_core::{validation::decode, *};
use ironloom_native::{relay::Peer, views::NativeViews};
use ironloom_service::factory::*;
use serde_json::json;
use std::sync::Arc;
use support::{Authority, Service, Store};
use tokio::sync::Notify;
fn state() -> ConversationSnapshot {
    decode(&serde_json::to_vec(&json!({"session":{"conversation_id":"c","project_id":"p","archived":false,"last_human_interaction_ms":"1"},"cursor":{"conversation_id":"c","sequence":"99"},"revision":"4","pending_questions":[]})).unwrap()).unwrap()
}
fn event(sequence: u64, kind: &str, state: Option<&str>) -> ServiceEvent {
    decode(&serde_json::to_vec(&json!({"cursor":{"conversation_id":"c","sequence":sequence.to_string()},"command_id":"command","project_id":"p","event":{"worker_id":"worker","turn_id":"turn","item_id":"item","assignment_id":"assignment","inference_id":"inference","kind":kind,"state":state,"text":if kind=="text_delta"{"fixture"}else{""}}})).unwrap()).unwrap()
}
#[tokio::test]
async fn feed_eof_and_provider_completion_never_complete_turn_and_reconnect_uses_committed_cursor()
{
    for terminal in [false, true] {
        let mut events = vec![event(10, "text_delta", None), event(11, "completed", None)];
        if terminal {
            events.push(event(12, "state_changed", Some("completed")));
        }
        let mut live = (*state()).clone();
        if !terminal {
            live.session = SessionSummary::new(SessionSummaryData {
                active_turn_id: Some(TurnId::new("turn").unwrap()),
                ..(*live.session).clone()
            })
            .unwrap();
            live.active_assignment_id = Some(AssignmentId::new("assignment").unwrap());
            live.execution_state = Some(serde_json::from_value(json!("running")).unwrap());
        }
        let service = Service::new(ConversationSnapshot::new(live).unwrap(), events);
        let store = Arc::new(Store::default());
        let authority = Authority::new(service.clone());
        authority.completed.lock().unwrap().push(ironloom_native::items::CompletedItem::Message(decode(br#"{"conversation_id":"c","turn_id":"turn","item_id":"item","message":{"role":"assistant","text":"complete final output","tool_calls":[]}}"#).unwrap()));
        let adapter = NativeViews::new(
            service.clone(),
            authority,
            store.clone(),
            Arc::new(Notify::new()),
        );
        let peer = Peer {
            client: ActorId::new("client").unwrap(),
            stream: ActorId::new("stream").unwrap(),
        };
        let mut initial = (*state()).clone();
        initial.session = SessionSummary::new(SessionSummaryData {
            active_turn_id: Some(TurnId::new("turn").unwrap()),
            ..(*initial.session).clone()
        })
        .unwrap();
        initial.active_assignment_id = Some(AssignmentId::new("assignment").unwrap());
        initial.execution_state = Some(serde_json::from_value(json!("running")).unwrap());
        initial.cursor = ReplayCursor::new(ReplayCursorData {
            conversation_id: ConversationId::new("c").unwrap(),
            sequence: Counter::new(9),
        })
        .unwrap();
        adapter
            .watch(peer.clone(), &ConversationSnapshot::new(initial).unwrap())
            .await
            .unwrap();
        adapter.ready(peer.clone()).await.unwrap();
        tokio::time::timeout(std::time::Duration::from_secs(2), async {
            loop {
                let notified = store.changed.notified();
                if store
                    .messages
                    .lock()
                    .unwrap()
                    .iter()
                    .any(|v| v["method"] == "thread/closed")
                {
                    break;
                }
                notified.await;
            }
        })
        .await
        .unwrap();
        adapter.disconnected().await;
        let messages = store.messages.lock().unwrap().clone();
        assert_eq!(
            messages
                .iter()
                .filter(|v| v["method"] == "item/agentMessage/delta")
                .count(),
            1
        );
        assert_eq!(
            messages
                .iter()
                .filter(|v| v["method"] == "turn/completed")
                .count(),
            usize::from(terminal)
        );
        let final_items = messages
            .iter()
            .filter(|v| v["method"] == "item/completed")
            .collect::<Vec<_>>();
        assert_eq!(final_items.len(), 1);
        assert_eq!(
            final_items[0]["params"]["item"]["text"],
            "complete final output"
        );
        let expected = if terminal { 12 } else { 11 };
        assert_eq!(
            store
                .view
                .lock()
                .unwrap()
                .as_ref()
                .unwrap()
                .cursor
                .sequence
                .get(),
            expected
        );
        adapter.ready(peer).await.unwrap();
        tokio::time::timeout(std::time::Duration::from_secs(2), async {
            loop {
                tokio::task::yield_now().await;
                if service.subscriptions.lock().unwrap().len() == 2 {
                    break;
                }
            }
        })
        .await
        .unwrap();
        adapter.disconnected().await;
        assert_eq!(
            service.subscriptions.lock().unwrap()[1].sequence.get(),
            expected
        );
        assert_eq!(
            store
                .messages
                .lock()
                .unwrap()
                .iter()
                .filter(|v| v["method"] == "item/agentMessage/delta")
                .count(),
            1
        );
    }
}
