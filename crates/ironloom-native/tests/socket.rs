use futures_util::{SinkExt, StreamExt};
use ironloom_core::{ActorId, BoxFuture, ConversationId, Counter, validation::decode};
use ironloom_native::{relay::*, socket::*};
use ironloom_service::factory::NativeEnrollment;
use serde_json::{Value, json};
use std::{
    collections::BTreeMap,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicUsize, Ordering},
    },
};
use tokio::sync::{Notify, watch};
use tokio_tungstenite::tungstenite::{Message, http::HeaderMap};
#[derive(Default)]
struct State {
    pending: Mutex<Vec<Outbound>>,
    inbound: Mutex<BTreeMap<Peer, Counter>>,
    issued: AtomicUsize,
    deliveries: AtomicUsize,
}
impl RelayStore for State {
    fn peer(
        &self,
        client: ActorId,
        stream: Option<ActorId>,
        _: bool,
    ) -> BoxFuture<'_, Result<Peer, RelayError>> {
        Box::pin(async {
            Ok(Peer {
                client,
                stream: stream.ok_or(RelayError::Protocol)?,
            })
        })
    }
    fn inbound(&self, peer: Peer) -> BoxFuture<'_, Result<Option<Counter>, RelayError>> {
        Box::pin(async move { Ok(self.inbound.lock().unwrap().get(&peer).copied()) })
    }
    fn consumed(
        &self,
        peer: Peer,
        sequence: Option<Counter>,
        _: Option<String>,
    ) -> BoxFuture<'_, Result<(), RelayError>> {
        Box::pin(async move {
            if let Some(sequence) = sequence {
                self.inbound.lock().unwrap().insert(peer, sequence);
            }
            Ok(())
        })
    }
    fn enqueue(
        &self,
        peer: Peer,
        payload: Payload,
        conversations: Vec<ConversationId>,
    ) -> BoxFuture<'_, Result<Outbound, RelayError>> {
        Box::pin(async move {
            let output = Outbound {
                peer,
                sequence: Counter::new(self.issued.fetch_add(1, Ordering::SeqCst) as u64 + 1),
                first_segment: None,
                payload,
                conversations,
            };
            self.pending.lock().unwrap().push(output.clone());
            Ok(output)
        })
    }
    fn delivery<'a>(&'a self, _: &'a Outbound) -> BoxFuture<'a, Result<(), RelayError>> {
        Box::pin(async {
            self.deliveries.fetch_add(1, Ordering::SeqCst);
            Ok(())
        })
    }
    fn acknowledge(
        &self,
        peer: Peer,
        sequence: Counter,
        segment: Option<Counter>,
    ) -> BoxFuture<'_, Result<(), RelayError>> {
        Box::pin(async move {
            assert!(segment.is_none());
            self.pending
                .lock()
                .unwrap()
                .retain(|v| v.peer != peer || v.sequence > sequence);
            Ok(())
        })
    }
    fn resume(&self) -> BoxFuture<'_, Result<Resume, RelayError>> {
        Box::pin(async {
            Ok(Resume {
                cursor: Some("opaque-subscription".into()),
                outbound: self.pending.lock().unwrap().clone(),
            })
        })
    }
    fn closed(&self, _: Peer) -> BoxFuture<'_, Result<(), RelayError>> {
        Box::pin(async { Ok(()) })
    }
}
struct Auth;
impl ConnectionAuth for Auth {
    fn headers(
        &self,
        enrollment: NativeEnrollment,
    ) -> BoxFuture<'_, Result<HeaderMap, RelayError>> {
        Box::pin(async move {
            assert_eq!(enrollment.authentication_generation.get(), 2);
            let mut headers = HeaderMap::new();
            headers.insert("authorization", "Bearer fixture-control".parse().unwrap());
            Ok(headers)
        })
    }
}
#[derive(Default)]
struct Rpc {
    calls: AtomicUsize,
    disconnected: AtomicBool,
    gate: Option<Arc<Notify>>,
    entered: Notify,
}
impl Dispatcher for Rpc {
    fn dispatch(
        &self,
        _: Peer,
        message: Value,
    ) -> BoxFuture<'_, Result<Option<Reply>, RelayError>> {
        Box::pin(async move {
            self.calls.fetch_add(1, Ordering::SeqCst);
            if let Some(gate) = &self.gate {
                self.entered.notify_one();
                gate.notified().await;
            }
            Ok(Some(Reply {
                message: json!({"id":message["id"],"result":{"fixture":true}}),
                conversations: vec![ConversationId::new("c").unwrap()],
            }))
        })
    }
    fn connected(&self) -> BoxFuture<'_, Result<(), RelayError>> {
        Box::pin(async { Ok(()) })
    }
    fn ready(&self, _: Peer) -> BoxFuture<'_, Result<(), RelayError>> {
        Box::pin(async { Ok(()) })
    }
    fn initialized(&self, _: Peer) -> BoxFuture<'_, bool> {
        Box::pin(async { true })
    }
    fn closed(&self, _: Peer) -> BoxFuture<'_, Result<(), RelayError>> {
        Box::pin(async { Ok(()) })
    }
    fn disconnected(&self) -> BoxFuture<'_, Result<(), RelayError>> {
        Box::pin(async {
            self.disconnected.store(true, Ordering::SeqCst);
            Ok(())
        })
    }
}
fn enrollment(base: &str) -> NativeEnrollment {
    let corpus: Value =
        serde_json::from_str(include_str!("../../../fixtures/contracts/decode.json")).unwrap();
    let mut input = corpus["cases"]
        .as_array()
        .unwrap()
        .iter()
        .find(|v| v["name"] == "distinct-relay-and-native-identities")
        .unwrap()["input"]
        .clone();
    for field in [
        "websocket_url",
        "enroll_url",
        "refresh_url",
        "pair_url",
        "pair_status_url",
    ] {
        input["relay_target"][field] = format!("{base}/{field}").replace("http://", "ws://").into();
        if field != "websocket_url" {
            input["relay_target"][field] = format!("{base}/{field}").into();
        }
    }
    input["persistence_key"]["websocket_url"] = input["relay_target"]["websocket_url"].clone();
    decode(&serde_json::to_vec(&input).unwrap()).unwrap()
}
#[tokio::test]
async fn websocket_replays_durable_reply_without_repeating_dispatch_after_disconnect() {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let server = tokio::spawn(async move {
        let mut outputs = Vec::new();
        for round in 0..2 {
            let (tcp, _) = listener.accept().await.unwrap();
            let mut socket = tokio_tungstenite::accept_hdr_async(tcp, CheckHeaders)
                .await
                .unwrap();
            if round == 0 {
                socket.send(Message::Text(json!({"type":"client_message","client_id":"viewer","stream_id":"stream","seq_id":1,"cursor":"opaque-inbound","message":{"id":4,"method":"fixture"}}).to_string().into())).await.unwrap();
            }
            loop {
                let frame = socket.next().await.unwrap().unwrap();
                if let Message::Text(text) = frame {
                    outputs.push(serde_json::from_str::<Value>(&text).unwrap());
                    break;
                }
            }
            socket.close(None).await.unwrap();
        }
        outputs
    });
    let state = Arc::new(State::default());
    let rpc = Arc::new(Rpc::default());
    let adapter = NativeSocket::new(
        state.clone(),
        Arc::new(Auth),
        rpc.clone(),
        "fixture".into(),
        Arc::new(Notify::new()),
    )
    .unwrap();
    let (_stop, token) = watch::channel(false);
    for _ in 0..2 {
        assert!(matches!(
            adapter.connect(enrollment(&base), token.clone()).await,
            Err(RelayError::Unavailable)
        ));
    }
    let outputs = server.await.unwrap();
    assert_eq!(outputs[0], outputs[1]);
    assert_eq!(outputs[0]["seq_id"], 1);
    assert_eq!(rpc.calls.load(Ordering::SeqCst), 1);
    assert_eq!(state.deliveries.load(Ordering::SeqCst), 2);
    assert!(rpc.disconnected.load(Ordering::SeqCst));
}

