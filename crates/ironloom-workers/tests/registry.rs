use ironloom_core::{CorrelationId, WorkItemId};
use ironloom_workers::{Worker, WorkerRegistry, WorkerRequest, WorkerResponse};
use serde_json::json;

#[test]
fn registry_dispatches_request_to_registered_worker() {
    let mut registry = WorkerRegistry::new();
    registry.register(EchoWorker);
    let request = WorkerRequest {
        worker_name: "echo".to_owned(),
        worker_version: "1".to_owned(),
        work_item_id: WorkItemId::new("work-1").expect("work item should be valid"),
        correlation_id: CorrelationId::new("corr-1").expect("correlation should be valid"),
        payload: json!({"message": "run"}),
    };

    let response = registry
        .dispatch(&request)
        .expect("registered worker should dispatch");

    assert_eq!("echo", response.worker_name);
    assert_eq!(vec!["artifact-echo".to_owned()], response.artifact_ids);
    assert_eq!(json!({"message": "run"}), response.payload);
}

#[test]
fn registry_refuses_unknown_worker_before_execution() {
    let registry = WorkerRegistry::new();
    let request = WorkerRequest {
        worker_name: "missing".to_owned(),
        worker_version: "1".to_owned(),
        work_item_id: WorkItemId::new("work-1").expect("work item should be valid"),
        correlation_id: CorrelationId::new("corr-1").expect("correlation should be valid"),
        payload: json!({}),
    };

    let error = registry
        .dispatch(&request)
        .expect_err("unknown worker should fail closed");

    assert!(error.to_string().contains("unknown worker"));
}

struct EchoWorker;

impl Worker for EchoWorker {
    fn name(&self) -> &'static str {
        "echo"
    }

    fn version(&self) -> &'static str {
        "1"
    }

    fn run(&self, request: &WorkerRequest) -> WorkerResponse {
        WorkerResponse {
            worker_name: self.name().to_owned(),
            artifact_ids: vec!["artifact-echo".to_owned()],
            payload: request.payload.clone(),
        }
    }
}
