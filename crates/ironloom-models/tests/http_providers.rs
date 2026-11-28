use ironloom_core::{ActorId, BoxFuture, validation::decode};
use ironloom_models::{
    factory::InferenceRequest,
    providers::{
        AdapterError, Provider,
        http::{Capabilities, Credentials, Dialect, Endpoint, HttpProvider, Secret, request_body},
    },
};
use ironloom_observability::factory::BillingMode;
use ironloom_workers::factory::{StreamKind, WorkerEvent};
use serde_json::{Value, json};
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

struct FixtureCredentials;
impl Credentials for FixtureCredentials {
    fn resolve<'a>(
        &'a self,
        _: &'a InferenceRequest,
    ) -> BoxFuture<'a, Result<Secret, AdapterError>> {
        Box::pin(async { Secret::new("fixture-key".into()) })
    }
}
fn request() -> InferenceRequest {
    let corpus: Value =
        serde_json::from_str(include_str!("../../../fixtures/contracts/decode.json")).unwrap();
    let mut input = corpus["cases"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["name"] == "role-and-tool-roundtrip")
        .unwrap()["input"]
        .clone();
    input["selection"]["provider"] = "fixture".into();
    input["selection"]["engine"] = Value::Null;
    input["selection"]["devices"] = json!([]);
    input["engine_options"] = Value::Null;
    input["selection"]["billing"] = "api_key".into();
    input["selection"]["credential_id"] = "fixture-reference".into();
    input["selection"]["reasoning_effort"] = Value::Null;
    decode(&serde_json::to_vec(&input).unwrap()).unwrap()
}
fn endpoint(base: String, dialect: Dialect) -> Endpoint {
    Endpoint {
        provider: ActorId::new("fixture").unwrap(),
        base: base.parse().unwrap(),
        dialect,
        billing: BillingMode::ApiKey,
        capabilities: Capabilities {
            streaming: true,
            tools: true,
            reasoning_efforts: Vec::new(),
            stream_usage: true,
        },
    }
}
async fn fixture(body: String) -> (String, tokio::task::JoinHandle<String>) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let task = tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        let mut received = Vec::new();
        let mut block = [0; 4096];
        loop {
            let read = socket.read(&mut block).await.unwrap();
            assert_ne!(read, 0);
            received.extend_from_slice(&block[..read]);
            if let Some(end) = received.windows(4).position(|w| w == b"\r\n\r\n") {
                let headers = String::from_utf8_lossy(&received[..end]);
                let length = headers
                    .lines()
                    .find_map(|line| {
                        line.to_ascii_lowercase()
                            .strip_prefix("content-length:")
                            .and_then(|v| v.trim().parse::<usize>().ok())
                    })
                    .unwrap_or(0);
                if received.len() >= end + 4 + length {
                    break;
                }
            }
        }
        socket.write_all(format!("HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",body.len()).as_bytes()).await.unwrap();
        for chunk in body.as_bytes().chunks(3) {
            socket.write_all(chunk).await.unwrap();
        }
        String::from_utf8(received).unwrap()
    });
    (format!("http://{address}/v1/"), task)
}
fn frames(values: Vec<Value>) -> String {
    values.iter().map(|v| format!("data: {v}\n\n")).collect()
}
async fn collect(provider: &HttpProvider) -> Vec<WorkerEvent> {
    let mut stream = provider.stream(request()).await.unwrap();
    let mut events = Vec::new();
    while let Some(event) = stream.recv().await {
        events.push(event);
    }
    events
}
#[tokio::test]
async fn responses_preserve_tool_identity_and_wait_for_terminal_usage() {
    let body = frames(vec![
        json!({"type":"response.output_text.delta","delta":"hello"}),
        json!({"type":"response.output_item.added","item":{"type":"function_call","id":"item-1","call_id":"call-1","name":"read"}}),
        json!({"type":"response.function_call_arguments.delta","item_id":"item-1","delta":"{\"path\":\"src\"}"}),
        json!({"type":"response.function_call_arguments.done","item_id":"item-1","arguments":"{\"path\":\"src\"}"}),
        json!({"type":"response.completed","response":{"usage":{"input_tokens":10,"output_tokens":3}}}),
    ]);
    let (base, server) = fixture(body).await;
    let provider = HttpProvider::new(
        endpoint(base, Dialect::Responses),
        Arc::new(FixtureCredentials),
    )
    .unwrap();
    let events = collect(&provider).await;
    assert_eq!(events.last().unwrap().kind, StreamKind::Completed);
    let original = request();
    assert!(events.iter().all(|event| event.turn_id == original.turn_id
        && event.item_id == original.item_id
        && event.assignment_id == original.assignment_id));
    let tool = events
        .iter()
        .find(|e| e.kind == StreamKind::ToolReady)
        .unwrap();
    assert_eq!(tool.tool_call_id.as_ref().unwrap().as_str(), "call-1");
    assert_eq!(
        events
            .iter()
            .find_map(|e| e.usage.as_ref())
            .unwrap()
            .output_tokens
            .unwrap()
            .get(),
        3
    );
    let raw = server.await.unwrap();
    let payload: Value = serde_json::from_str(raw.split_once("\r\n\r\n").unwrap().1).unwrap();
    assert_eq!(payload["store"], false);
    assert_eq!(payload["stream"], true);
    assert!(
        payload["tools"]
            .as_array()
            .unwrap()
            .iter()
            .all(|tool| tool["parameters"].is_object())
    );
    let original = request();
    for message in &original.messages {
        for call in &message.tool_calls {
            assert!(
                payload["input"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .any(|value| value["type"] == "function_call"
                        && value["call_id"] == call.tool_call_id.as_str())
            );
        }
        if let Some(result) = &message.tool_result {
            assert!(
                payload["input"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .any(|value| value["type"] == "function_call_output"
                        && value["call_id"] == result.tool_call_id.as_str())
            );
        }
    }
    assert!(
        payload["input"]
            .as_array()
            .unwrap()
            .iter()
            .any(|v| v["type"] == "function_call_output")
    );
}
#[tokio::test]
async fn anthropic_cumulative_usage_is_not_added_twice() {
    let body = frames(vec![
        json!({"type":"message_start","message":{"usage":{"input_tokens":8,"output_tokens":1}}}),
        json!({"type":"content_block_delta","delta":{"type":"text_delta","text":"fixture"}}),
        json!({"type":"message_delta","usage":{"output_tokens":2}}),
        json!({"type":"message_delta","usage":{"output_tokens":4}}),
        json!({"type":"message_stop"}),
    ]);
    let (base, server) = fixture(body).await;
    let provider = HttpProvider::new(
        endpoint(base, Dialect::Anthropic),
        Arc::new(FixtureCredentials),
    )
    .unwrap();
    let events = collect(&provider).await;
    assert_eq!(
        events
            .iter()
            .find_map(|e| e.usage.as_ref())
            .unwrap()
            .output_tokens
            .unwrap()
            .get(),
        4
    );
    assert_eq!(events.last().unwrap().kind, StreamKind::Completed);
    assert!(
        server
            .await
            .unwrap()
            .to_ascii_lowercase()
            .contains("anthropic-version: 2023-06-01")
    );
}
#[tokio::test]
async fn compatible_final_usage_after_finish_reason_is_retained() {
    let mut body = frames(vec![
        json!({"choices":[{"delta":{"content":"ok"},"finish_reason":null}]}),
        json!({"choices":[{"delta":{},"finish_reason":"stop"}]}),
        json!({"choices":[],"usage":{"prompt_tokens":7,"completion_tokens":2}}),
    ]);
    body.push_str("data: [DONE]\n\n");
    let (base, server) = fixture(body).await;
    let provider = HttpProvider::new(
        endpoint(base, Dialect::ChatCompletions),
        Arc::new(FixtureCredentials),
    )
    .unwrap();
    let events = collect(&provider).await;
    assert_eq!(
        events
            .iter()
            .find_map(|e| e.usage.as_ref())
            .unwrap()
            .input_tokens
            .unwrap()
            .get(),
        7
    );
    assert_eq!(events.last().unwrap().kind, StreamKind::Completed);
    server.await.unwrap();
}
#[tokio::test]
async fn stream_eof_is_failure_with_unknown_usage_never_completion() {
    let (base, server) = fixture(frames(vec![
        json!({"type":"response.output_text.delta","delta":"partial"}),
    ]))
    .await;
    let provider = HttpProvider::new(
        endpoint(base, Dialect::Responses),
        Arc::new(FixtureCredentials),
    )
    .unwrap();
    let events = collect(&provider).await;
    assert!(
        !events
            .iter()
            .any(|e| e.kind == StreamKind::Completed || e.kind == StreamKind::TerminationConfirmed)
    );
    assert_eq!(events.last().unwrap().kind, StreamKind::Failed);
    let usage = events.iter().find_map(|e| e.usage.as_ref()).unwrap();
    assert!(usage.input_tokens.is_none() && usage.output_tokens.is_none());
    server.await.unwrap();
}
#[test]
fn explicit_billing_and_effort_never_fall_back() {
    let mut config = endpoint("https://api.openai.com/v1/".into(), Dialect::Responses);
    config.billing = BillingMode::Account;
    assert_eq!(
        request_body(&config, &request()),
        Err(AdapterError::Unsupported)
    );
    let mut account = (*request()).clone();
    let mut selection = (*account.selection).clone();
    selection.billing = BillingMode::Account;
    account.selection = ironloom_models::factory::ModelSelection::new(selection).unwrap();
    let account = InferenceRequest::new(account).unwrap();
    let payload = request_body(&config, &account).unwrap();
    assert_eq!(payload["store"], false);
    config.base = "https://another.example/v1/".parse().unwrap();
    assert!(HttpProvider::new(config, Arc::new(FixtureCredentials)).is_err());
    assert_eq!(
        format!("{:?}", Secret::new("private".into()).unwrap()),
        "[REDACTED]"
    );
}
#[tokio::test]
async fn declared_nonstreaming_endpoint_returns_visible_completed_output() {
    let(base,server)=fixture(json!({"choices":[{"message":{"content":"final"},"finish_reason":"stop"}],"usage":{"prompt_tokens":2,"completion_tokens":1}}).to_string()).await;
    let mut config = endpoint(base, Dialect::ChatCompletions);
    config.capabilities.streaming = false;
    let provider = HttpProvider::new(config, Arc::new(FixtureCredentials)).unwrap();
    let events = collect(&provider).await;
    assert_eq!(events.last().unwrap().kind, StreamKind::Completed);
    assert!(events.iter().any(|e| e.text == "final"));
    let raw = server.await.unwrap();
    assert!(raw.contains("\"stream\":false"));
}

#[tokio::test]
async fn slow_service_consumer_keeps_burst_output_and_final_usage() {
    let mut values = vec![json!({"type":"response.output_text.delta","delta":"x"}); 300];
    values.push(json!({"type":"response.completed","response":{"usage":{"input_tokens":1,"output_tokens":300}}}));
    let (base, server) = fixture(frames(values)).await;
    let provider = HttpProvider::new(
        endpoint(base, Dialect::Responses),
        Arc::new(FixtureCredentials),
    )
    .unwrap();
    let mut receiver = provider.stream(request()).await.unwrap();
    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    let mut events = Vec::new();
    while let Some(event) = receiver.recv().await {
        events.push(event);
    }
    assert_eq!(
        events
            .iter()
            .filter(|e| e.kind == StreamKind::TextDelta)
            .count(),
        300
    );
    assert_eq!(events.last().unwrap().kind, StreamKind::Completed);
    assert_eq!(
        events
            .iter()
            .find_map(|e| e.usage.as_ref())
            .unwrap()
            .output_tokens
            .unwrap()
            .get(),
        300
    );
    server.await.unwrap();
}
