use std::cell::Cell;
use std::rc::Rc;

use ironloom_core::{ActorId, CorrelationId, ThreadId, WorkItemId};
use ironloom_storage::FilesystemStore;
use ironloom_supervisor::{
    GATE_WORKER_NAME, GATE_WORKER_VERSION, SupervisorInput, run_gate_work_with_registry,
};
use ironloom_workers::{Worker, WorkerRegistry, WorkerRequest, WorkerResponse};
use serde_json::json;

#[test]
fn supervisor_dispatches_selected_gate_node_through_worker_registry() {
    let temp = tempfile::tempdir().expect("temp dir should exist");
    let store = FilesystemStore::new(temp.path()).expect("store should initialize");
    let dispatches = Rc::new(Cell::new(0));
    let mut registry = WorkerRegistry::new();
    registry.register(CapturingGateWorker {
        dispatches: Rc::clone(&dispatches),
    });
    let input = SupervisorInput {
        work_item_id: WorkItemId::new("work-1").expect("work item should be valid"),
        thread_id: ThreadId::new("thread-1").expect("thread should be valid"),
        actor_id: ActorId::new("actor-1").expect("actor should be valid"),
        correlation_id: CorrelationId::new("corr-1").expect("correlation should be valid"),
        command: "fmt".to_owned(),
    };

    let decision =
        run_gate_work_with_registry(&input, &store, &registry).expect("route should complete");

    assert_eq!(1, dispatches.get());
    assert_eq!(GATE_WORKER_NAME, decision.selected_process_node);
    assert_eq!(1, decision.persisted_artifact_ids.len());
}

struct CapturingGateWorker {
    dispatches: Rc<Cell<usize>>,
}

impl Worker for CapturingGateWorker {
    fn name(&self) -> &'static str {
        GATE_WORKER_NAME
    }

    fn version(&self) -> &'static str {
        GATE_WORKER_VERSION
    }

    fn run(&self, request: &WorkerRequest) -> WorkerResponse {
        self.dispatches.set(self.dispatches.get() + 1);
        assert_eq!(GATE_WORKER_NAME, request.worker_name);
        assert_eq!(GATE_WORKER_VERSION, request.worker_version);
        assert_eq!(json!({"command": "fmt"}), request.payload);
        WorkerResponse {
            worker_name: GATE_WORKER_NAME.to_owned(),
            artifact_ids: Vec::new(),
            payload: json!({
                "status": "passed",
                "exit_code": 0,
                "stdout": "ok",
                "stderr": ""
            }),
        }
    }
}
