//! Hosted relay WebSocket lifecycle. EOF disconnects viewers and never completes/cancels work.
use crate::relay::{Decoded, Decoder, Input, Payload, Peer, RelayError, RelayStore, frames};
use base64::Engine as _;
use futures_util::{SinkExt, StreamExt};
use ironloom_core::{BoxFuture, ConversationId};
use ironloom_service::factory::{NativeEnrollment, RELAY_PROTOCOL_VERSION};
use serde_json::Value;
use std::{
    collections::{BTreeMap, VecDeque},
    sync::Arc,
    time::Duration,
};
use tokio::{
    sync::{Notify, watch},
    time::Instant,
};
use tokio_tungstenite::tungstenite::{
    Message,
    client::IntoClientRequest,
    http::{HeaderMap, HeaderValue},
    protocol::WebSocketConfig,
};

const CONNECT_TIMEOUT: Duration = Duration::from_secs(30);
const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(10);
const HEARTBEAT_TIMEOUT: Duration = Duration::from_secs(60);
const MAX_FRAME: usize = 150 * 1024;
/// Generation-bound trusted token resolution. No credential is serialized in native messages.
pub trait ConnectionAuth: Send + Sync {
    /// Returns currently authorized relay token headers, rechecking enrollment owner/generation.
    /// Must fail for disabled/replaced registrations. Account credentials are not relay credentials.
    fn headers(&self, enrollment: NativeEnrollment)
    -> BoxFuture<'_, Result<HeaderMap, RelayError>>;
}
/// A JSON-RPC reply and its service resource scopes for current-grant delivery checks.
pub struct Reply {
    /// Redacted protocol response; identity never grants access by itself.
    pub message: Value,
    /// All conversations whose private contents appear in this reply.
    pub conversations: Vec<ConversationId>,
}
/// JSON-RPC dispatch using existing authenticated service sessions, never a native authority model.
pub trait Dispatcher: Send + Sync {
    /// Handles one complete message. Mutations use stable actor-scoped command IDs for replay.
    /// Notifications return None. Subscription tasks enqueue their output through the same durable store.
    fn dispatch(
        &self,
        peer: Peer,
        message: Value,
    ) -> BoxFuture<'_, Result<Option<Reply>, RelayError>>;
    /// Restores suspended viewer subscriptions after relay reconnect, without dispatching work.
    fn connected(&self) -> BoxFuture<'_, Result<(), RelayError>>;
    /// Activates subscriptions after the corresponding durable reply has been queued.
    fn ready(&self, peer: Peer) -> BoxFuture<'_, Result<(), RelayError>>;
    /// Reports transport initialization only; it grants no resource authority.
    fn initialized(&self, peer: Peer) -> BoxFuture<'_, bool>;
    /// Drops one detached viewer's protocol initialization/subscriptions without cancelling work.
    fn closed(&self, peer: Peer) -> BoxFuture<'_, Result<(), RelayError>>;
    /// Releases viewers only when their transport disconnects; background execution remains durable.
    fn disconnected(&self) -> BoxFuture<'_, Result<(), RelayError>>;
}
type PendingDispatch<'a> = (Peer, usize, BoxFuture<'a, Result<(), RelayError>>);
/// A real protocol-v3 WebSocket client, with all session/transport persistence supplied by ports.
pub struct NativeSocket {
    store: Arc<dyn RelayStore>,
    auth: Arc<dyn ConnectionAuth>,
    dispatcher: Arc<dyn Dispatcher>,
    name: String,
    wakeup: Arc<Notify>,
}
impl NativeSocket {
    /// Creates the adapter without enrollment, network access or a worker process.
    pub fn new(
        store: Arc<dyn RelayStore>,
        auth: Arc<dyn ConnectionAuth>,
        dispatcher: Arc<dyn Dispatcher>,
        name: String,
        wakeup: Arc<Notify>,
    ) -> Result<Self, RelayError> {
        if name.trim().is_empty() || name.len() > 1024 {
            return Err(RelayError::Protocol);
        }
        Ok(Self {
            store,
            auth,
            dispatcher,
            name,
            wakeup,
        })
    }
    /// Connects one generation and replays its durable unacknowledged output before live delivery.
    /// The caller reloads generation-bound registration before any reconnect/refresh attempt.
    /// Wakeups only prompt a durable ordered outbox drain; they never carry speculative dispatch.
    pub async fn connect(
        &self,
        enrollment: NativeEnrollment,
        mut stop: watch::Receiver<bool>,
    ) -> Result<(), RelayError> {
        let result = self.connection(enrollment, &mut stop).await;
        let cleanup = self.dispatcher.disconnected().await;
        result.and(cleanup)
    }
    async fn flush(
        &self,
        socket: &mut Socket,
        sent: &mut BTreeMap<Peer, ironloom_core::Counter>,
    ) -> Result<(), RelayError> {
        let mut pending = self.store.resume().await?.outbound;
        pending.sort_by(|a, b| a.peer.cmp(&b.peer).then(a.sequence.cmp(&b.sequence)));
        for output in pending {
            if sent
                .get(&output.peer)
                .is_some_and(|previous| *previous >= output.sequence)
            {
                continue;
            }
            self.store.delivery(&output).await?;
            for frame in frames(&output)? {
                send(socket, Message::Text(frame.into())).await?;
            }
            sent.insert(output.peer, output.sequence);
        }
        Ok(())
    }
    fn dispatch_input(&self, input: Input) -> BoxFuture<'_, Result<(), RelayError>> {
        Box::pin(async move {
            if let Some(reply) = self
                .dispatcher
                .dispatch(input.peer.clone(), input.message)
                .await?
            {
                self.store
                    .enqueue(
                        input.peer.clone(),
                        Payload::ServerMessage {
                            message: reply.message,
                        },
                        reply.conversations,
                    )
                    .await?;
                self.store
                    .consumed(input.peer.clone(), input.sequence, input.cursor)
                    .await?;
                self.dispatcher.ready(input.peer).await?;
            } else {
                self.store
                    .consumed(input.peer, input.sequence, input.cursor)
                    .await?;
            }
            Ok(())
        })
    }
    async fn connection(
        &self,
        enrollment: NativeEnrollment,
        stop: &mut watch::Receiver<bool>,
    ) -> Result<(), RelayError> {
        if !enrollment.enabled || *stop.borrow() {
            return Ok(());
        }
        let resume = self.store.resume().await?;
        let mut request = enrollment
            .relay_target
            .websocket_url
            .clone()
            .into_client_request()
            .map_err(|_| RelayError::Protocol)?;
        let headers = request.headers_mut();
        headers.extend(self.auth.headers(enrollment.clone()).await?);
        for (key, value) in [
            (
                "x-codex-server-id",
                enrollment.server_id.as_str().to_owned(),
            ),
            (
                "x-codex-name",
                base64::engine::general_purpose::STANDARD.encode(&self.name),
            ),
            (
                "x-codex-protocol-version",
                RELAY_PROTOCOL_VERSION.to_string(),
            ),
            (
                "x-codex-installation-id",
                enrollment.installation_id.as_str().to_owned(),
            ),
        ] {
            headers.insert(
                key,
                HeaderValue::from_str(&value).map_err(|_| RelayError::Protocol)?,
            );
        }
        if let Some(cursor) = resume.cursor {
            headers.insert(
                "x-codex-subscribe-cursor",
                HeaderValue::from_str(&cursor).map_err(|_| RelayError::Protocol)?,
            );
        }
        let config = WebSocketConfig::default()
            .max_message_size(Some(MAX_FRAME))
            .max_frame_size(Some(MAX_FRAME));
        let (mut socket, _) = tokio::select! {
            _ = stop.changed() => return Ok(()),
            result = tokio::time::timeout(CONNECT_TIMEOUT, tokio_tungstenite::connect_async_with_config(request, Some(config), false)) => result.map_err(|_| RelayError::Unavailable)?.map_err(handshake_error)?,
        };
        let mut sent = BTreeMap::new();
        self.flush(&mut socket, &mut sent).await?;
        self.dispatcher.connected().await?;
        let mut decoder = Decoder::default();
        let mut interval = tokio::time::interval(HEARTBEAT_INTERVAL);
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        let mut received = Instant::now();
        let mut waiting: VecDeque<(Input, usize)> = VecDeque::new();
        let mut current: Option<PendingDispatch<'_>> = None;
        let mut queued_bytes = 0usize;
        loop {
            if current.is_none()
                && let Some((input, size)) = waiting.pop_front()
            {
                let peer = input.peer.clone();
                current = Some((
                    peer,
                    size,
                    Box::pin(async move {
                        tokio::time::timeout(Duration::from_secs(60), self.dispatch_input(input))
                            .await
                            .map_err(|_| RelayError::Unavailable)?
                    }),
                ));
            }
            tokio::select! {
                result=async {match current.as_mut() {Some((_,_,future))=>future.await,None=>std::future::pending().await}}=>{
                    result?;
                    if let Some((_,size,_))=current.take() {queued_bytes-=size;}
                    self.flush(&mut socket,&mut sent).await?;
                }

                _ = stop.changed() => {
                    let _ = tokio::time::timeout(Duration::from_secs(5), socket.close(None)).await;
                    return Ok(());
                }
                _ = interval.tick() => {
                    if received.elapsed() > HEARTBEAT_TIMEOUT { return Err(RelayError::Unavailable); }
                    // Also rejects a retired owner/generation while a quiet socket remains open.
                    self.auth.headers(enrollment.clone()).await?;
                    self.flush(&mut socket,&mut sent).await?;
                    send(&mut socket, Message::Ping(Vec::new().into())).await.map_err(|_| RelayError::Unavailable)?;
                }
                _ = self.wakeup.notified() => { self.flush(&mut socket,&mut sent).await?; }
                incoming = socket.next() => {
                    let incoming = incoming.ok_or(RelayError::Unavailable)?.map_err(|_| RelayError::Unavailable)?;
                    received = Instant::now();
                    let bytes = match incoming {
                        Message::Text(text) => text.as_bytes().to_vec(),
                        Message::Binary(_) => return Err(RelayError::Protocol),
                        Message::Ping(data) => {send(&mut socket, Message::Pong(data)).await.map_err(|_| RelayError::Unavailable)?;continue;}
                        Message::Pong(_) => continue,
                        Message::Close(_) => return Err(RelayError::Unavailable),
                        Message::Frame(_) => continue,
                    };
                    match decoder.accept(&bytes, self.store.as_ref()).await? {
                        Decoded::None => {}
                        Decoded::Closed(peer) => {
                            if current.as_ref().is_some_and(|(p,_,_)|p==&peer) && let Some((_,size,_))=current.take() {queued_bytes-=size;}
                            waiting.retain(|(input,size)| {if input.peer==peer {queued_bytes-=*size;false}else{true}});
                            self.dispatcher.closed(peer).await?;
                        }
                        Decoded::Pong(peer) => {
                            let status = if self.dispatcher.initialized(peer.clone()).await {"active"} else {"unknown"};
                            self.store.enqueue(peer, Payload::Pong {status:status.into()}, Vec::new()).await?;
                            self.flush(&mut socket,&mut sent).await?;
                        }
                        Decoded::Message(input) => {
                            let size=serde_json::to_vec(&input.message).map_err(|_|RelayError::Protocol)?.len();
                            queued_bytes=queued_bytes.checked_add(size).ok_or(RelayError::Unavailable)?;
                            if queued_bytes>8*1024*1024 || waiting.len()>=64 {return Err(RelayError::Unavailable);}
                            waiting.push_back((input,size));
                        }
                    }
                }
            }
        }
    }
}

