use ironloom_core::{
    ActorId, BranchName, CorrelationId, IronloomError, RepositorySlug, ThreadId, WorkItemId,
};

#[test]
fn typed_ids_reject_empty_values_and_preserve_display_text() {
    let work_item = WorkItemId::new("work-1").expect("work item id should be valid");
    let thread = ThreadId::new("thread-1").expect("thread id should be valid");
    let actor = ActorId::new("operator").expect("actor id should be valid");
    let correlation = CorrelationId::new("corr-1").expect("correlation id should be valid");

    assert_eq!("work-1", work_item.as_str());
    assert_eq!("thread-1", thread.as_str());
    assert_eq!("operator", actor.as_str());
    assert_eq!("corr-1", correlation.as_str());
    assert!(matches!(
        WorkItemId::new(""),
        Err(IronloomError::EmptyDomainValue { field }) if field == "work_item_id"
    ));
}

#[test]
fn branch_names_and_repository_slugs_fail_closed_for_unsafe_inputs() {
    let repository = RepositorySlug::new("VannaDii/ironloom").expect("repository should be valid");
    let branch = BranchName::new("feature/rust-runtime").expect("branch should be valid");

    assert_eq!("VannaDii/ironloom", repository.as_str());
    assert_eq!("feature/rust-runtime", branch.as_str());
    assert!(BranchName::new("../main").is_err());
    assert!(BranchName::new("main lock").is_err());
    assert!(RepositorySlug::new("single-segment").is_err());
}
