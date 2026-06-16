#![forbid(unsafe_code)]

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;

const SONARCLOUD_API_BASE_URL: &str = "https://sonarcloud.io";
const SONARCLOUD_USER_AGENT: &str = "ironloom-runtime";
const TRANSPORT_ERROR_STATUS: u16 = 599;

/// SonarCloud bootstrap settings.
#[derive(Clone, Debug, Eq, JsonSchema, PartialEq, Deserialize, Serialize)]
pub struct SonarCloudConfig {
    /// SonarCloud organization key.
    pub organization: String,
    /// SonarCloud project key.
    pub project_key: String,
    /// Token secret reference.
    pub token_ref: String,
}

/// SonarCloud bootstrap validation error.
#[derive(Debug, Error, Eq, PartialEq)]
pub enum SonarCloudError {
    /// Required bootstrap field was missing.
    #[error("{field} is required for SonarCloud bootstrap")]
    MissingBootstrapField { field: &'static str },
    /// SonarCloud returned a non-success status code.
    #[error("SonarCloud API returned {status}: {body}")]
    UnsuccessfulStatus {
        /// HTTP status code.
        status: u16,
        /// Response body.
        body: String,
    },
    /// SonarCloud response JSON could not be parsed.
    #[error("SonarCloud API response could not be parsed: {0}")]
    InvalidJson(String),
    /// SonarCloud response lacked a required field.
    #[error("SonarCloud API response missing field: {field}")]
    MissingField {
        /// Missing field name.
        field: &'static str,
    },
}

impl SonarCloudConfig {
    /// Validates bootstrap settings before polling quality gates.
    pub fn validate(&self) -> Result<(), SonarCloudError> {
        if self.organization.trim().is_empty() {
            return Err(SonarCloudError::MissingBootstrapField {
                field: "organization",
            });
        }
        if self.project_key.trim().is_empty() {
            return Err(SonarCloudError::MissingBootstrapField {
                field: "project_key",
            });
        }
        if self.token_ref.trim().is_empty() {
            return Err(SonarCloudError::MissingBootstrapField { field: "token_ref" });
        }
        Ok(())
    }
}

/// HTTP request emitted by the SonarCloud adapter.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SonarCloudHttpRequest {
    /// HTTP method.
    pub method: String,
    /// SonarCloud API path.
    pub path: String,
    /// HTTP request headers.
    pub headers: Vec<(String, String)>,
    /// HTTP request body.
    pub body: String,
}

/// HTTP response consumed by the SonarCloud adapter.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SonarCloudHttpResponse {
    /// HTTP status code.
    pub status: u16,
    /// HTTP response body.
    pub body: String,
}

/// Minimal transport boundary for SonarCloud API requests.
pub trait SonarCloudTransport {
    /// Sends a SonarCloud HTTP request and returns the response.
    fn send(&self, request: SonarCloudHttpRequest) -> SonarCloudHttpResponse;
}

/// Blocking HTTP transport for SonarCloud API requests.
#[derive(Clone, Debug)]
pub struct SonarCloudHttpTransport {
    base_url: String,
    client: reqwest::blocking::Client,
}

impl SonarCloudHttpTransport {
    /// Creates a SonarCloud HTTP transport with a custom API base URL.
    #[must_use]
    pub fn new(base_url: impl Into<String>) -> Self {
        Self {
            base_url: base_url.into(),
            client: reqwest::blocking::Client::new(),
        }
    }

    /// Creates a SonarCloud HTTP transport for the public SonarCloud API.
    #[must_use]
    pub fn public_api() -> Self {
        Self::new(SONARCLOUD_API_BASE_URL)
    }

    fn request_url(&self, path: &str) -> String {
        format!("{}{}", self.base_url.trim_end_matches('/'), path)
    }
}