fn handshake_error(error: tokio_tungstenite::tungstenite::Error) -> RelayError {
    if let tokio_tungstenite::tungstenite::Error::Http(response) = error {
        match response.status().as_u16() {
            401 | 403 => RelayError::Authentication,
            429 | 503 => RelayError::Deferred(
                response
                    .headers()
                    .get("retry-after")
                    .and_then(|v| v.to_str().ok())
                    .filter(|v| v.len() <= 128)
                    .map(str::to_owned),
            ),
            404 => {
                let missing = response
                    .body()
                    .as_ref()
                    .filter(|b| b.len() <= MAX_FRAME)
                    .and_then(|b| serde_json::from_slice::<Value>(b).ok())
                    .is_some_and(|v| v["detail"] == "Remote app server not found");
                if missing {
                    RelayError::MissingRegistration
                } else {
                    RelayError::NotFound
                }
            }
            _ => RelayError::Unavailable,
        }
    } else {
        RelayError::Unavailable
    }
}

type Socket =
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;
async fn send(socket: &mut Socket, message: Message) -> Result<(), RelayError> {
    tokio::time::timeout(CONNECT_TIMEOUT, socket.send(message))
        .await
        .map_err(|_| RelayError::Unavailable)?
        .map_err(|_| RelayError::Unavailable)
}
