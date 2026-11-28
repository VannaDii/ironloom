use ironloom_core::{BoxFuture, InferenceId};
use ironloom_models::{
    factory::{InferenceRequest, MessageRole, ToolResultStatus},
    providers::{AdapterError, InferenceStream, Provider},
};
use ironloom_workers::factory::{StreamKind, WorkerEvent, WorkerEventData};
use serde_json::Value;

struct ScriptedProvider;
impl Provider for ScriptedProvider {
    fn stream(
        &self,
        request: InferenceRequest,
    ) -> BoxFuture<'_, Result<InferenceStream, AdapterError>> {
        Box::pin(async move {
            // These assertions exercise the actual public adapter port, not an alternate input DTO.
            assert_eq!(request.messages[0].role, MessageRole::System);
            assert_eq!(request.messages[1].role, MessageRole::User);
            let call = &request.messages[2].tool_calls[0];
            let result = request.messages[3].tool_result.as_ref().unwrap();
            assert_eq!(request.messages[2].role, MessageRole::Assistant);
            assert_eq!(request.messages[3].role, MessageRole::Tool);
            assert_eq!(call.tool_call_id, result.tool_call_id);
            assert_eq!(result.status, ToolResultStatus::Succeeded);
            assert_eq!(result.content, "fixture file content");
            assert_eq!(call.arguments["path"], "src/main.rs");
            assert_eq!(request.tools[0].name, call.name);
            assert_eq!(
                request.tools[0].input_schema["properties"]["path"]["type"],
                "string"
            );
            let (sender, receiver) = tokio::sync::mpsc::channel(2);
            for kind in [StreamKind::Started, StreamKind::Completed] {
                sender
                    .send(
                        WorkerEvent::new(WorkerEventData {
                            worker_id: request.worker_id.clone(),
                            turn_id: request.turn_id.clone(),
                            item_id: request.item_id.clone(),
                            assignment_id: request.assignment_id.clone(),
                            inference_id: Some(request.inference_id.clone()),
                            tool_call_id: None,
                            kind,
                            text: String::new(),
                            state: None,
                            usage: None,
                        })
                        .unwrap(),
                    )
                    .await
                    .unwrap();
            }
            Ok(receiver)
        })
    }
    fn cancel(&self, _: InferenceId) -> BoxFuture<'_, Result<(), AdapterError>> {
        Box::pin(async { Ok(()) })
    }
}
#[tokio::test]
async fn provider_port_carries_service_identity_and_typed_tool_conversation() {
    let corpus: Value =
        serde_json::from_str(include_str!("../../../fixtures/contracts/decode.json")).unwrap();
    let input = corpus["cases"]
        .as_array()
        .unwrap()
        .iter()
        .find(|case| case["name"] == "role-and-tool-roundtrip")
        .unwrap()["input"]
        .clone();
    let request: InferenceRequest = serde_json::from_value(input).unwrap();
    let provider: &dyn Provider = &ScriptedProvider;
    let mut stream = provider.stream(request.clone()).await.unwrap();
    for kind in [StreamKind::Started, StreamKind::Completed] {
        let event = stream.recv().await.unwrap();
        assert_eq!(event.kind, kind);
        assert_eq!(event.turn_id, request.turn_id);
        assert_eq!(event.item_id, request.item_id);
        assert_eq!(event.inference_id.as_ref(), Some(&request.inference_id));
    }
    assert!(stream.recv().await.is_none());
}