impl SonarCloudTransport for SonarCloudHttpTransport {
    fn send(&self, request: SonarCloudHttpRequest) -> SonarCloudHttpResponse {
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
                    Ok(body) => SonarCloudHttpResponse { status, body },
                    Err(error) => {
                        transport_error(format!("failed to read SonarCloud response: {error}"))
                    }
                }
            }
            Err(error) => transport_error(format!("SonarCloud transport failed: {error}")),
        }
    }
}

/// Normalized quality gate status used by Ironloom.
#[derive(Clone, Debug, Eq, JsonSchema, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum QualityGateStatus {
    /// SonarCloud reported the quality gate passed.
    Passed,
    /// SonarCloud reported the quality gate failed or warned.
    Failed,
    /// SonarCloud did not report a terminal quality gate state.
    Pending,
}

/// Normalized SonarCloud issue severity.
#[derive(Clone, Debug, Eq, JsonSchema, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SonarCloudIssueSeverity {
    /// Blocking severity.
    Blocker,
    /// Critical severity.
    Critical,
    /// Major severity.
    Major,
    /// Minor severity.
    Minor,
    /// Informational severity.
    Info,
    /// Unrecognized severity.
    Unknown,
}

/// Normalized SonarCloud issue.
#[derive(Clone, Debug, Eq, JsonSchema, PartialEq, Deserialize, Serialize)]
pub struct SonarCloudIssue {
    /// SonarCloud issue key.
    pub key: String,
    /// Normalized severity.
    pub severity: SonarCloudIssueSeverity,
    /// SonarCloud issue type.
    pub issue_type: String,
    /// Human-facing issue message.
    pub message: String,
    /// SonarCloud issue status.
    pub status: String,
}

/// SonarCloud client that reads quality and compliance state through an injected transport.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SonarCloudClient<Transport> {
    token: String,
    organization: String,
    project_key: String,
    transport: Transport,
}

impl<Transport> SonarCloudClient<Transport>
where
    Transport: SonarCloudTransport,
{
    /// Creates a SonarCloud API client using a bearer token.
    #[must_use]
    pub fn new(
        token: impl Into<String>,
        organization: impl Into<String>,
        project_key: impl Into<String>,
        transport: Transport,
    ) -> Self {
        Self {
            token: token.into(),
            organization: organization.into(),
            project_key: project_key.into(),
            transport,
        }
    }

    /// Polls the current project quality gate status.
    pub fn poll_quality_gate(&self) -> Result<QualityGateStatus, SonarCloudError> {
        let response = self.transport.send(SonarCloudHttpRequest {
            method: "GET".to_owned(),
            path: self.path(
                "/api/qualitygates/project_status",
                [
                    ("organization", self.organization.as_str()),
                    ("projectKey", self.project_key.as_str()),
                ],
            ),
            headers: sonar_headers(&self.token),
            body: String::new(),
        });
        let payload = parse_success_json(response)?;
        let status = required_str(
            payload
                .get("projectStatus")
                .ok_or(SonarCloudError::MissingField {
                    field: "projectStatus",
                })?,
            "status",
        )?;
        Ok(match status {
            "OK" => QualityGateStatus::Passed,
            "ERROR" | "WARN" => QualityGateStatus::Failed,
            "NONE" => self.enforce_default_quality_gate_fallback()?,
            _ => QualityGateStatus::Pending,
        })
    }

    /// Searches unresolved SonarCloud issues for the configured project.
    pub fn search_open_issues(&self) -> Result<Vec<SonarCloudIssue>, SonarCloudError> {
        let response = self.transport.send(SonarCloudHttpRequest {
            method: "GET".to_owned(),
            path: self.path(
                "/api/issues/search",
                [
                    ("organization", self.organization.as_str()),
                    ("componentKeys", self.project_key.as_str()),
                    ("resolved", "false"),
                ],
            ),
            headers: sonar_headers(&self.token),
            body: String::new(),
        });
        let payload = parse_success_json(response)?;
        let issues = payload
            .get("issues")
            .and_then(Value::as_array)
            .ok_or(SonarCloudError::MissingField { field: "issues" })?;
        issues.iter().map(normalize_issue).collect()
    }

    fn path<'a>(&self, path: &str, query: impl IntoIterator<Item = (&'a str, &'a str)>) -> String {
        let mut serializer = url::form_urlencoded::Serializer::new(String::new());
        for (name, value) in query {
            serializer.append_pair(name, value);
        }
        format!("{path}?{}", serializer.finish())
    }

    fn enforce_default_quality_gate_fallback(&self) -> Result<QualityGateStatus, SonarCloudError> {
        let gates_response = self.transport.send(SonarCloudHttpRequest {
            method: "GET".to_owned(),
            path: self.path(
                "/api/qualitygates/list",
                [("organization", self.organization.as_str())],
            ),
            headers: sonar_headers(&self.token),
            body: String::new(),
        });
        let gates_payload = parse_success_json(gates_response)?;
        let gate_id = default_gate_id(&gates_payload)?;
        let conditions = default_gate_conditions(&gates_payload, &gate_id)?;
        if conditions.is_empty() {
            return Err(SonarCloudError::MissingField {
                field: "quality_gate_conditions",
            });
        }
        let metric_keys = source_metric_keys(&conditions)?;
        let measures_response = self.transport.send(SonarCloudHttpRequest {
            method: "GET".to_owned(),
            path: self.path(
                "/api/measures/component",
                [
                    ("component", self.project_key.as_str()),
                    ("metricKeys", metric_keys.as_str()),
                ],
            ),
            headers: sonar_headers(&self.token),
            body: String::new(),
        });
        let measures_payload = parse_success_json(measures_response)?;
        if default_gate_fails(&conditions, &measures_payload)? {
            Ok(QualityGateStatus::Failed)
        } else {
            Ok(QualityGateStatus::Passed)
        }
    }
}

