use ironloom_core::BranchName;
use ironloom_worktrees::WorktreeRequest;

#[test]
fn worktree_requests_refuse_repository_escaping_paths() {
    let branch = BranchName::new("feature/runtime").expect("branch should be valid");

    let error =
        WorktreeRequest::new(branch, "../outside").expect_err("escaping paths must be rejected");

    assert_eq!(
        "worktree_path is invalid: unsafe repository-relative path",
        error.to_string()
    );
}
