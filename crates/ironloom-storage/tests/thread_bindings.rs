use ironloom_core::{ThreadId, WorkItemId};
use ironloom_storage::{FilesystemStore, ThreadBindingError};

#[test]
fn filesystem_store_resolves_persisted_thread_binding() {
    let temp = tempfile::tempdir().expect("temp dir should exist");
    let store = FilesystemStore::new(temp.path()).expect("store should initialize");
    let thread_id = ThreadId::new("thread-1").expect("thread should be valid");
    let work_item_id = WorkItemId::new("work-1").expect("work item should be valid");

    store
        .bind_thread_to_work_item(&thread_id, &work_item_id)
        .expect("binding should persist");

    let resolved = store
        .resolve_thread_binding(&thread_id)
        .expect("binding should resolve");

    assert_eq!(work_item_id, resolved);
}

#[test]
fn filesystem_store_fails_closed_for_ambiguous_thread_binding() {
    let temp = tempfile::tempdir().expect("temp dir should exist");
    let store = FilesystemStore::new(temp.path()).expect("store should initialize");
    let thread_id = ThreadId::new("thread-1").expect("thread should be valid");
    store
        .bind_thread_to_work_item(
            &thread_id,
            &WorkItemId::new("work-1").expect("work item should be valid"),
        )
        .expect("first binding should persist");
    store
        .bind_thread_to_work_item(
            &thread_id,
            &WorkItemId::new("work-2").expect("work item should be valid"),
        )
        .expect("second binding should persist");

    let error = store
        .resolve_thread_binding(&thread_id)
        .expect_err("ambiguous binding must fail closed");

    assert!(matches!(error, ThreadBindingError::Ambiguous { .. }));
}

#[test]
fn filesystem_store_fails_closed_for_missing_thread_binding() {
    let temp = tempfile::tempdir().expect("temp dir should exist");
    let store = FilesystemStore::new(temp.path()).expect("store should initialize");
    let thread_id = ThreadId::new("thread-1").expect("thread should be valid");

    let error = store
        .resolve_thread_binding(&thread_id)
        .expect_err("missing binding must fail closed");

    assert!(matches!(error, ThreadBindingError::Missing { .. }));
}