fn parse_success_json(response: SonarCloudHttpResponse) -> Result<Value, SonarCloudError> {
    if !(200..300).contains(&response.status) {
        return Err(SonarCloudError::UnsuccessfulStatus {
            status: response.status,
            body: response.body,
        });
    }
    serde_json::from_str(&response.body)
        .map_err(|error| SonarCloudError::InvalidJson(error.to_string()))
}

fn normalize_issue(issue: &Value) -> Result<SonarCloudIssue, SonarCloudError> {
    Ok(SonarCloudIssue {
        key: required_str(issue, "key")?.to_owned(),
        severity: normalize_severity(required_str(issue, "severity")?),
        issue_type: required_str(issue, "type")?.to_owned(),
        message: required_str(issue, "message")?.to_owned(),
        status: required_str(issue, "status")?.to_owned(),
    })
}

fn required_str<'a>(value: &'a Value, field: &'static str) -> Result<&'a str, SonarCloudError> {
    value
        .get(field)
        .and_then(Value::as_str)
        .ok_or(SonarCloudError::MissingField { field })
}

fn default_gate_id(payload: &Value) -> Result<String, SonarCloudError> {
    if let Some(default) = payload.get("default").and_then(json_id) {
        return Ok(default);
    }
    payload
        .get("qualitygates")
        .and_then(Value::as_array)
        .and_then(|gates| {
            gates
                .iter()
                .find(|gate| gate.get("isDefault").and_then(Value::as_bool) == Some(true))
        })
        .and_then(|gate| gate.get("id"))
        .and_then(json_id)
        .ok_or(SonarCloudError::MissingField {
            field: "default_quality_gate",
        })
}

