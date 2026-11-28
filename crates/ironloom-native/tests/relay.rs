use ironloom_core::{ActorId, BoxFuture, ConversationId, Counter};
use ironloom_native::relay::{
    Decoded, Decoder, Outbound, Payload, Peer, RelayError, RelayStore, Resume, frames,
};
use serde_json::{Value, json};
use std::{collections::BTreeMap, sync::Mutex};
#[derive(Default)]
struct Store(Mutex<BTreeMap<Peer, Counter>>);
impl RelayStore for Store {
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
        Box::pin(async move { Ok(self.0.lock().unwrap().get(&peer).copied()) })
    }
    fn consumed(
        &self,
        peer: Peer,
        sequence: Option<Counter>,
        _: Option<String>,
    ) -> BoxFuture<'_, Result<(), RelayError>> {
        Box::pin(async move {
            if let Some(sequence) = sequence {
                let mut state = self.0.lock().unwrap();
                let maximum = state
                    .get(&peer)
                    .copied()
                    .unwrap_or(Counter::new(0))
                    .max(sequence);
                state.insert(peer, maximum);
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
        Box::pin(async {
            Ok(Outbound {
                peer,
                sequence: Counter::new(1),
                first_segment: None,
                payload,
                conversations,
            })
        })
    }
    fn delivery<'a>(&'a self, _: &'a Outbound) -> BoxFuture<'a, Result<(), RelayError>> {
        Box::pin(async { Ok(()) })
    }
    fn acknowledge(
        &self,
        _: Peer,
        _: Counter,
        _: Option<Counter>,
    ) -> BoxFuture<'_, Result<(), RelayError>> {
        Box::pin(async { Ok(()) })
    }
    fn resume(&self) -> BoxFuture<'_, Result<Resume, RelayError>> {
        Box::pin(async {
            Ok(Resume {
                cursor: None,
                outbound: Vec::new(),
            })
        })
    }
    fn closed(&self, _: Peer) -> BoxFuture<'_, Result<(), RelayError>> {
        Box::pin(async { Ok(()) })
    }
}
fn peer() -> Peer {
    Peer {
        client: ActorId::new("client").unwrap(),
        stream: ActorId::new("stream").unwrap(),
    }
}
#[tokio::test]
async fn chunks_reassemble_and_durable_input_frontier_survives_decoder_replacement() {
    let message = json!({"id":"call","method":"fixture","params":{"text":"x".repeat(200_000)}});
    let output = Outbound {
        peer: peer(),
        sequence: Counter::new(7),
        first_segment: None,
        payload: Payload::ServerMessage {
            message: message.clone(),
        },
        conversations: Vec::new(),
    };
    let frames = frames(&output).unwrap();
    assert_eq!(frames.len(), 2);
    let store = Store::default();
    let mut decoder = Decoder::default();
    for (index, frame) in frames.into_iter().enumerate() {
        let frame = frame.replace("server_message_chunk", "client_message_chunk");
        let decoded = decoder.accept(frame.as_bytes(), &store).await.unwrap();
        if index == 0 {
            assert!(matches!(decoded, Decoded::None));
        } else {
            let Decoded::Message(input) = decoded else {
                panic!("complete message missing")
            };
            assert_eq!(input.message, message);
            assert_eq!(input.sequence.unwrap().get(), 7);
            store
                .consumed(input.peer, input.sequence, Some("relay-cursor".into()))
                .await
                .unwrap();
        }
    }
    let duplicate = json!({"type":"client_message","client_id":"client","stream_id":"stream","seq_id":7,"message":{"id":"call","method":"fixture"}});
    assert!(matches!(
        Decoder::default()
            .accept(duplicate.to_string().as_bytes(), &store)
            .await
            .unwrap(),
        Decoded::None
    ));
}
#[tokio::test]
async fn conflicting_chunks_and_huge_allocations_are_rejected_before_dispatch() {
    let store = Store::default();
    let mut decoder = Decoder::default();
    let mut frame = json!({"type":"client_message_chunk","client_id":"client","stream_id":"stream","seq_id":1,"segment_id":0,"segment_count":2,"message_size_bytes":4,"message_chunk_base64":"e30="});
    assert!(matches!(
        decoder
            .accept(frame.to_string().as_bytes(), &store)
            .await
            .unwrap(),
        Decoded::None
    ));
    frame["message_chunk_base64"] = Value::String("e10=".into());
    assert!(
        decoder
            .accept(frame.to_string().as_bytes(), &store)
            .await
            .is_err()
    );
    frame["message_size_bytes"] = json!(usize::MAX);
    assert!(
        Decoder::default()
            .accept(frame.to_string().as_bytes(), &store)
            .await
            .is_err()
    );
    frame["message_size_bytes"] = json!(4);
    frame["segment_count"] = json!(usize::MAX);
    assert!(
        Decoder::default()
            .accept(frame.to_string().as_bytes(), &store)
            .await
            .is_err()
    );
}

#[test]
fn reconnect_skips_only_acknowledged_chunks_without_renumbering() {
    let mut output = Outbound {
        peer: peer(),
        sequence: Counter::new(7),
        first_segment: None,
        payload: Payload::ServerMessage {
            message: json!({"text":"x".repeat(300_000)}),
        },
        conversations: Vec::new(),
    };
    let complete = frames(&output).unwrap();
    assert_eq!(complete.len(), 3);
    output.first_segment = Some(Counter::new(1));
    let resumed = frames(&output).unwrap();
    assert_eq!(resumed, complete[1..]);
    let value: Value = serde_json::from_str(&resumed[0]).unwrap();
    assert_eq!(value["seq_id"], 7);
    assert_eq!(value["segment_id"], 1);
    assert_eq!(value["segment_count"], 3);
    output.first_segment = Some(Counter::new(3));
    assert!(matches!(frames(&output), Err(RelayError::Protocol)));
    output.payload = Payload::ServerMessage {
        message: json!({"text":"small"}),
    };
    assert!(matches!(frames(&output), Err(RelayError::Protocol)));
}
