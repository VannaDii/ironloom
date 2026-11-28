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
