use ironloom_process_graph::{
    ProcessGraph, ProcessNode, RetryPolicy, Transition, default_gate_graph,
};

#[test]
fn graph_validation_rejects_unknown_transition_targets() {
    let graph = ProcessGraph::new(
        vec![ProcessNode::new("start", vec!["thread_id"])],
        vec![Transition::new("start", "missing", RetryPolicy::bounded(1))],
    );

    let error = graph
        .validate()
        .expect_err("unknown target should be rejected");
    assert!(error.to_string().contains("missing"));
}

#[test]
fn graph_validation_rejects_unbounded_retry_loops() {
    let graph = ProcessGraph::new(
        vec![ProcessNode::new("start", vec!["thread_id"])],
        vec![Transition::new("start", "start", RetryPolicy::unbounded())],
    );

    let error = graph
        .validate()
        .expect_err("unbounded retry should be rejected");
    assert!(error.to_string().contains("unbounded"));
}

#[test]
fn default_gate_graph_routes_to_the_gate_worker_node() {
    let graph = default_gate_graph();
    graph.validate().expect("default graph should be valid");

    let route = graph
        .next_node("discord_command_received")
        .expect("route should exist");

    assert_eq!("run_gate_worker", route.name());
}
