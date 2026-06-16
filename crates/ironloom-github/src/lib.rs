#![forbid(unsafe_code)]

use ironloom_core::RepositorySlug;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;

const GITHUB_ACCEPT_HEADER: &str = "application/vnd.github+json";
const GITHUB_API_VERSION: &str = "2022-11-28";
const GITHUB_API_BASE_URL: &str = "https://api.github.com";
const IRONLOOM_USER_AGENT: &str = "ironloom-runtime";
const TRANSPORT_ERROR_STATUS: u16 = 599;

/// HTTP request emitted by the GitHub adapter.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GitHubHttpRequest {
    /// HTTP method.
    pub method: String,
    /// GitHub API path.
    pub path: String,
    /// HTTP request headers.
    pub headers: Vec<(String, String)>,
    /// HTTP request body.
    pub body: String,
}

/// HTTP response consumed by the GitHub adapter.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GitHubHttpResponse {
    /// HTTP status code.
    pub status: u16,
    /// HTTP response body.
    pub body: String,
}

/// Minimal transport boundary for GitHub API requests.
pub trait GitHubTransport {
    /// Sends a GitHub HTTP request and returns the response.
    fn send(&self, request: GitHubHttpRequest) -> GitHubHttpResponse;
}

/// Blocking HTTP transport for GitHub API requests.
#[derive(Clone, Debug)]
pub struct GitHubHttpTransport {
    base_url: String,
    client: reqwest::blocking::Client,
}

impl GitHubHttpTransport {
    /// Creates a GitHub HTTP transport with a custom API base URL.
    #[must_use]
    pub fn new(base_url: impl Into<String>) -> Self {
        Self {
            base_url: base_url.into(),
            client: reqwest::blocking::Client::new(),
        }
    }

    /// Creates a GitHub HTTP transport for the public GitHub API.
    #[must_use]
    pub fn public_api() -> Self {
        Self::new(GITHUB_API_BASE_URL)
    }

    fn request_url(&self, path: &str) -> String {
        format!("{}{}", self.base_url.trim_end_matches('/'), path)
    }
}

impl GitHubTransport for GitHubHttpTransport {
    fn send(&self, request: GitHubHttpRequest) -> GitHubHttpResponse {
        let Ok(method) = reqwest::Method::from_bytes(request.method.as_bytes()) else {
            return transport_error(format!("invalid HTTP method: {}", request.method));
        };
        let mut builder = self
            .client
            .request(method, self.request_url(&request.path))
            .body(request.body);
        for (name, value) in request.headers {
            builder = builder.header(name, value);
        }
        match builder.send() {
            Ok(response) => {
                let status = response.status().as_u16();
                match response.text() {
                    Ok(body) => GitHubHttpResponse { status, body },
                    Err(error) => {
                        transport_error(format!("failed to read GitHub response: {error}"))
                    }
                }
            }
            Err(error) => transport_error(format!("GitHub transport failed: {error}")),
        }
    }
}

/// Errors returned by the GitHub API adapter.
#[derive(Debug, Error, Eq, PartialEq)]
pub enum GitHubApiError {
    /// GitHub returned a non-success status code.
    #[error("GitHub API returned {status}: {body}")]
    UnsuccessfulStatus {
        /// HTTP status code.
        status: u16,
        /// Response body.
        body: String,
    },
    /// GitHub response JSON could not be parsed.
    #[error("GitHub API response could not be parsed: {0}")]
    InvalidJson(String),
    /// GitHub response lacked a required field.
    #[error("GitHub API response missing field: {field}")]
    MissingField {
        /// Missing field name.
        field: &'static str,
    },
}

/// GitHub API client that reads source-of-truth state through an injected transport.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GitHubApiClient<Transport> {
    token: String,
    transport: Transport,
}

