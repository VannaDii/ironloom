use std::cell::RefCell;

use ed25519_dalek::{Signer, SigningKey};
use ironloom_config::RuntimeConfigInputs;
use ironloom_core::RepositorySlug;
use ironloom_gates::{GateExecutor, GateResult};
use ironloom_github::{GitHubHttpRequest, GitHubHttpResponse, GitHubTransport};
use ironloom_runtime::{
    RuntimeExternalProbeOptions, RuntimeHttpContext, handle_runtime_http_request,
    handle_runtime_http_request_with_services, probe_runtime_external_services,
    probe_runtime_external_services_with_options,
};
use ironloom_sonarcloud::{
    QualityGateStatus, SonarCloudHttpRequest, SonarCloudHttpResponse, SonarCloudTransport,
};
use ironloom_storage::{FilesystemStore, SetupConfigStore};

#[test]
fn runtime_http_accepts_signed_discord_ping_interaction() {
    let signing_key = SigningKey::from_bytes(&[7_u8; 32]);
    let public_key = hex::encode(signing_key.verifying_key().to_bytes());
    let context = ready_context(&public_key);
    let body = r#"{"type":1}"#;
    let request = signed_interaction_request(&signing_key, body);

    let response = handle_runtime_http_request(&context, &request);

    assert_eq!(200, response.status_code);
    assert_eq!("application/json", response.content_type);
    assert_eq!(r#"{"type":1}"#, response.body);
}

#[test]
fn runtime_http_rejects_interaction_when_signature_does_not_match() {
    let signing_key = SigningKey::from_bytes(&[7_u8; 32]);
    let other_key = SigningKey::from_bytes(&[9_u8; 32]);
    let public_key = hex::encode(signing_key.verifying_key().to_bytes());
    let context = ready_context(&public_key);
    let request = signed_interaction_request(&other_key, r#"{"type":1}"#);

    let response = handle_runtime_http_request(&context, &request);

    assert_eq!(401, response.status_code);
    assert_eq!("invalid Discord interaction signature", response.body);
}

#[test]
fn runtime_probe_reads_github_and_sonarcloud_through_configured_adapters() {
    let context = ready_context("discord-public-key");
    let config = context
        .resolved_config()
        .expect("ready context should resolve config");
    let github = CapturingGitHubTransport::new([(200, r#"{"default_branch":"main"}"#)]);
    let sonarcloud = CapturingSonarCloudTransport::new([
        (200, r#"{"projectStatus":{"status":"OK"}}"#),
        (200, r#"{"issues":[]}"#),
    ]);

    let summary = probe_runtime_external_services(
        &config,
        &RepositorySlug::new("VannaDii/ironloom").expect("repository slug should be valid"),
        &github,
        &sonarcloud,
    )
    .expect("runtime probe should complete");

    assert_eq!("main", summary.github_repository.default_branch);
    assert_eq!(QualityGateStatus::Passed, summary.quality_gate_status);
    assert!(summary.open_sonarcloud_issues.is_empty());
    assert!(
        github
            .request()
            .headers
            .contains(&("Authorization".to_owned(), "Bearer github-token".to_owned()))
    );
    assert_eq!("/repos/VannaDii/ironloom", github.request().path);
    assert!(
        sonarcloud.requests()[0]
            .path
            .contains("organization=sonar-org")
    );
    assert!(
        sonarcloud.requests()[0]
            .path
            .contains("projectKey=sonar-project")
    );
    assert!(
        sonarcloud.requests()[1]
            .path
            .contains("componentKeys=sonar-project")
    );
    assert!(
        sonarcloud.requests()[0]
            .headers
            .contains(&("Authorization".to_owned(), "Bearer sonar-token".to_owned()))
    );
}

#[test]
fn runtime_probe_reads_pull_request_and_check_runs_when_requested() {
    let context = ready_context("discord-public-key");
    let config = context
        .resolved_config()
        .expect("ready context should resolve config");
    let github = CapturingGitHubTransport::new([
        (200, r#"{"default_branch":"main"}"#),
        (
            200,
            r#"{
              "number": 42,
              "draft": false,
              "mergeable": true,
              "mergeable_state": "clean",
              "head": { "ref": "feature/runtime" },
              "base": { "ref": "main" }
            }"#,
        ),
        (
            200,
            r#"{
              "check_runs": [
                {
                  "name": "CI",
                  "status": "completed",
                  "conclusion": "success"
                }
              ]
            }"#,
        ),
    ]);
    let sonarcloud = CapturingSonarCloudTransport::new([
        (200, r#"{"projectStatus":{"status":"OK"}}"#),
        (200, r#"{"issues":[]}"#),
    ]);

    let summary = probe_runtime_external_services_with_options(
        &config,
        &RepositorySlug::new("VannaDii/ironloom").expect("repository slug should be valid"),
        &github,
        &sonarcloud,
        RuntimeExternalProbeOptions {
            pull_request_number: Some(42),
            check_ref: Some("feature/runtime".to_owned()),
        },
    )
    .expect("runtime probe should complete");

    let pull_request = summary
        .github_pull_request
        .expect("pull request should be read");
    assert_eq!(42, pull_request.number);
    assert_eq!("clean", pull_request.mergeable_state);
    assert_eq!(Some(true), pull_request.mergeable);
    assert_eq!(1, summary.github_check_runs.len());
    assert_eq!("CI", summary.github_check_runs[0].name);
    let requests = github.requests();
    assert_eq!("/repos/VannaDii/ironloom", requests[0].path);
    assert_eq!("/repos/VannaDii/ironloom/pulls/42", requests[1].path);
    assert_eq!(
        "/repos/VannaDii/ironloom/commits/feature%2Fruntime/check-runs",
        requests[2].path
    );
}

#[test]
fn runtime_http_executes_signed_thread_bound_discord_command() {
    let signing_key = SigningKey::from_bytes(&[7_u8; 32]);
    let public_key = hex::encode(signing_key.verifying_key().to_bytes());
    let context = ready_context(&public_key);
    let temp = tempfile::tempdir().expect("temp dir should exist");
    let setup_store = SetupConfigStore::new(temp.path());
    let work_store = FilesystemStore::new(temp.path()).expect("work store should initialize");
    work_store
        .bind_thread_to_work_item(
            &ironloom_core::ThreadId::new("thread-1").expect("thread should be valid"),
            &ironloom_core::WorkItemId::new("work-1").expect("work item should be valid"),
        )
        .expect("thread binding should persist");
    let gate_executor = StaticGateExecutor;
    let body = r#"{"type":2,"id":"interaction-1","channel_id":"thread-1","member":{"user":{"id":"operator-1"}},"data":{"name":"run_gate"}}"#;
    let request = signed_interaction_request(&signing_key, body);

    let response = handle_runtime_http_request_with_services(
        &context,
        &setup_store,
        &work_store,
        &gate_executor,
        &request,
    );

    assert_eq!(200, response.status_code);
    assert_eq!("application/json", response.content_type);
    let payload: serde_json::Value =
        serde_json::from_str(&response.body).expect("response should be JSON");
    assert_eq!(4, payload["type"]);
    assert!(
        payload["data"]["content"]
            .as_str()
            .expect("content should be present")
            .contains("Gate completed through run_gate_worker")
    );
    let artifact_ids = work_store
        .artifact_ids_for_thread(
            &ironloom_core::ThreadId::new("thread-1").expect("thread should be valid"),
        )
        .expect("thread artifacts should load");
    assert_eq!(1, artifact_ids.len());
}

fn ready_context(discord_public_key: &str) -> RuntimeHttpContext {
    RuntimeHttpContext::new(
        RuntimeConfigInputs::from_environment_pairs([
            ("IRONLOOM_PUBLIC_URL", "https://ironloom.dev"),
            ("IRONLOOM_STATE_ROOT", "/var/lib/ironloom/.ironloom"),
            ("IRONLOOM_DISCORD_APPLICATION_ID", "123456789012345678"),
            ("IRONLOOM_DISCORD_TOKEN", "discord-token"),
            ("IRONLOOM_DISCORD_PUBLIC_KEY", discord_public_key),
            ("IRONLOOM_GITHUB_TOKEN", "github-token"),
            ("IRONLOOM_SONARCLOUD_TOKEN", "sonar-token"),
            ("IRONLOOM_SONARCLOUD_ORGANIZATION", "sonar-org"),
            ("IRONLOOM_SONARCLOUD_PROJECT_KEY", "sonar-project"),
            ("IRONLOOM_OPENAI_API_KEY", "openai-key"),
        ]),
        None,
        None,
    )
}

fn signed_interaction_request(signing_key: &SigningKey, body: &str) -> String {
    let timestamp = "1700000000";
    let signature = signing_key.sign(format!("{timestamp}{body}").as_bytes());
    format!(
        "POST /discord/interactions HTTP/1.1\r\nx-signature-ed25519: {}\r\nx-signature-timestamp: {timestamp}\r\ncontent-length: {}\r\n\r\n{body}",
        hex::encode(signature.to_bytes()),
        body.len()
    )
}

struct CapturingGitHubTransport {
    responses: RefCell<Vec<(u16, String)>>,
    requests: RefCell<Vec<GitHubHttpRequest>>,
}

impl CapturingGitHubTransport {
    fn new<const COUNT: usize>(responses: [(u16, &str); COUNT]) -> Self {
        Self {
            responses: RefCell::new(
                responses
                    .into_iter()
                    .map(|(status, body)| (status, body.to_owned()))
                    .collect(),
            ),
            requests: RefCell::new(Vec::new()),
        }
    }

    fn request(&self) -> GitHubHttpRequest {
        self.requests()
            .into_iter()
            .next()
            .expect("GitHub request should be captured")
    }

    fn requests(&self) -> Vec<GitHubHttpRequest> {
        self.requests.borrow().clone()
    }
}

impl GitHubTransport for &CapturingGitHubTransport {
    fn send(&self, request: GitHubHttpRequest) -> GitHubHttpResponse {
        self.requests.borrow_mut().push(request);
        let (status, body) = self.responses.borrow_mut().remove(0);
        GitHubHttpResponse { status, body }
    }
}

struct CapturingSonarCloudTransport {
    responses: RefCell<Vec<(u16, String)>>,
    requests: RefCell<Vec<SonarCloudHttpRequest>>,
}

impl CapturingSonarCloudTransport {
    fn new<const COUNT: usize>(responses: [(u16, &str); COUNT]) -> Self {
        Self {
            responses: RefCell::new(
                responses
                    .into_iter()
                    .map(|(status, body)| (status, body.to_owned()))
                    .collect(),
            ),
            requests: RefCell::new(Vec::new()),
        }
    }

    fn requests(&self) -> Vec<SonarCloudHttpRequest> {
        self.requests.borrow().clone()
    }
}

impl SonarCloudTransport for &CapturingSonarCloudTransport {
    fn send(&self, request: SonarCloudHttpRequest) -> SonarCloudHttpResponse {
        self.requests.borrow_mut().push(request);
        let (status, body) = self.responses.borrow_mut().remove(0);
        SonarCloudHttpResponse { status, body }
    }
}

struct StaticGateExecutor;

impl GateExecutor for StaticGateExecutor {
    fn run_gate(&self, command: &str) -> GateResult {
        GateResult::passed(format!("accepted command: {command}"))
    }
}
