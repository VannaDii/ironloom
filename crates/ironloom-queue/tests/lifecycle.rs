use ironloom_core::WorkItemId;
use ironloom_queue::{QueueError, QueueItem, QueueState};

#[test]
fn queue_refuses_invalid_lifecycle_transitions() {
    let mut item =
        QueueItem::pending(WorkItemId::new("work-1").expect("work item should be valid"));

    let error = item
        .transition(QueueState::Completed)
        .expect_err("pending work cannot complete without a claim");

    assert!(matches!(
        error,
        QueueError::InvalidTransition {
            from: QueueState::Pending,
            to: QueueState::Completed
        }
    ));
}