struct CheckHeaders;
impl tokio_tungstenite::tungstenite::handshake::server::Callback for CheckHeaders {
    fn on_request(
        self,
        request: &tokio_tungstenite::tungstenite::handshake::server::Request,
        response: tokio_tungstenite::tungstenite::handshake::server::Response,
    ) -> Result<
        tokio_tungstenite::tungstenite::handshake::server::Response,
        tokio_tungstenite::tungstenite::handshake::server::ErrorResponse,
    > {
        assert_eq!(request.headers()["x-codex-protocol-version"], "3");
        assert_eq!(request.headers()["x-codex-server-id"], "server-1");
        assert_eq!(
            request.headers()["x-codex-subscribe-cursor"],
            "opaque-subscription"
        );
        assert_eq!(request.headers()["authorization"], "Bearer fixture-control");
        Ok(response)
    }
}

#[tokio::test]
async fn slow_rpc_does_not_block_websocket_pings_or_lose_durable_reply() {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let gate = Arc::new(Notify::new());
    let rpc = Arc::new(Rpc {
        gate: Some(gate.clone()),
        ..Rpc::default()
    });
    let server_rpc = rpc.clone();
    let server = tokio::spawn(async move {
        let (tcp, _) = listener.accept().await.unwrap();
        let mut socket = tokio_tungstenite::accept_hdr_async(tcp, CheckHeaders)
            .await
            .unwrap();
        socket.send(Message::Text(json!({"type":"client_message","client_id":"viewer","stream_id":"stream","seq_id":1,"message":{"id":4,"method":"fixture"}}).to_string().into())).await.unwrap();
        server_rpc.entered.notified().await;
        socket
            .send(Message::Ping(b"still-live".to_vec().into()))
            .await
            .unwrap();
        tokio::time::timeout(std::time::Duration::from_secs(2), async {
            loop {
                if let Message::Pong(data) = socket.next().await.unwrap().unwrap() {
                    assert_eq!(data.as_ref(), b"still-live");
                    break;
                }
            }
        })
        .await
        .unwrap();
        gate.notify_one();
        loop {
            if let Message::Text(text) = socket.next().await.unwrap().unwrap() {
                let value: Value = serde_json::from_str(&text).unwrap();
                assert_eq!(value["message"]["id"], 4);
                break;
            }
        }
        socket.close(None).await.unwrap();
    });
    let state = Arc::new(State::default());
    let adapter = NativeSocket::new(
        state.clone(),
        Arc::new(Auth),
        rpc.clone(),
        "fixture".into(),
        Arc::new(Notify::new()),
    )
    .unwrap();
    let (_stop, token) = watch::channel(false);
    assert!(matches!(
        adapter.connect(enrollment(&base), token).await,
        Err(RelayError::Unavailable)
    ));
    server.await.unwrap();
    assert_eq!(rpc.calls.load(Ordering::SeqCst), 1);
    assert_eq!(state.pending.lock().unwrap().len(), 1);
}
