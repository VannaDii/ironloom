use ironloom_core::{ActorId, CorrelationId, ThreadId, WorkItemId};
use ironloom_discord::{DiscordCommand, FakeDiscordTransport, ThreadBindingRegistry};
use ironloom_runtime::{RuntimeHarness, run_fake_discord_gate_slice};

#[test]
fn fake_discord_gate_slice_persists_artifact_and_replies_to_origin_thread() {
    let temp = tempfile::tempdir().expect("temp dir should exist");
    let mut bindings = ThreadBindingRegistry::new();
    bindings
        .bind(
            ThreadId::new("thread-1").expect("thread should be valid"),
            WorkItemId::new("work-1").expect("work item should be valid"),
        )
        .expect("binding should be stored");
    let transport = FakeDiscordTransport::default();
    let mut harness = RuntimeHarness::new(temp.path(), bindings, transport)
        .expect("runtime harness should initialize");

    let output = run_fake_discord_gate_slice(
        &mut harness,
        DiscordCommand {
            thread_id: ThreadId::new("thread-1").expect("thread should be valid"),
            actor_id: ActorId::new("operator").expect("actor should be valid"),
            correlation_id: CorrelationId::new("corr-1").expect("correlation should be valid"),
            command: "run gate".to_owned(),
        },
    )
    .expect("slice should run");

    assert_eq!("thread-1", output.response_thread_id.as_str());
    assert_eq!("run_gate_worker", output.selected_process_node);
    assert_eq!(1, output.persisted_artifact_ids.len());
}

#[test]
fn ambiguous_discord_thread_binding_refuses_work_before_gate_runs() {
    let temp = tempfile::tempdir().expect("temp dir should exist");
    let mut bindings = ThreadBindingRegistry::new();
    let thread_id = ThreadId::new("thread-1").expect("thread should be valid");
    bindings
        .bind(
            thread_id.clone(),
            WorkItemId::new("work-1").expect("work item should be valid"),
        )
        .expect("first binding should be stored");
    bindings
        .bind(
            thread_id.clone(),
            WorkItemId::new("work-2").expect("work item should be valid"),
        )
        .expect("second binding should be stored");
    let transport = FakeDiscordTransport::default();
    let mut harness = RuntimeHarness::new(temp.path(), bindings, transport)
        .expect("runtime harness should initialize");

    let error = run_fake_discord_gate_slice(
        &mut harness,
        DiscordCommand {
            thread_id,
            actor_id: ActorId::new("operator").expect("actor should be valid"),
            correlation_id: CorrelationId::new("corr-1").expect("correlation should be valid"),
            command: "run gate".to_owned(),
        },
    )
    .expect_err("ambiguous binding must fail closed");

    assert!(error.to_string().contains("ambiguous"));
    assert_eq!(0, harness.gates_run());
}
