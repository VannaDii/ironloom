#![forbid(unsafe_code)]

use ironloom_core::RepositorySlug;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
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

fn transport_error(body: String) -> GitHubHttpResponse {
    GitHubHttpResponse {
        status: TRANSPORT_ERROR_STATUS,
        body,
    }
}
