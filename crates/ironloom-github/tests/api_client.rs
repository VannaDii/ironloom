use std::cell::RefCell;

use ironloom_core::RepositorySlug;
use ironloom_github::{
    CheckRunConclusion, CheckRunStatus, GitHubApiClient, GitHubHttpRequest, GitHubHttpResponse,
    GitHubTransport,
};

#[test]
fn github_client_reads_repository_projection_from_fresh_api_response() {
    let transport = RecordingTransport::new(GitHubHttpResponse {
        status: 200,
        body: r#"{"default_branch":"main"}"#.to_owned(),
    });
    let client = GitHubApiClient::new("github-token", &transport);

    let projection = client
        .read_repository(
            &RepositorySlug::new("VannaDii/ironloom").expect("repository should be valid"),
        )
        .expect("repository response should parse");

    assert_eq!("main", projection.default_branch);
    assert!(projection.source_of_truth);
    let request = transport.last_request();
    assert_eq!("GET", request.method);
    assert_eq!("/repos/VannaDii/ironloom", request.path);
    assert!(
        request
            .headers
            .contains(&("Authorization".to_owned(), "Bearer github-token".to_owned()))
    );
    assert!(request.headers.contains(&(
        "Accept".to_owned(),
        "application/vnd.github+json".to_owned()
    )));
}

#[test]
fn github_client_rejects_unsuccessful_repository_response() {
    let transport = RecordingTransport::new(GitHubHttpResponse {
        status: 403,
        body: r#"{"message":"rate limited"}"#.to_owned(),
    });
    let client = GitHubApiClient::new("github-token", &transport);

    let error = client
        .read_repository(
            &RepositorySlug::new("VannaDii/ironloom").expect("repository should be valid"),
        )
        .expect_err("non-success response should fail closed");

    assert!(error.to_string().contains("GitHub API returned 403"));
}

#[test]
fn github_client_reads_pull_request_from_source_of_truth() {
    let transport = RecordingTransport::new(GitHubHttpResponse {
        status: 200,
        body: r#"{
          "number": 42,
          "draft": false,
          "mergeable": true,
          "mergeable_state": "clean",
          "head": { "ref": "feature/runtime" },
          "base": { "ref": "main" }
        }"#
        .to_owned(),
    });
    let client = GitHubApiClient::new("github-token", &transport);

    let projection = client
        .read_pull_request(
            &RepositorySlug::new("VannaDii/ironloom").expect("repository should be valid"),
            42,
        )
        .expect("pull request response should parse");

    assert_eq!(42, projection.number);
    assert_eq!("feature/runtime", projection.head_branch);
    assert_eq!("main", projection.base_branch);
    assert_eq!(Some(true), projection.mergeable);
    assert_eq!("clean", projection.mergeable_state);
    assert!(!projection.draft);
    assert!(projection.source_of_truth);
    assert_eq!(
        "/repos/VannaDii/ironloom/pulls/42",
        transport.last_request().path
    );
}

#[test]
fn github_client_reads_check_runs_for_ref_from_source_of_truth() {
    let transport = RecordingTransport::new(GitHubHttpResponse {
        status: 200,
        body: r#"{
          "check_runs": [
            {
              "name": "Rust Gates",
              "status": "completed",
              "conclusion": "success"
            },
            {
              "name": "Coverage And Sonar",
              "status": "in_progress",
              "conclusion": null
            }
          ]
        }"#
        .to_owned(),
    });
    let client = GitHubApiClient::new("github-token", &transport);

    let checks = client
        .list_check_runs_for_ref(
            &RepositorySlug::new("VannaDii/ironloom").expect("repository should be valid"),
            "main",
        )
        .expect("check run response should parse");

    assert_eq!(2, checks.len());
    assert_eq!("Rust Gates", checks[0].name);
    assert_eq!(CheckRunStatus::Completed, checks[0].status);
    assert_eq!(Some(CheckRunConclusion::Success), checks[0].conclusion);
    assert!(checks[0].source_of_truth);
    assert_eq!(CheckRunStatus::InProgress, checks[1].status);
    assert_eq!(None, checks[1].conclusion);
    assert_eq!(
        "/repos/VannaDii/ironloom/commits/main/check-runs",
        transport.last_request().path
    );
}

struct RecordingTransport {
    response: GitHubHttpResponse,
    requests: RefCell<Vec<GitHubHttpRequest>>,
}

impl RecordingTransport {
    fn new(response: GitHubHttpResponse) -> Self {
        Self {
            response,
            requests: RefCell::new(Vec::new()),
        }
    }

    fn last_request(&self) -> GitHubHttpRequest {
        self.requests
            .borrow()
            .last()
            .expect("request should be captured")
            .clone()
    }
}

impl GitHubTransport for &RecordingTransport {
    fn send(&self, request: GitHubHttpRequest) -> GitHubHttpResponse {
        self.requests.borrow_mut().push(request);
        self.response.clone()
    }
}
