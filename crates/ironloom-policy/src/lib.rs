#![forbid(unsafe_code)]

use ironloom_core::{ActorId, ThreadId};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// Operator action categories evaluated by policy.
#[derive(Clone, Debug, Eq, JsonSchema, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ActionKind {
    /// Run a configured validation gate.
    RunGate,
    /// Merge a pull request.
    MergePullRequest,
}

/// Inputs required for a fail-closed policy decision.
#[derive(Clone, Debug, Eq, JsonSchema, PartialEq, Deserialize, Serialize)]
pub struct PolicyContext {
    /// Actor requesting the action.
    pub actor_id: ActorId,
    /// Bound Discord thread, if one was resolved exactly.
    pub thread_id: Option<ThreadId>,
    /// Action under evaluation.
    pub action: ActionKind,
    /// Whether the action can mutate source-of-truth state.
    pub destructive: bool,
}

/// Policy result consumed before any worker side effect.
#[derive(Clone, Debug, Eq, JsonSchema, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case", tag = "decision")]
pub enum PolicyDecision {
    /// The action can proceed.
    Allowed { reason: String },
    /// The action is blocked.
    Denied { reason: String },
    /// The action must pause for human approval.
    RequiresApproval { reason: String },
}

/// Evaluates a policy context and fails closed for ambiguous or destructive actions.
#[must_use]
pub fn evaluate_policy(context: &PolicyContext) -> PolicyDecision {
    if context.thread_id.is_none() {
        return PolicyDecision::Denied {
            reason: "missing or ambiguous thread binding".to_owned(),
        };
    }
    if context.destructive {
        return PolicyDecision::RequiresApproval {
            reason: "destructive action requires human approval".to_owned(),
        };
    }
    PolicyDecision::Allowed {
        reason: "thread-bound non-destructive action is allowed".to_owned(),
    }
}
