use std::cell::RefCell;

use ironloom_core::RepositorySlug;
use ironloom_github::{GitHubApiClient, GitHubHttpRequest, GitHubHttpResponse, GitHubTransport};

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