impl<Transport> GitHubApiClient<Transport>
where
    Transport: GitHubTransport,
{
    /// Creates a GitHub API client using a bearer token.
    #[must_use]
    pub fn new(token: impl Into<String>, transport: Transport) -> Self {
        Self {
            token: token.into(),
            transport,
        }
    }

    /// Reads repository state directly from GitHub.
    pub fn read_repository(
        &self,
        repository: &RepositorySlug,
    ) -> Result<RepositoryProjection, GitHubApiError> {
        let response = self.transport.send(GitHubHttpRequest {
            method: "GET".to_owned(),
            path: format!("/repos/{}", repository.as_str()),
            headers: github_headers(&self.token),
            body: String::new(),
        });
        if !(200..300).contains(&response.status) {
            return Err(GitHubApiError::UnsuccessfulStatus {
                status: response.status,
                body: response.body,
            });
        }
        let payload = serde_json::from_str::<serde_json::Value>(&response.body)
            .map_err(|error| GitHubApiError::InvalidJson(error.to_string()))?;
        let default_branch = payload
            .get("default_branch")
            .and_then(serde_json::Value::as_str)
            .ok_or(GitHubApiError::MissingField {
                field: "default_branch",
            })?;
        Ok(RepositoryProjection::from_source_of_truth(
            repository.clone(),
            default_branch,
        ))
    }

    /// Reads pull request state directly from GitHub.
    pub fn read_pull_request(
        &self,
        repository: &RepositorySlug,
        number: u64,
    ) -> Result<PullRequestProjection, GitHubApiError> {
        let response = self.transport.send(GitHubHttpRequest {
            method: "GET".to_owned(),
            path: format!("/repos/{}/pulls/{number}", repository.as_str()),
            headers: github_headers(&self.token),
            body: String::new(),
        });
        let payload = parse_success_json(response)?;
        let number = required_u64(&payload, "number")?;
        let head_branch = required_nested_str(&payload, "head", "ref")?;
        let base_branch = required_nested_str(&payload, "base", "ref")?;
        let draft = required_bool(&payload, "draft")?;
        let mergeable = optional_bool(&payload, "mergeable");
        let mergeable_state = required_str(&payload, "mergeable_state")?;
        Ok(PullRequestProjection::from_source_of_truth(
            repository.clone(),
            number,
            head_branch,
            base_branch,
            draft,
            mergeable,
            mergeable_state,
        ))
    }

    /// Lists check runs for a branch, tag, or commit SHA directly from GitHub.
    pub fn list_check_runs_for_ref(
        &self,
        repository: &RepositorySlug,
        git_ref: &str,
    ) -> Result<Vec<CheckRunProjection>, GitHubApiError> {
        let response = self.transport.send(GitHubHttpRequest {
            method: "GET".to_owned(),
            path: format!(
                "/repos/{}/commits/{}/check-runs",
                repository.as_str(),
                path_segment(git_ref)
            ),
            headers: github_headers(&self.token),
            body: String::new(),
        });
        let payload = parse_success_json(response)?;
        let check_runs = payload.get("check_runs").and_then(Value::as_array).ok_or(
            GitHubApiError::MissingField {
                field: "check_runs",
            },
        )?;
        check_runs
            .iter()
            .map(CheckRunProjection::from_source_of_truth)
            .collect()
    }
}

/// Source-of-truth GitHub repository projection.
#[derive(Clone, Debug, Eq, JsonSchema, PartialEq, Deserialize, Serialize)]
pub struct RepositoryProjection {
    /// GitHub repository slug.
    pub repository: RepositorySlug,
    /// Default branch reported by GitHub.
    pub default_branch: String,
    /// Whether the value came directly from GitHub instead of local cache.
    pub source_of_truth: bool,
}

impl RepositoryProjection {
    /// Builds a projection that explicitly represents a fresh GitHub read.
    #[must_use]
    pub fn from_source_of_truth(
        repository: RepositorySlug,
        default_branch: impl Into<String>,
    ) -> Self {
        Self {
            repository,
            default_branch: default_branch.into(),
            source_of_truth: true,
        }
    }
}

/// Source-of-truth GitHub pull request projection.
#[derive(Clone, Debug, Eq, JsonSchema, PartialEq, Deserialize, Serialize)]
pub struct PullRequestProjection {
    /// GitHub repository slug.
    pub repository: RepositorySlug,
    /// Pull request number.
    pub number: u64,
    /// Pull request head branch.
    pub head_branch: String,
    /// Pull request base branch.
    pub base_branch: String,
    /// Whether GitHub marks the pull request as draft.
    pub draft: bool,
    /// GitHub mergeability value. `None` means GitHub has not computed it yet.
    pub mergeable: Option<bool>,
    /// GitHub mergeability state string.
    pub mergeable_state: String,
    /// Whether the value came directly from GitHub instead of local cache.
    pub source_of_truth: bool,
}

impl PullRequestProjection {
    /// Builds a projection that explicitly represents a fresh GitHub read.
    #[must_use]
    pub fn from_source_of_truth(
        repository: RepositorySlug,
        number: u64,
        head_branch: impl Into<String>,
        base_branch: impl Into<String>,
        draft: bool,
        mergeable: Option<bool>,
        mergeable_state: impl Into<String>,
    ) -> Self {
        Self {
            repository,
            number,
            head_branch: head_branch.into(),
            base_branch: base_branch.into(),
            draft,
            mergeable,
            mergeable_state: mergeable_state.into(),
            source_of_truth: true,
        }
    }
}

/// Normalized GitHub check-run status.
#[derive(Clone, Debug, Eq, JsonSchema, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CheckRunStatus {
    /// Check run is queued.
    Queued,
    /// Check run is running.
    InProgress,
    /// Check run completed.
    Completed,
    /// GitHub returned an unrecognized status.
    Unknown,
}