fn default_gate_conditions<'a>(
    payload: &'a Value,
    gate_id: &str,
) -> Result<Vec<&'a Value>, SonarCloudError> {
    let gates = payload
        .get("qualitygates")
        .and_then(Value::as_array)
        .ok_or(SonarCloudError::MissingField {
            field: "qualitygates",
        })?;
    let gate = gates
        .iter()
        .find(|gate| gate.get("id").and_then(json_id).as_deref() == Some(gate_id))
        .ok_or(SonarCloudError::MissingField {
            field: "default_quality_gate",
        })?;
    let conditions =
        gate.get("conditions")
            .and_then(Value::as_array)
            .ok_or(SonarCloudError::MissingField {
                field: "quality_gate_conditions",
            })?;
    Ok(conditions.iter().collect())
}

fn source_metric_keys(conditions: &[&Value]) -> Result<String, SonarCloudError> {
    let mut metrics = Vec::<&str>::new();
    for condition in conditions {
        let source_metric = source_metric(required_str(condition, "metric")?);
        if !metrics.contains(&source_metric) {
            metrics.push(source_metric);
        }
    }
    Ok(metrics.join(","))
}

fn default_gate_fails(
    conditions: &[&Value],
    measures_payload: &Value,
) -> Result<bool, SonarCloudError> {
    for condition in conditions {
        let source_metric = source_metric(required_str(condition, "metric")?);
        let comparator = required_str(condition, "op")?;
        let threshold = required_str(condition, "error")?;
        let Some(actual) = measure_value(measures_payload, source_metric) else {
            return Ok(true);
        };
        if condition_fails(actual, comparator, threshold) {
            return Ok(true);
        }
    }
    Ok(false)
}

fn measure_value<'a>(payload: &'a Value, metric: &str) -> Option<&'a str> {
    payload
        .get("component")
        .and_then(|component| component.get("measures"))
        .and_then(Value::as_array)?
        .iter()
        .find(|measure| measure.get("metric").and_then(Value::as_str) == Some(metric))?
        .get("value")
        .and_then(Value::as_str)
}

fn condition_fails(actual: &str, comparator: &str, threshold: &str) -> bool {
    let Ok(actual) = actual.parse::<f64>() else {
        return true;
    };
    let Ok(threshold) = threshold.parse::<f64>() else {
        return true;
    };
    match comparator {
        "LT" => actual < threshold,
        "GT" => actual > threshold,
        "EQ" => actual == threshold,
        "NE" => (actual - threshold).abs() > f64::EPSILON,
        _ => true,
    }
}

fn source_metric(metric: &str) -> &str {
    match metric {
        "new_security_rating" => "security_rating",
        "new_reliability_rating" => "reliability_rating",
        "new_maintainability_rating" => "sqale_rating",
        "new_coverage" => "coverage",
        "new_duplicated_lines_density" => "duplicated_lines_density",
        "new_security_hotspots_reviewed" => "security_hotspots_reviewed",
        _ => metric,
    }
}

fn json_id(value: &Value) -> Option<String> {
    value
        .as_u64()
        .map(|id| id.to_string())
        .or_else(|| value.as_str().map(ToOwned::to_owned))
}

fn normalize_severity(severity: &str) -> SonarCloudIssueSeverity {
    match severity {
        "BLOCKER" => SonarCloudIssueSeverity::Blocker,
        "CRITICAL" => SonarCloudIssueSeverity::Critical,
        "MAJOR" => SonarCloudIssueSeverity::Major,
        "MINOR" => SonarCloudIssueSeverity::Minor,
        "INFO" => SonarCloudIssueSeverity::Info,
        _ => SonarCloudIssueSeverity::Unknown,
    }
}

fn sonar_headers(token: &str) -> Vec<(String, String)> {
    vec![
        ("Authorization".to_owned(), format!("Bearer {token}")),
        ("Accept".to_owned(), "application/json".to_owned()),
        ("User-Agent".to_owned(), SONARCLOUD_USER_AGENT.to_owned()),
    ]
}

fn transport_error(body: String) -> SonarCloudHttpResponse {
    SonarCloudHttpResponse {
        status: TRANSPORT_ERROR_STATUS,
        body,
    }
}
