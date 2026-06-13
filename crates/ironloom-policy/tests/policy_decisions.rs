use ironloom_core::{ActorId, ThreadId};
use ironloom_policy::{ActionKind, PolicyContext, PolicyDecision, evaluate_policy};

#[test]
fn missing_thread_binding_fails_closed_before_worker_execution() {
    let decision = evaluate_policy(&PolicyContext {
        actor_id: ActorId::new("operator").expect("actor should be valid"),
        thread_id: None,
        action: ActionKind::RunGate,
        destructive: false,
    });

    assert!(matches!(decision, PolicyDecision::Denied { .. }));
}

#[test]
fn destructive_actions_require_human_approval() {
    let decision = evaluate_policy(&PolicyContext {
        actor_id: ActorId::new("operator").expect("actor should be valid"),
        thread_id: Some(ThreadId::new("thread-1").expect("thread should be valid")),
        action: ActionKind::MergePullRequest,
        destructive: true,
    });

    assert!(matches!(decision, PolicyDecision::RequiresApproval { .. }));
}
