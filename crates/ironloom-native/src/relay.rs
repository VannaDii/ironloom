//! Direct protocol-v3 relay framing; durable transport state is supplied by the service.
use base64::Engine as _;
use ironloom_core::{ActorId, BoxFuture, ConversationId, Counter};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    collections::BTreeMap,
    time::{Duration, Instant},
};

const CHUNK_BYTES: usize = 100 * 1024;
const MAX_WIRE_BYTES: usize = 150 * 1024;
const MAX_MESSAGE_BYTES: usize = 100 * 1024 * 1024;
const MAX_SEGMENTS: usize = 1024;
const MAX_ASSEMBLIES: usize = 128;
const ASSEMBLY_LIFETIME: Duration = Duration::from_secs(120);
/// Safe relay failure. Submitted messages and authentication data are never formatted here.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RelayError {
    /// Malformed, oversized or inconsistent protocol input.
    Protocol,
    /// Service-owned durable state cannot currently be used.
    Unavailable,
    /// Relay rejected its current control token; refresh only the same enrollment generation.
    Authentication,
    /// A current service operation requires explicit approval, independently from authentication.
    ApprovalRequired,
    /// Pinned upstream missing-registration detail; reenrollment requires current service authority.
    MissingRegistration,
    /// An unrelated lookup failure must preserve enrollment/server identity.
    NotFound,
    /// Preserve upstream Retry-After seconds/date for transport retry scheduling.
    Deferred(Option<String>),
}
/// Connection identity; neither value confers project/session authority.
#[derive(Clone, Debug, Eq, PartialEq, Ord, PartialOrd)]
pub struct Peer {
    /// Upstream relay client identity.
    pub client: ActorId,
    /// Native transport stream identity, independent of a service replay cursor.
    pub stream: ActorId,
}
/// Persisted protocol payload, keeping liveness distinct from JSON-RPC application messages.
#[derive(Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Payload {
    /// One complete JSON-RPC application message.
    ServerMessage {
        /// Validated JSON-RPC response, request or notification.
        message: Value,
    },
    /// Native protocol liveness response; does not authorize execution.
    Pong {
        /// Whether this client stream is initialized.
        status: String,
    },
}
/// Reconnect state loaded from PostgreSQL, without a new execution request.
pub struct Resume {
    /// Opaque upstream subscription cursor, separate from service cursors.
    pub cursor: Option<String>,
    /// Exact unacknowledged output, retaining original sequence IDs.
    pub outbound: Vec<Outbound>,
}
/// Service-assigned durable outbound message, replayed with the same sequence on reconnect.
#[derive(Clone)]
pub struct Outbound {
    /// Authorized recipient stream.
    pub peer: Peer,
    /// Durable outbound sequence assigned atomically by the store.
    pub sequence: Counter,
    /// First unacknowledged wire chunk after a partial cumulative acknowledgement.
    /// None sends the complete message; a fully acknowledged message is removed by the store.
    pub first_segment: Option<Counter>,
    /// JSON-RPC response/request/notification; never raw provider credentials.
    pub payload: Payload,
    /// Service conversation scopes used for live replay/delivery authorization.
    pub conversations: Vec<ConversationId>,
}
/// PostgreSQL-backed transport state implemented in the service/storage lane.
/// Implementations must scope every operation to the configured enrollment generation.
pub trait RelayStore: Send + Sync {
    /// Resolves an upstream stream or allocates the initial stream for a client handshake.
    fn peer(
        &self,
        client: ActorId,
        stream: Option<ActorId>,
        initialize: bool,
    ) -> BoxFuture<'_, Result<Peer, RelayError>>;
    /// Returns the last atomically accepted native input sequence for this peer, if any.
    fn inbound(&self, peer: Peer) -> BoxFuture<'_, Result<Option<Counter>, RelayError>>;
    /// Monotonically commits consumed input and opaque subscription cursor after dispatch/output
    /// persistence. Replayed initialize may restore negotiation without rewinding the input frontier.
    fn consumed(
        &self,
        peer: Peer,
        sequence: Option<Counter>,
        cursor: Option<String>,
    ) -> BoxFuture<'_, Result<(), RelayError>>;
    /// Atomically allocates an outbound sequence and persists the message before network delivery.
    fn enqueue(
        &self,
        peer: Peer,
        payload: Payload,
        conversations: Vec<ConversationId>,
    ) -> BoxFuture<'_, Result<Outbound, RelayError>>;
    /// Rechecks current enrollment generation, human session and every stored conversation grant
    /// immediately before delivery, including persisted replies after reconnect. A cached prior
    /// authorization is insufficient; failure closes the viewer and never cancels execution.
    fn delivery<'a>(&'a self, outbound: &'a Outbound) -> BoxFuture<'a, Result<(), RelayError>>;
    /// Trims only cumulatively acknowledged frames, rejecting acknowledgements beyond issued sequences.
    fn acknowledge(
        &self,
        peer: Peer,
        sequence: Counter,
        segment: Option<Counter>,
    ) -> BoxFuture<'_, Result<(), RelayError>>;
    /// Returns unacknowledged messages plus the opaque subscribe cursor after a reconnect.
    fn resume(&self) -> BoxFuture<'_, Result<Resume, RelayError>>;
    /// Releases this viewer's subscriptions, without cancelling assignments or deleting history.
    fn closed(&self, peer: Peer) -> BoxFuture<'_, Result<(), RelayError>>;
}
#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum Event {
    ClientMessage {
        message: Value,
    },
    ClientMessageChunk {
        segment_id: usize,
        segment_count: usize,
        message_size_bytes: usize,
        message_chunk_base64: String,
    },
    Ack {
        segment_id: Option<u64>,
    },
    Ping,
    ClientClosed,
}
#[derive(Deserialize)]
struct Envelope {
    #[serde(flatten)]
    event: Event,
    client_id: ActorId,
    stream_id: Option<ActorId>,
    seq_id: Option<u64>,
    cursor: Option<String>,
}
struct Assembly {
    created: Instant,
    size: usize,
    received: usize,
    segments: Vec<Option<Vec<u8>>>,
}
/// Reassembled input. Call `consumed` only after durable service dispatch and response enqueue.
pub struct Input {
    /// Native recipient identity, independently authenticated by the RPC authority callback.
    pub peer: Peer,
    /// Per-stream native sequence, unrelated to Ironloom event sequences.
    pub sequence: Option<Counter>,
    /// Opaque upstream cursor to checkpoint after this message is accepted.
    pub cursor: Option<String>,
    /// Bounded complete JSON-RPC message.
    pub message: Value,
}
/// One WebSocket's bounded partial-message state. No session or execution state lives here.
#[derive(Default)]
pub struct Decoder {
    assemblies: BTreeMap<(Peer, Option<u64>), Assembly>,
}
/// Non-message relay actions; execution lifetime remains service-owned.
pub enum Decoded {
    /// Complete input for authenticated service mapping.
    Message(Input),
    /// No dispatch for partial chunks, duplicate inputs or acknowledgements.
    None,
    /// A client explicitly detached; remove only that viewer, without cancelling its work.
    Closed(Peer),
    /// Reply to a relay liveness request without starting any work.
    Pong(Peer),
}
impl Decoder {
    /// Decodes a protocol-v3 frame and checks durable duplicate/ack frontiers.
    pub async fn accept(
        &mut self,
        bytes: &[u8],
        store: &dyn RelayStore,
    ) -> Result<Decoded, RelayError> {
        if bytes.len() > MAX_WIRE_BYTES {
            return Err(RelayError::Protocol);
        }
        let envelope: Envelope = serde_json::from_slice(bytes).map_err(|_| RelayError::Protocol)?;
        if envelope
            .cursor
            .as_ref()
            .is_some_and(|v| v.len() > MAX_WIRE_BYTES)
        {
            return Err(RelayError::Protocol);
        }
        let initialize = matches!(&envelope.event, Event::ClientMessage {message} if message["method"]=="initialize");
        let peer = store
            .peer(envelope.client_id, envelope.stream_id, initialize)
            .await?;
        self.assemblies
            .retain(|_, a| a.created.elapsed() < ASSEMBLY_LIFETIME);
        let message = match envelope.event {
            Event::Ack { segment_id } => {
                store
                    .acknowledge(
                        peer.clone(),
                        Counter::new(envelope.seq_id.ok_or(RelayError::Protocol)?),
                        segment_id.map(Counter::new),
                    )
                    .await?;
                store.consumed(peer, None, envelope.cursor).await?;
                return Ok(Decoded::None);
            }
            Event::Ping => return Ok(Decoded::Pong(peer)),
            Event::ClientClosed => {
                self.assemblies.retain(|(p, _), _| p != &peer);
                store.closed(peer.clone()).await?;
                return Ok(Decoded::Closed(peer));
            }
            Event::ClientMessage { message } => message,
            Event::ClientMessageChunk {
                segment_id,
                segment_count,
                message_size_bytes,
                message_chunk_base64,
            } => {
                if segment_count == 0
                    || segment_count > MAX_SEGMENTS
                    || segment_id >= segment_count
                    || message_size_bytes == 0
                    || message_size_bytes > MAX_MESSAGE_BYTES
                {
                    return Err(RelayError::Protocol);
                }
                let key = (peer.clone(), envelope.seq_id);
                if !self.assemblies.contains_key(&key) && self.assemblies.len() >= MAX_ASSEMBLIES {
                    return Err(RelayError::Protocol);
                }
                let chunk = base64::engine::general_purpose::STANDARD
                    .decode(message_chunk_base64)
                    .map_err(|_| RelayError::Protocol)?;
                let buffered: usize = self.assemblies.values().map(|a| a.received).sum();
                if buffered
                    .checked_add(chunk.len())
                    .is_none_or(|n| n > MAX_MESSAGE_BYTES)
                {
                    return Err(RelayError::Protocol);
                }
                let assembly = self
                    .assemblies
                    .entry(key.clone())
                    .or_insert_with(|| Assembly {
                        created: Instant::now(),
                        size: message_size_bytes,
                        received: 0,
                        segments: vec![None; segment_count],
                    });
                if assembly.size != message_size_bytes || assembly.segments.len() != segment_count {
                    return Err(RelayError::Protocol);
                }
                if let Some(previous) = &assembly.segments[segment_id] {
                    if previous != &chunk {
                        return Err(RelayError::Protocol);
                    }
                } else {
                    assembly.received += chunk.len();
                    if assembly.received > assembly.size {
                        return Err(RelayError::Protocol);
                    }
                    assembly.segments[segment_id] = Some(chunk);
                }
                if assembly.segments.iter().any(Option::is_none) {
                    return Ok(Decoded::None);
                }
                let assembly = self.assemblies.remove(&key).ok_or(RelayError::Protocol)?;
                if assembly.received != assembly.size {
                    return Err(RelayError::Protocol);
                }
                let bytes: Vec<u8> = assembly.segments.into_iter().flatten().flatten().collect();
                serde_json::from_slice(&bytes).map_err(|_| RelayError::Protocol)?
            }
        };
        if !message.is_object() {
            return Err(RelayError::Protocol);
        }
        if message["method"] != "initialize"
            && let Some(sequence) = envelope.seq_id
            && store
                .inbound(peer.clone())
                .await?
                .is_some_and(|last| last.get() >= sequence)
        {
            return Ok(Decoded::None);
        }
        Ok(Decoded::Message(Input {
            peer,
            sequence: envelope.seq_id.map(Counter::new),
            cursor: envelope.cursor,
            message,
        }))
    }
}
/// Encodes exactly the pinned upstream envelope/chunk fields. Never changes durable sequence IDs.
pub fn frames(outbound: &Outbound) -> Result<Vec<String>, RelayError> {
    let bytes = match &outbound.payload {
        Payload::ServerMessage { message } => {
            serde_json::to_vec(message).map_err(|_| RelayError::Protocol)?
        }
        Payload::Pong { status } if matches!(status.as_str(), "active" | "unknown") => Vec::new(),
        _ => return Err(RelayError::Protocol),
    };
    if bytes.len() > MAX_MESSAGE_BYTES {
        return Err(RelayError::Protocol);
    }
    let envelope = |event: Value| {
        let mut event = event;
        event["client_id"] = outbound.peer.client.as_str().into();
        event["stream_id"] = outbound.peer.stream.as_str().into();
        event["seq_id"] = outbound.sequence.get().into();
        serde_json::to_string(&event).map_err(|_| RelayError::Protocol)
    };
    let direct =
        envelope(serde_json::to_value(&outbound.payload).map_err(|_| RelayError::Protocol)?)?;
    if direct.len() <= MAX_WIRE_BYTES {
        if outbound.first_segment.is_some() {
            return Err(RelayError::Protocol);
        }
        return Ok(vec![direct]);
    }
    let start = outbound.first_segment.map(Counter::get).unwrap_or(0);
    let start = usize::try_from(start).map_err(|_| RelayError::Protocol)?;
    if start >= bytes.len().div_ceil(CHUNK_BYTES) {
        return Err(RelayError::Protocol);
    }
    bytes.chunks(CHUNK_BYTES).enumerate().skip(start).map(|(index, chunk)| {
        let frame=envelope(json!({"type":"server_message_chunk", "segment_id":index,"segment_count":bytes.len().div_ceil(CHUNK_BYTES),"message_size_bytes":bytes.len(),"message_chunk_base64":base64::engine::general_purpose::STANDARD.encode(chunk)}))?;
        if frame.len()>MAX_WIRE_BYTES {return Err(RelayError::Protocol);}
        Ok(frame)
    }).collect()
}
