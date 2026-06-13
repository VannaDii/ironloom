use ironloom_artifacts::{ArtifactEnvelope, ArtifactKind};
use ironloom_core::{CorrelationId, ThreadId, WorkItemId};
use ironloom_storage::FilesystemStore;
use serde_json::json;

#[test]
fn artifact_write_is_atomic_and_indexed_by_thread_and_work_item() {
    let temp = tempfile::tempdir().expect("temp dir should exist");
    let store = FilesystemStore::new(temp.path()).expect("store should initialize");
    let artifact = ArtifactEnvelope::new(
        ArtifactKind::GateResult,
        WorkItemId::new("work-1").expect("work item should be valid"),
        ThreadId::new("thread-1").expect("thread should be valid"),
        CorrelationId::new("corr-1").expect("correlation should be valid"),
        json!({"status": "passed"}),
    )
    .expect("artifact should build");

    store
        .write_artifact(&artifact)
        .expect("write should succeed");

    let by_thread = store
        .artifact_ids_for_thread(&ThreadId::new("thread-1").expect("thread should be valid"))
        .expect("thread index should read");
    let by_work_item = store
        .artifact_ids_for_work_item(&WorkItemId::new("work-1").expect("work item should be valid"))
        .expect("work item index should read");

    assert_eq!(vec![artifact.id().to_owned()], by_thread);
    assert_eq!(vec![artifact.id().to_owned()], by_work_item);
    assert!(
        temp.path()
            .join(".ironloom")
            .join("artifacts")
            .join(format!("{}.json", artifact.id()))
            .is_file()
    );
}
