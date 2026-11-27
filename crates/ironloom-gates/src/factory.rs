//! Shared software factory contracts.
use ironloom_core::validation::{ValidationErrors, positive};
use ironloom_core::*;
ironloom_core::contract! {
/// Validated factory record.
ValidationContent, ValidationContentData {
    /// Reviewed assignment.
    assignment_id: AssignmentId,
    /// Exact content including dirty files, not only commit SHA.
    source_digest: ActorId,
    /// Exclusive final-validation ownership.
    mutation_fence: Counter,
    /// Active edits drained before gates and coordinated commit.
    mutations_drained: bool,
} |value| {
    let _ = value;
    positive("mutation_fence", value.mutation_fence)?;
    if !value.mutations_drained {
        return Err(ValidationErrors::field("mutations_drained", "active_edits"));
    }
    Ok(())
}
}
