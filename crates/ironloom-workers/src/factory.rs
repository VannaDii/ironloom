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
    /// True permits more than one selected choice.
    allow_multiple: bool,
    /// True permits a nonblank free-text response, with or without selected choices.
    allow_text: bool,
    /// Durable resolution, absent while pending.
    resolved_by: Option<AnswerId>,
} |value| {
    let _ = value;
    positive("revision", value.revision)?;
    required("text", &value.text)?;
    if value.choices.is_empty() && !value.allow_text {
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

impl PendingQuestionData {
    /// Validates a response against the persisted choices/mode. Authentication, expected revision,
    /// question/turn/item matching and atomic resolution are still required by the service.
    pub fn validate_response(
        &self,
        choices: &[ActorId],
        text: Option<&str>,
    ) -> Result<(), ValidationErrors> {
        if self.resolved_by.is_some() {
            return Err(ValidationErrors::field("question_id", "already_resolved"));
        }
        if choices.is_empty() && text.is_none() {
            return Err(ValidationErrors::field("choices", "answer_required"));
        }
        if !self.allow_multiple && choices.len() > 1 {
            return Err(ValidationErrors::field(
                "choices",
                "multiple_choices_forbidden",
            ));
        }
        let unique = choices.iter().collect::<std::collections::BTreeSet<_>>();
        if unique.len() != choices.len() {
            return Err(ValidationErrors::field("choices", "duplicate_choice"));
        }
        if choices.iter().any(|choice| !self.choices.contains(choice)) {
            return Err(ValidationErrors::field("choices", "unknown_choice"));
        }
        if let Some(text) = text {
            if !self.allow_text {
                return Err(ValidationErrors::field("text", "text_forbidden"));
            }
            required("text", text)?;
        }
        Ok(())
    }
}