/// Normalized GitHub check-run conclusion.
#[derive(Clone, Debug, Eq, JsonSchema, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CheckRunConclusion {
    /// Check run succeeded.
    Success,
    /// Check run failed.
    Failure,
    /// Check run was cancelled.
    Cancelled,
    /// Check run was skipped.
    Skipped,
    /// Check run timed out.
    TimedOut,
    /// Check run requires action.
    ActionRequired,
    /// Check run completed neutrally.
    Neutral,
    /// Check run is stale.
    Stale,
    /// GitHub returned an unrecognized conclusion.
    Unknown,
}

/// Source-of-truth GitHub check-run projection.
#[derive(Clone, Debug, Eq, JsonSchema, PartialEq, Deserialize, Serialize)]
pub struct CheckRunProjection {
    /// Check-run name.
    pub name: String,
    /// Normalized check-run status.
    pub status: CheckRunStatus,
    /// Normalized check-run conclusion when GitHub has one.
    pub conclusion: Option<CheckRunConclusion>,
    /// Whether the value came directly from GitHub instead of local cache.
    pub source_of_truth: bool,
}

impl CheckRunProjection {
    fn from_source_of_truth(value: &Value) -> Result<Self, GitHubApiError> {
        Ok(Self {
            name: required_str(value, "name")?.to_owned(),
            status: normalize_check_status(required_str(value, "status")?),
            conclusion: value
                .get("conclusion")
                .and_then(Value::as_str)
                .map(normalize_check_conclusion),
            source_of_truth: true,
        })
    }
}

fn github_headers(token: &str) -> Vec<(String, String)> {
    vec![
        ("Authorization".to_owned(), format!("Bearer {token}")),
        ("Accept".to_owned(), GITHUB_ACCEPT_HEADER.to_owned()),
        (
            "X-GitHub-Api-Version".to_owned(),
            GITHUB_API_VERSION.to_owned(),
        ),
        ("User-Agent".to_owned(), IRONLOOM_USER_AGENT.to_owned()),
    ]
}

fn parse_success_json(response: GitHubHttpResponse) -> Result<Value, GitHubApiError> {
    if !(200..300).contains(&response.status) {
        return Err(GitHubApiError::UnsuccessfulStatus {
            status: response.status,
            body: response.body,
        });
    }
    serde_json::from_str::<Value>(&response.body)
        .map_err(|error| GitHubApiError::InvalidJson(error.to_string()))
}

fn required_str<'a>(value: &'a Value, field: &'static str) -> Result<&'a str, GitHubApiError> {
    value
        .get(field)
        .and_then(Value::as_str)
        .ok_or(GitHubApiError::MissingField { field })
}

fn required_u64(value: &Value, field: &'static str) -> Result<u64, GitHubApiError> {
    value
        .get(field)
        .and_then(Value::as_u64)
        .ok_or(GitHubApiError::MissingField { field })
}

fn required_bool(value: &Value, field: &'static str) -> Result<bool, GitHubApiError> {
    value
        .get(field)
        .and_then(Value::as_bool)
        .ok_or(GitHubApiError::MissingField { field })
}

fn optional_bool(value: &Value, field: &'static str) -> Option<bool> {
    value.get(field).and_then(Value::as_bool)
}

fn required_nested_str<'a>(
    value: &'a Value,
    parent: &'static str,
    field: &'static str,
) -> Result<&'a str, GitHubApiError> {
    value
        .get(parent)
        .and_then(|nested| nested.get(field))
        .and_then(Value::as_str)
        .ok_or(GitHubApiError::MissingField { field })
}

fn normalize_check_status(status: &str) -> CheckRunStatus {
    match status {
        "queued" => CheckRunStatus::Queued,
        "in_progress" => CheckRunStatus::InProgress,
        "completed" => CheckRunStatus::Completed,
        _ => CheckRunStatus::Unknown,
    }
}

fn normalize_check_conclusion(conclusion: &str) -> CheckRunConclusion {
    match conclusion {
        "success" => CheckRunConclusion::Success,
        "failure" => CheckRunConclusion::Failure,
        "cancelled" => CheckRunConclusion::Cancelled,
        "skipped" => CheckRunConclusion::Skipped,
        "timed_out" => CheckRunConclusion::TimedOut,
        "action_required" => CheckRunConclusion::ActionRequired,
        "neutral" => CheckRunConclusion::Neutral,
        "stale" => CheckRunConclusion::Stale,
        _ => CheckRunConclusion::Unknown,
    }
}

fn path_segment(value: &str) -> String {
    url::form_urlencoded::byte_serialize(value.as_bytes()).collect()
}

fn transport_error(body: String) -> GitHubHttpResponse {
    GitHubHttpResponse {
        status: TRANSPORT_ERROR_STATUS,
        body,
    }
}
