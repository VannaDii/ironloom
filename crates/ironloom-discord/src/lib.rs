#![forbid(unsafe_code)]

use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use ironloom_core::{ActorId, CorrelationId, ThreadId, WorkItemId};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use thiserror::Error;

const DISCORD_PING_INTERACTION_TYPE: u64 = 1;
const DISCORD_PONG_RESPONSE: &str = r#"{"type":1}"#;
const ED25519_PUBLIC_KEY_BYTES: usize = 32;
const ED25519_SIGNATURE_BYTES: usize = 64;

/// Thread-bound operator command received from Discord.
#[derive(Clone, Debug, Eq, JsonSchema, PartialEq, Deserialize, Serialize)]
pub struct DiscordCommand {
    /// Originating Discord thread.
    pub thread_id: ThreadId,
    /// Requesting actor.
    pub actor_id: ActorId,
    /// Correlation identifier for audit.
    pub correlation_id: CorrelationId,
    /// Command text.
    pub command: String,
}

/// Discord adapter errors.
#[derive(Debug, Error, Eq, PartialEq)]
pub enum DiscordError {
    /// No persisted work item binding exists for the thread.
    #[error("missing thread binding for {thread_id}")]
    MissingThreadBinding { thread_id: String },
    /// More than one work item binding exists for the thread.
    #[error("ambiguous thread binding for {thread_id}")]
    AmbiguousThreadBinding { thread_id: String },
    /// Discord signature or public key was not valid hex with the expected length.
    #[error("invalid Discord interaction signature encoding")]
    InvalidSignatureEncoding,
    /// Discord signature verification failed.
    #[error("invalid Discord interaction signature")]
    InvalidInteractionSignature,
    /// Discord interaction JSON could not be parsed.
    #[error("invalid Discord interaction JSON: {0}")]
    InvalidInteractionJson(String),
    /// Discord interaction type is not supported by this runtime path.
    #[error("unsupported Discord interaction type: {interaction_type}")]
    UnsupportedInteractionType {
        /// Unsupported Discord interaction type.
        interaction_type: u64,
    },
}

/// Raw signed Discord interaction request.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DiscordInteractionRequest {
    /// Discord application public key encoded as lowercase or uppercase hex.
    pub public_key: String,
    /// `X-Signature-Ed25519` header encoded as hex.
    pub signature: String,
    /// `X-Signature-Timestamp` header.
    pub timestamp: String,
    /// Raw request body exactly as signed by Discord.
    pub body: String,
}

/// HTTP response returned for a Discord interaction request.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DiscordInteractionResponse {
    /// HTTP status code.
    pub status: u16,
    /// Response body.
    pub body: String,
}

/// Verifies a Discord interaction request signature.
pub fn verify_discord_interaction(request: &DiscordInteractionRequest) -> Result<(), DiscordError> {
    let public_key = decode_hex_array::<ED25519_PUBLIC_KEY_BYTES>(&request.public_key)?;
    let signature = decode_hex_array::<ED25519_SIGNATURE_BYTES>(&request.signature)?;
    let verifying_key = VerifyingKey::from_bytes(&public_key)
        .map_err(|_| DiscordError::InvalidSignatureEncoding)?;
    let signature = Signature::from_bytes(&signature);
    let message = format!("{}{}", request.timestamp, request.body);
    verifying_key
        .verify(message.as_bytes(), &signature)
        .map_err(|_| DiscordError::InvalidInteractionSignature)
}

/// Verifies and handles a Discord interaction request.
pub fn handle_discord_interaction(
    request: &DiscordInteractionRequest,
) -> Result<DiscordInteractionResponse, DiscordError> {
    verify_discord_interaction(request)?;
    let body = serde_json::from_str::<serde_json::Value>(&request.body)
        .map_err(|error| DiscordError::InvalidInteractionJson(error.to_string()))?;
    let interaction_type = body
        .get("type")
        .and_then(serde_json::Value::as_u64)
        .ok_or_else(|| DiscordError::InvalidInteractionJson("missing type".to_owned()))?;
    if interaction_type == DISCORD_PING_INTERACTION_TYPE {
        return Ok(DiscordInteractionResponse {
            status: 200,
            body: DISCORD_PONG_RESPONSE.to_owned(),
        });
    }
    Err(DiscordError::UnsupportedInteractionType { interaction_type })
}

/// In-memory thread binding registry used by the local vertical slice harness.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct ThreadBindingRegistry {
    bindings: Vec<(ThreadId, WorkItemId)>,
}

impl ThreadBindingRegistry {
    /// Creates an empty binding registry.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Adds a thread-to-work-item binding.
    pub fn bind(
        &mut self,
        thread_id: ThreadId,
        work_item_id: WorkItemId,
    ) -> Result<(), DiscordError> {
        self.bindings.push((thread_id, work_item_id));
        Ok(())
    }

    /// Resolves exactly one work item for a thread.
    pub fn resolve(&self, thread_id: &ThreadId) -> Result<WorkItemId, DiscordError> {
        let matches = self
            .bindings
            .iter()
            .filter(|(candidate, _)| candidate == thread_id)
            .map(|(_, work_item_id)| work_item_id.clone())
            .collect::<Vec<_>>();
        match matches.as_slice() {
            [] => Err(DiscordError::MissingThreadBinding {
                thread_id: thread_id.as_str().to_owned(),
            }),
            [work_item_id] => Ok(work_item_id.clone()),
            _ => Err(DiscordError::AmbiguousThreadBinding {
                thread_id: thread_id.as_str().to_owned(),
            }),
        }
    }
}

/// Captured fake Discord response.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DiscordResponse {
    /// Target response thread.
    pub thread_id: ThreadId,
    /// Response body.
    pub body: String,
}

/// Fake Discord transport for local integration tests.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct FakeDiscordTransport {
    responses: Vec<DiscordResponse>,
}

impl FakeDiscordTransport {
    /// Posts a response to the exact Discord thread supplied by the caller.
    pub fn post_response(&mut self, thread_id: ThreadId, body: impl Into<String>) {
        self.responses.push(DiscordResponse {
            thread_id,
            body: body.into(),
        });
    }

    /// Returns the most recent response.
    #[must_use]
    pub fn last_response(&self) -> Option<&DiscordResponse> {
        self.responses.last()
    }
}

fn decode_hex_array<const LENGTH: usize>(value: &str) -> Result<[u8; LENGTH], DiscordError> {
    let decoded = hex::decode(value).map_err(|_| DiscordError::InvalidSignatureEncoding)?;
    decoded
        .try_into()
        .map_err(|_| DiscordError::InvalidSignatureEncoding)
}
