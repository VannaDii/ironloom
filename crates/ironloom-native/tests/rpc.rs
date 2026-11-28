mod support;
use ironloom_core::{ActorId, validation::decode};
use ironloom_native::{
    prompts, relay::Peer, rpc::NativeRpc, socket::Dispatcher, views::NativeViews,
};
use ironloom_service::factory::*;
use serde_json::{Value, json};
use std::sync::{Arc, atomic::Ordering};
use support::{Authority, Service, Store};
use tokio::sync::Notify;
fn state() -> ConversationSnapshot {
    decode(&serde_json::to_vec(&json!({"session":{"conversation_id":"c","project_id":"p","active_turn_id":"turn","archived":false,"last_human_interaction_ms":"1"},"cursor":{"conversation_id":"c","sequence":"9"},"revision":"1","active_assignment_id":"assignment","execution_state":"running","pending_questions":[]})).unwrap()).unwrap()
}
fn peer() -> Peer {
    Peer {
        client: ActorId::new("client").unwrap(),
        stream: ActorId::new("stream").unwrap(),
    }
}
async fn router(service: Arc<Service>) -> (NativeRpc, Arc<Authority>) {
    let authority = Authority::new(service.clone());
    let views = Arc::new(NativeViews::new(
        service.clone(),
        authority.clone(),
        Arc::new(Store::default()),
        Arc::new(Notify::new()),
    ));
    let rpc = NativeRpc::new(service, authority.clone(), views);
    let result = rpc
        .dispatch(
            peer(),
            json!({"id":0,"method":"initialize","params":{"clientInfo":{"name":"fixture"}}}),
        )
        .await
        .unwrap()
        .unwrap();
    assert!(result.message.get("result").is_some());
    (rpc, authority)
}
#[tokio::test]
async fn lost_interrupt_reply_replays_original_envelope_after_turn_termination() {
    let service = Service::new(state(), vec![]);
    let (rpc, authority) = router(service.clone()).await;
    let request =
        json!({"id":1,"method":"turn/interrupt","params":{"threadId":"c","turnId":"turn"}});
    let first = rpc
        .dispatch(peer(), request.clone())
        .await
        .unwrap()
        .unwrap();
    assert_eq!(first.message["result"], json!({}));
    assert!(
        service
            .state
            .lock()
            .unwrap()
            .session
            .active_turn_id
            .is_none()
    );
    let retry = rpc
        .dispatch(peer(), request.clone())
        .await
        .unwrap()
        .unwrap();
    assert_eq!(retry.message, first.message);
    assert_eq!(service.commands.lock().unwrap().len(), 1);
    *authority.error.lock().unwrap() =
        Some(ServiceError::Authentication(AuthenticationError::Forbidden));
    assert_eq!(
        rpc.dispatch(peer(), request)
            .await
            .unwrap()
            .unwrap()
            .message["error"]["code"],
        -32001
    );
}
#[tokio::test]
async fn lost_question_reply_replays_after_question_resolution_and_changed_answer_conflicts() {
    let corpus: Value =
        serde_json::from_str(include_str!("../../../fixtures/contracts/decode.json")).unwrap();
    let value = &corpus["cases"]
        .as_array()
        .unwrap()
        .iter()
        .find(|v| v["name"] == "consistent-pending-state")
        .unwrap()["input"];
    let state: ConversationSnapshot = decode(&serde_json::to_vec(value).unwrap()).unwrap();
    let request = prompts::requests(&state).unwrap().remove(0);
    let service = Service::new(state, vec![]);
    let (rpc, _) = router(service.clone()).await;
    let mut response =
        json!({"id":request["id"],"result":{"answers":{"question-1":{"answers":["a"]}}}});
    assert!(
        rpc.dispatch(peer(), response.clone())
            .await
            .unwrap()
            .is_none()
    );
    assert!(service.state.lock().unwrap().pending_questions.is_empty());
    assert!(
        rpc.dispatch(peer(), response.clone())
            .await
            .unwrap()
            .is_none()
    );
    assert_eq!(service.commands.lock().unwrap().len(), 1);
    response["result"]["answers"]["question-1"]["answers"] = json!(["b"]);
    assert!(rpc.dispatch(peer(), response).await.is_err());
    assert_eq!(service.commands.lock().unwrap().len(), 1);
}
#[tokio::test]
async fn dependency_denial_and_approval_errors_remain_distinct_in_rpc() {
    let service = Service::new(state(), vec![]);
    let (rpc, authority) = router(service).await;
    for (error, code, message) in [
        (
            ServiceError::Authentication(AuthenticationError::Unavailable),
            -32000,
            "Service unavailable",
        ),
        (
            ServiceError::Authentication(AuthenticationError::Forbidden),
            -32001,
            "Authentication or access denied",
        ),
        (ServiceError::ApprovalRequired, -32003, "Approval required"),
    ] {
        *authority.error.lock().unwrap() = Some(error);
        let result = rpc
            .dispatch(
                peer(),
                json!({"id":2,"method":"thread/read","params":{"threadId":"c"}}),
            )
            .await
            .unwrap()
            .unwrap();
        assert_eq!(result.message["error"]["code"], code);
        assert_eq!(result.message["error"]["message"], message);
    }
}
#[tokio::test]
async fn start_selection_mismatch_never_calls_shared_conversation_creation() {
    let service = Service::new(state(), vec![]);
    let (rpc, authority) = router(service.clone()).await;
    for hints in [
        json!({"model":"different"}),
        json!({"modelProvider":"different"}),
        json!({"reasoningEffort":"high"}),
        json!({"effort":"medium","reasoningEffort":"high"}),
    ] {
        let mut params = hints;
        params["projectId"] = "p".into();
        let result = rpc
            .dispatch(
                peer(),
                json!({"id":3,"method":"thread/start","params":params}),
            )
            .await
            .unwrap()
            .unwrap();
        assert!(result.message.get("error").is_some());
        assert_eq!(service.creation_calls.load(Ordering::SeqCst), 0);
    }
    let result=rpc.dispatch(peer(),json!({"id":4,"method":"thread/start","params":{"projectId":"p","model":"selected","modelProvider":"fixture","reasoningEffort":"medium"}})).await.unwrap().unwrap();
    assert_eq!(result.message["result"]["thread"]["id"], "c");
    assert_eq!(service.creation_calls.load(Ordering::SeqCst), 1);
    authority.selected.store(false, Ordering::SeqCst);
    let result = rpc
        .dispatch(
            peer(),
            json!({"id":5,"method":"thread/start","params":{"projectId":"p","model":"selected"}}),
        )
        .await
        .unwrap()
        .unwrap();
    assert!(result.message.get("error").is_some());
    assert_eq!(service.creation_calls.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn item_pages_keep_watermark_scope_and_support_direction_reversal() {
    fn page(direction: &str, next: Option<&str>) -> HistoryPage {
        decode(&serde_json::to_vec(&json!({
            "as_of":{"conversation_id":"c","sequence":"9"},"direction":direction,"turn_id":"turn",
            "items":[{"conversation_id":"c","turn_id":"turn","item_id":"item-1","message":{"role":"user","text":"Persisted text","tool_calls":[]}}],
            "next_after":if direction=="forward" { next } else { None },
            "next_before":if direction=="backward" { next } else { None }
        })).unwrap()).unwrap()
    }
    let service = Service::new(state(), vec![]);
    service
        .history_pages
        .lock()
        .unwrap()
        .push_back(page("forward", Some("item-1")));
    let (rpc, _) = router(service.clone()).await;
    let first = rpc.dispatch(peer(), json!({"id":1,"method":"thread/items/list","params":{"threadId":"c","turnId":"turn","limit":1}})).await.unwrap().unwrap();
    let first = &first.message["result"];
    assert_eq!(
        first["data"][0]["item"]["content"][0]["text"],
        "Persisted text"
    );
    assert!(!first["backwardsCursor"].is_null());
    let mut advanced = (**service.state.lock().unwrap()).clone();
    advanced.cursor = decode(br#"{"conversation_id":"c","sequence":"12"}"#).unwrap();
    *service.state.lock().unwrap() = ConversationSnapshot::new(advanced).unwrap();
    service
        .history_pages
        .lock()
        .unwrap()
        .push_back(page("backward", None));
    let reply = rpc.dispatch(peer(), json!({"id":2,"method":"thread/items/list","params":{"threadId":"c","turnId":"turn","sortDirection":"desc","cursor":first["backwardsCursor"]}})).await.unwrap().unwrap();
    assert!(reply.message.get("result").is_some(), "{}", reply.message);
    {
        let queries = service.history_queries.lock().unwrap();
        assert_eq!(queries[1].as_of.sequence.get(), 9);
        assert_eq!(queries[1].before.as_ref().unwrap().as_str(), "item-1");
        assert_eq!(queries[1].direction, HistoryDirection::Backward);
    }
    for params in [
        json!({"threadId":"other","turnId":"turn","cursor":first["nextCursor"]}),
        json!({"threadId":"c","turnId":"other","cursor":first["nextCursor"]}),
        json!({"threadId":"c","cursor":{"type":"item","itemId":"item-1"}}),
        json!({"threadId":"c","limit":101}),
    ] {
        let reply = rpc
            .dispatch(
                peer(),
                json!({"id":3,"method":"thread/items/list","params":params}),
            )
            .await
            .unwrap()
            .unwrap();
        assert!(reply.message.get("error").is_some(), "{}", reply.message);
    }
    assert_eq!(service.history_queries.lock().unwrap().len(), 2);
}

fn stored_item(id: &str, turn: &str) -> HistoryItem {
    decode(&serde_json::to_vec(&json!({"conversation_id":"c","turn_id":turn,"item_id":id,"message":{"role":"assistant","text":format!("Output {id}"),"tool_calls":[]}})).unwrap()).unwrap()
}
fn turn_page(
    sequence: u64,
    direction: HistoryDirection,
    next: bool,
) -> ironloom_native::rpc::NativeTurnPage {
    use ironloom_native::rpc::{NativeTurn, NativeTurnPage, TurnMetadata, TurnStatus};
    NativeTurnPage {
        as_of: decode(
            &serde_json::to_vec(&json!({"conversation_id":"c","sequence":sequence.to_string()}))
                .unwrap(),
        )
        .unwrap(),
        direction,
        turns: vec![NativeTurn {
            turn_id: ironloom_core::TurnId::new("old-turn").unwrap(),
            metadata: TurnMetadata {
                status: TurnStatus::Failed,
                started_at_ms: Some(ironloom_core::Counter::new(1000)),
                completed_at_ms: Some(ironloom_core::Counter::new(2000)),
                duration_ms: Some(ironloom_core::Counter::new(1000)),
            },
        }],
        next_anchor: next.then(|| ironloom_core::TurnId::new("old-turn").unwrap()),
    }
}
#[tokio::test]
async fn turn_catalog_reverse_refresh_includes_anchor_without_authorizing_turn_ids_as_conversations()
 {
    let service = Service::new(state(), vec![]);
    let (rpc, authority) = router(service.clone()).await;
    authority
        .turn_pages
        .lock()
        .unwrap()
        .push_back(turn_page(9, HistoryDirection::Backward, true));
    let first = rpc.dispatch(peer(), json!({"id":1,"method":"thread/turns/list","params":{"threadId":"c","itemsView":"notLoaded","limit":1}})).await.unwrap().unwrap();
    assert_eq!(first.conversations.len(), 1);
    assert_eq!(first.conversations[0].as_str(), "c");
    assert_eq!(first.message["result"]["data"][0]["status"], "failed");
    assert_eq!(first.message["result"]["data"][0]["startedAt"], 1);
    let mut advanced = (**service.state.lock().unwrap()).clone();
    advanced.cursor = decode(br#"{"conversation_id":"c","sequence":"12"}"#).unwrap();
    *service.state.lock().unwrap() = ConversationSnapshot::new(advanced).unwrap();
    authority
        .turn_pages
        .lock()
        .unwrap()
        .push_back(turn_page(12, HistoryDirection::Forward, false));
    let reverse = rpc.dispatch(peer(), json!({"id":2,"method":"thread/turns/list","params":{"threadId":"c","itemsView":"notLoaded","sortDirection":"asc","cursor":first.message["result"]["backwardsCursor"]}})).await.unwrap().unwrap();
    assert!(
        reverse.message.get("result").is_some(),
        "{}",
        reverse.message
    );
    let queries = authority.turn_queries.lock().unwrap();
    assert_eq!(queries[1].as_of.sequence.get(), 12);
    assert!(queries[1].inclusive);
    assert_eq!(queries[1].anchor.as_ref().unwrap().as_str(), "old-turn");
    assert!(service.commands.lock().unwrap().is_empty());
}
#[tokio::test]
async fn complete_turn_items_page_without_fabricated_outcome_and_item_lookup_rejects_foreign_results()
 {
    let service = Service::new(state(), vec![]);
    let (rpc, authority) = router(service.clone()).await;
    authority
        .turn_pages
        .lock()
        .unwrap()
        .push_back(turn_page(9, HistoryDirection::Forward, false));
    for (id, next) in [("one", Some("one")), ("two", None)] {
        service.history_pages.lock().unwrap().push_back(
            HistoryPage::new(HistoryPageData {
                as_of: state().cursor.clone(),
                direction: HistoryDirection::Forward,
                turn_id: Some(ironloom_core::TurnId::new("old-turn").unwrap()),
                items: vec![stored_item(id, "old-turn")],
                next_before: None,
                next_after: next.map(|id| ironloom_core::ItemId::new(id).unwrap()),
            })
            .unwrap(),
        );
    }
    let full = rpc.dispatch(peer(), json!({"id":1,"method":"thread/turns/list","params":{"threadId":"c","sortDirection":"asc","itemsView":"full"}})).await.unwrap().unwrap();
    assert_eq!(full.message["result"]["data"][0]["itemsView"], "full");
    assert_eq!(
        full.message["result"]["data"][0]["items"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
    assert_eq!(
        service.history_queries.lock().unwrap()[1]
            .after
            .as_ref()
            .unwrap()
            .as_str(),
        "one"
    );
    *authority.item_results.lock().unwrap() = vec![
        stored_item("one", "old-turn"),
        stored_item("two", "old-turn"),
    ];
    let request = json!({"id":2,"method":"thread/items/read","params":{"threadId":"c","turnId":"old-turn","itemIds":["two","one"]}});
    let read = rpc
        .dispatch(peer(), request.clone())
        .await
        .unwrap()
        .unwrap();
    assert_eq!(read.message["result"]["data"][0]["item"]["id"], "one");
    assert_eq!(read.conversations.len(), 1);
    *authority.item_results.lock().unwrap() = vec![
        stored_item("one", "other-turn"),
        stored_item("two", "old-turn"),
    ];
    let denied = rpc.dispatch(peer(), request).await.unwrap().unwrap();
    assert!(denied.message.get("error").is_some());
    assert!(service.commands.lock().unwrap().is_empty());
}
