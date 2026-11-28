use ironloom_core::{OperatorId, validation::decode};
use ironloom_native::prompts::{self, PromptError};
use ironloom_service::factory::ConversationSnapshot;
use serde_json::{Value, json};
fn state() -> Value {
    let corpus: Value =
        serde_json::from_str(include_str!("../../../fixtures/contracts/decode.json")).unwrap();
    corpus["cases"]
        .as_array()
        .unwrap()
        .iter()
        .find(|v| v["name"] == "consistent-pending-state")
        .unwrap()["input"]
        .clone()
}
fn decode_state(value: &Value) -> ConversationSnapshot {
    decode(&serde_json::to_vec(value).unwrap()).unwrap()
}
#[test]
fn native_question_reply_retains_question_turn_item_revision_and_choice_text_modes() {
    let state = decode_state(&state());
    let operator = OperatorId::new("operator").unwrap();
    let requests = prompts::requests(&state).unwrap();
    let request = &requests[0];
    assert_eq!(request["method"], "item/tool/requestUserInput");
    assert_eq!(request["params"]["threadId"], "conversation-1");
    assert_eq!(request["params"]["turnId"], "turn-1");
    assert_eq!(
        request["params"]["questions"][0]["options"][0]["label"],
        "a"
    );
    let action = prompts::answer(
        &state,
        &operator,
        request["id"].as_str().unwrap(),
        &json!({"answers":{"question-1":{"answers":["a","b","additional context"]}}}),
    )
    .unwrap();
    let value = serde_json::to_value(action).unwrap();
    assert_eq!(value["data"]["question_id"], "question-1");
    assert_eq!(value["data"]["turn_id"], "turn-1");
    assert_eq!(value["data"]["item_id"], "item-1");
    assert_eq!(value["data"]["expected_revision"], "1");
    assert_eq!(value["data"]["choices"], json!(["a", "b"]));
    assert_eq!(value["data"]["text"], "additional context");
    let mut changed = (*state).clone();
    changed.pending_questions.clear();
    let changed = ConversationSnapshot::new(changed).unwrap();
    assert!(matches!(
        prompts::answer(
            &changed,
            &operator,
            request["id"].as_str().unwrap(),
            &json!({"answers":{"question-1":{"answers":["a"]}}})
        ),
        Err(PromptError::Stale)
    ));
}
#[test]
fn exact_plan_approval_rejects_new_revision_and_uses_current_authenticated_human() {
    let mut value = state();
    value["pending_questions"] = json!([]);
    value["plan"] = json!({"plan_id":"plan-1","revision":"4","project_id":"project-1","scope":"Implement only the approved scope","assumptions":[],"acceptance_criteria":["deterministic tests"],"content_hash":"hash-4","model_assignments":[],"allowed_permissions":[]});
    let state = decode_state(&value);
    let operator = OperatorId::new("current-human").unwrap();
    let request = &prompts::requests(&state).unwrap()[0];
    assert!(
        request["params"]["questions"][0]["question"]
            .as_str()
            .unwrap()
            .contains("hash-4")
    );
    let reply = json!({"answers":{"plan":{"answers":["Approve"]}}});
    let action =
        prompts::answer(&state, &operator, request["id"].as_str().unwrap(), &reply).unwrap();
    let action = serde_json::to_value(action).unwrap();
    assert_eq!(
        action["data"]["plan"],
        json!({"plan_id":"plan-1","revision":"4","content_hash":"hash-4","approved_by":"current-human"})
    );
    value["plan"]["revision"] = "5".into();
    value["plan"]["content_hash"] = "hash-5".into();
    assert!(matches!(
        prompts::answer(
            &decode_state(&value),
            &operator,
            request["id"].as_str().unwrap(),
            &reply
        ),
        Err(PromptError::Stale)
    ));
    assert!(matches!(
        prompts::answer(
            &state,
            &operator,
            request["id"].as_str().unwrap(),
            &json!({"answers":{"plan":{"answers":["Anything else"]}}})
        ),
        Err(PromptError::Invalid)
    ));
}
