use ironloom_core::RepositorySlug;
use ironloom_github::RepositoryProjection;

#[test]
fn repository_projection_marks_fresh_github_reads_as_source_of_truth() {
    let projection = RepositoryProjection::from_source_of_truth(
        RepositorySlug::new("VannaDii/ironloom").expect("repository should be valid"),
        "main",
    );

    assert!(projection.source_of_truth);
    assert_eq!("main", projection.default_branch);
}
