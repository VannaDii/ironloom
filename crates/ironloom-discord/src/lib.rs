#![forbid(unsafe_code)]

use ironloom_core::{ActorId, CorrelationId, ThreadId, WorkItemId};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use thiserror::Error;

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
