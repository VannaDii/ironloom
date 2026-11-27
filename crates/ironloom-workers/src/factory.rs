//! Shared software factory contracts.
use ironloom_core::validation::{ValidationErrors, positive, required};
use ironloom_core::*;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
/// Normalized provider, engine and command streaming payload kind.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum StreamKind {
    /// Operation/turn began.
    Started,
    /// Operation completed, independent of stream EOF.
    Completed,
    /// Terminal operation failure.
    Failed,
    /// Pending human question or approval.
    WaitingForHuman,
    /// Incremental inference output.
    TextDelta,
    /// Incremental arguments; never execute until complete and validated.
    ToolArgumentsDelta,
    /// Complete tool call; gateway independently checks authority.
    ToolReady,
    /// Bounded command stdout chunk.
    Stdout,
    /// Bounded command stderr chunk.
    Stderr,
    /// Worker progress.
    Progress,
    /// Incremental durable accounting update.
    Usage,
    /// Persisted execution transition.
    StateChanged,
    /// Owned process/request stopped; distinct from cancel request.
    TerminationConfirmed,
}
ironloom_core::contract! {
/// Validated factory record.
WorkerEvent, WorkerEventData {
    /// Worker identity.
    worker_id: WorkerId,
    /// Stable active turn.
    turn_id: TurnId,
    /// Stable stream item identity.
    item_id: ItemId,
    /// Typed reported, estimated or unknown counters.
    usage: Option<ironloom_observability::factory::Usage>,
    /// Owning assignment.
    assignment_id: AssignmentId,
    /// Present for inference output.
    inference_id: Option<InferenceId>,
    /// Present for complete or partial tool calls.
    tool_call_id: Option<ToolCallId>,
    /// Normalized event kind.
    kind: StreamKind,
    /// Bounded output chunk; no credentials.
    text: String,
    /// Present exactly for state events.
    state: Option<ironloom_queue::factory::ExecutionState>,
} |value| {
    let _ = value;
    if (value.kind == StreamKind::Usage) != value.usage.is_some() {
        return Err(ValidationErrors::field("usage", "usage_kind_mismatch"));
    }
    let tool = matches!(
        value.kind,
        StreamKind::ToolArgumentsDelta | StreamKind::ToolReady
    );
    if tool != value.tool_call_id.is_some() {
        return Err(ValidationErrors::field(
            "tool_call_id",
            "tool_identity_mismatch",
        ));
    }
    if matches!(
        value.kind,
        StreamKind::StateChanged | StreamKind::TerminationConfirmed
    ) != value.state.is_some()
    {
        return Err(ValidationErrors::field(
            "state",
            "state_required_only_for_transition",
        ));
    }
    if value.kind == StreamKind::TerminationConfirmed
        && value.state != Some(ironloom_queue::factory::ExecutionState::Terminated)
    {
        return Err(ValidationErrors::field("state", "termination_required"));
    }
    Ok(())
}
}
ironloom_core::contract! {
/// Validated factory record.
PendingQuestion, PendingQuestionData {
    /// Stable pending request identity.
    question_id: QuestionId,
    /// Original assignment.
    assignment_id: AssignmentId,
    /// Source authorized conversation.
    conversation_id: ConversationId,
    /// Owning turn.
    turn_id: TurnId,
    /// Owning item.
    item_id: ItemId,
    /// Reject stale answers.
    revision: Counter,
    /// Original operator question wording.
    text: String,
    /// Allowed persisted choices.
    choices: Vec<ActorId>,
    /// Durable resolution, absent while pending.
    resolved_by: Option<AnswerId>,
} |value| {
    let _ = value;
    positive("revision", value.revision)?;
    required("text", &value.text)?;
    if value.choices.is_empty() {
        return Err(ValidationErrors::field("choices", "required"));
    }
    let unique = value
        .choices
        .iter()
        .collect::<std::collections::BTreeSet<_>>();
    if unique.len() != value.choices.len() {
        return Err(ValidationErrors::field("choices", "duplicate_choice"));
    }
    Ok(())
}
}
