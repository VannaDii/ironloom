#![forbid(unsafe_code)]

use ironloom_core::WorkItemId;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Durable work item lifecycle states.
#[derive(Clone, Debug, Eq, JsonSchema, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum QueueState {
    /// Work item is waiting for a claim.
    Pending,
    /// Work item is actively claimed.
    Claimed,
    /// Work item finished successfully.
    Completed,
    /// Work item failed and requires follow-up.
    Failed,
}

/// Durable queue work item.
#[derive(Clone, Debug, Eq, JsonSchema, PartialEq, Deserialize, Serialize)]
pub struct QueueItem {
    /// Work item identifier.
    pub work_item_id: WorkItemId,
    /// Current lifecycle state.
    pub state: QueueState,
}

/// Queue transition error.
#[derive(Debug, Error, Eq, PartialEq)]
pub enum QueueError {
    /// The requested state transition is not allowed.
    #[error("invalid queue transition from {from:?} to {to:?}")]
    InvalidTransition { from: QueueState, to: QueueState },
}

impl QueueItem {
    /// Creates a pending queue item.
    #[must_use]
    pub fn pending(work_item_id: WorkItemId) -> Self {
        Self {
            work_item_id,
            state: QueueState::Pending,
        }
    }

    /// Applies a lifecycle transition if it is valid.
    pub fn transition(&mut self, next: QueueState) -> Result<(), QueueError> {
        let valid = matches!(
            (&self.state, &next),
            (QueueState::Pending, QueueState::Claimed)
                | (QueueState::Claimed, QueueState::Completed)
                | (QueueState::Claimed, QueueState::Failed)
        );
        if valid {
            self.state = next;
            Ok(())
        } else {
            Err(QueueError::InvalidTransition {
                from: self.state.clone(),
                to: next,
            })
        }
    }
}
