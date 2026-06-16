#![forbid(unsafe_code)]

use std::cell::Cell;
use std::fs;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};

use ironloom_config::{
    ConfigError, IRONLOOM_CONFIG_KEY_ENV, IRONLOOM_DISCORD_APPLICATION_ID_ENV,
    IRONLOOM_DISCORD_PUBLIC_KEY_ENV, IRONLOOM_DISCORD_TOKEN_ENV, IRONLOOM_GITHUB_TOKEN_ENV,
    IRONLOOM_OPENAI_API_KEY_ENV, IRONLOOM_OPENAI_OAUTH_SESSION_ENV, IRONLOOM_PUBLIC_URL_ENV,
    IRONLOOM_SONARCLOUD_ORGANIZATION_ENV, IRONLOOM_SONARCLOUD_PROJECT_KEY_ENV,
    IRONLOOM_SONARCLOUD_TOKEN_ENV, RuntimeConfig, RuntimeConfigInputs, SetupEnvironment,
    StoredSetupConfig,
};
use ironloom_core::{ActorId, CorrelationId, RepositorySlug, ThreadId};
use ironloom_discord::{
    DiscordCommand, DiscordError, DiscordInteractionRequest, FakeDiscordTransport,
    ThreadBindingRegistry, handle_discord_interaction,
};
use ironloom_gates::{CommandGateExecutor, GateCommand, GateExecutor, GateResult};
use ironloom_github::{
    CheckRunProjection, GitHubApiClient, GitHubApiError, GitHubTransport, PullRequestProjection,
    RepositoryProjection,
};
use ironloom_sonarcloud::{
    QualityGateStatus, SonarCloudClient, SonarCloudError, SonarCloudIssue, SonarCloudTransport,
};
use ironloom_storage::{FilesystemStore, SetupConfigStore, StorageError, ThreadBindingError};
use ironloom_supervisor::{SupervisorError, SupervisorInput, run_gate_work};
use thiserror::Error;

const FIELD_RUNTIME_URL: &str = "runtime_url";
const FIELD_DISCORD_APPLICATION_ID: &str = "discord_application_id";
const FIELD_DISCORD_TOKEN_REF: &str = "discord_token_ref";
const FIELD_DISCORD_PUBLIC_KEY_REF: &str = "discord_public_key_ref";
const FIELD_GITHUB_TOKEN_REF: &str = "github_token_ref";
const FIELD_SONARCLOUD_TOKEN_REF: &str = "sonarcloud_token_ref";
const FIELD_SONARCLOUD_ORGANIZATION: &str = "sonarcloud_organization";
const FIELD_SONARCLOUD_PROJECT_KEY: &str = "sonarcloud_project_key";
const FIELD_OPENAI_API_KEY_REF: &str = "openai_api_key_ref";
const FIELD_OPENAI_OAUTH_SESSION_REF: &str = "openai_oauth_session_ref";
const FIELD_OPENAI_AUTH_METHOD: &str = "openai_auth_method";
const FIELD_INSTALLER_TOKEN: &str = "installer_token";
const FIELD_CONFIG_KEY: &str = "config_key";
const OPENAI_AUTH_METHOD_API_KEY: &str = "api_key";
const OPENAI_AUTH_METHOD_CHATGPT_OAUTH: &str = "chatgpt_oauth";
const DISCORD_AUTHORIZE_URL: &str = "https://discord.com/oauth2/authorize";
const DISCORD_AUTHORIZE_SCOPE: &str = "bot applications.commands";
const DISCORD_DEFAULT_PERMISSIONS: &str = "0";
const DISCORD_APPLICATION_COMMAND_INTERACTION_TYPE: u64 = 2;
const DISCORD_CHANNEL_MESSAGE_RESPONSE_TYPE: u64 = 4;
const DEFAULT_STATE_ROOT: &str = ".ironloom";
const HTTP_READ_BUFFER_BYTES: usize = 16_384;
const PROOF_THREAD_ID: &str = "proof-thread";
const PROOF_WORK_ITEM_ID: &str = "proof-work-item";
const PROOF_ACTOR_ID: &str = "proof-operator";
const PROOF_CORRELATION_ID: &str = "proof-correlation";
const PROOF_COMMAND: &str = "build complete software proof";
const DEFAULT_GATE_RUNTIME_BANNER: &str = "runtime_banner";
const DEFAULT_GATE_CARGO_FMT_CHECK: &str = "cargo_fmt_check";
const DEFAULT_GATE_CARGO_TEST: &str = "cargo_test";
const IRONLOOM_PROGRAM: &str = "ironloom";
const CARGO_PROGRAM: &str = "cargo";
const CARGO_FMT_SUBCOMMAND: &str = "fmt";
const CARGO_TEST_SUBCOMMAND: &str = "test";
const CARGO_CHECK_FLAG: &str = "--check";
const CARGO_WORKSPACE_FLAG: &str = "--workspace";
const CARGO_ALL_FEATURES_FLAG: &str = "--all-features";
const PROOF_INDEX_FILE: &str = "index.html";
const PROOF_STYLE_FILE: &str = "style.css";
const PROOF_SCRIPT_FILE: &str = "app.js";
const PROOF_README_FILE: &str = "README.md";
const PROOF_MANIFEST_FILE: &str = "ironloom-proof.json";
const SETUP_PAGE_STYLE: &str = r#"
:root {
  color-scheme: light dark;
  --page-bg: #f5f1e9;
  --surface: #fffaf2;
  --surface-strong: #ffffff;
  --text: #17130f;
  --muted: #655f57;
  --subtle: #857b70;
  --line: #ded4c6;
  --accent: #d63b16;
  --accent-strong: #a82910;
  --accent-soft: #fff0e4;
  --code-bg: #201914;
  --code-text: #fff4e7;
  --ok-bg: #eaf7ef;
  --ok-text: #126535;
  --shadow: 0 24px 70px rgb(87 64 33 / 16%);
}

@media (prefers-color-scheme: dark) {
  :root {
    --page-bg: #080a0d;
    --surface: #11151b;
    --surface-strong: #171c23;
    --text: #f8f4ee;
    --muted: #b9b0a5;
    --subtle: #8f877d;
    --line: #2b333d;
    --accent: #ff7a18;
    --accent-strong: #ff9b42;
    --accent-soft: #2d1b10;
    --code-bg: #050607;
    --code-text: #ffe7c7;
    --ok-bg: #13281c;
    --ok-text: #8ce2a7;
    --shadow: 0 30px 80px rgb(0 0 0 / 40%);
  }
}

* {
  box-sizing: border-box;
}

body {
  min-height: 100vh;
  margin: 0;
  color: var(--text);
  background:
    radial-gradient(circle at top left, var(--accent-soft), transparent 28rem),
    linear-gradient(135deg, var(--page-bg), var(--surface));
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  line-height: 1.5;
}

.setup-shell {
  min-height: 100vh;
  display: grid;
  align-items: center;
  padding: clamp(1rem, 3vw, 3rem);
}

.setup-page {
  width: min(58rem, 100%);
  margin: 0 auto;
  padding: clamp(1.25rem, 3vw, 2.5rem);
  border: 1px solid var(--line);
  border-radius: 14px;
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  box-shadow: var(--shadow);
}

.setup-page--notice {
  width: min(46rem, 100%);
}

.setup-header {
  max-width: 44rem;
  margin-bottom: 1.5rem;
}

.eyebrow {
  margin: 0 0 0.5rem;
  color: var(--accent);
  font-size: 0.78rem;
  font-weight: 800;
  text-transform: uppercase;
}

h1,
h2,
p {
  margin-top: 0;
}

h1 {
  margin-bottom: 0.75rem;
  font-size: clamp(2rem, 5vw, 3.8rem);
  line-height: 0.95;
}

h2 {
  margin-bottom: 0.4rem;
  font-size: 1rem;
}

.lede,
.section-copy,
.field-note {
  color: var(--muted);
}

.setup-form,
.instruction-list {
  display: grid;
  gap: 1rem;
}

.form-section,
.instruction-list {
  padding: 1rem;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface-strong);
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr));
  gap: 0.85rem;
}

.field {
  display: grid;
  gap: 0.45rem;
  min-width: 0;
  padding: 0.85rem;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
}

.field--locked {
  background: var(--ok-bg);
}

.field-row,
.action-grid {
  display: flex;
  gap: 0.75rem;
}

.field-row {
  align-items: center;
  justify-content: space-between;
}

.field-label,
legend {
  font-weight: 750;
}

.status-pill {
  flex: none;
  border-radius: 999px;
  padding: 0.15rem 0.5rem;
  color: var(--ok-text);
  background: color-mix(in srgb, var(--ok-bg) 70%, var(--surface));
  font-size: 0.75rem;
  font-weight: 750;
}

input:not([type="radio"]) {
  width: 100%;
  min-height: 2.75rem;
  border: 1px solid var(--line);
  border-radius: 7px;
  padding: 0.75rem 0.85rem;
  color: var(--text);
  background: var(--surface-strong);
  font: inherit;
}

input:focus-visible,
button:focus-visible,
a:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--accent) 45%, transparent);
  outline-offset: 2px;
}

.action-grid {
  flex-wrap: wrap;
}

.action-panel {
  display: grid;
  align-content: start;
  gap: 0.75rem;
  flex: 1 1 18rem;
  min-width: min(100%, 18rem);
  margin: 0;
  padding: 1rem;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface-strong);
}

.action-panel p,
.action-panel h2 {
  margin-bottom: 0;
}

.option-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
  gap: 0.6rem;
}

.option-choice {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.65rem;
  align-items: start;
  min-width: 0;
  padding: 0.75rem;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  cursor: pointer;
}

.option-choice:has(input:checked) {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent-soft) 55%, var(--surface));
}

.option-choice input[type="radio"] {
  width: 1rem;
  height: 1rem;
  margin: 0.2rem 0 0;
  accent-color: var(--accent);
}

.option-title {
  display: block;
  font-weight: 750;
}

.option-copy {
  display: block;
  color: var(--muted);
  font-size: 0.85rem;
}

button {
  min-height: 2.75rem;
  border: 0;
  border-radius: 8px;
  padding: 0.75rem 1rem;
  color: #ffffff;
  background: var(--accent);
  font: inherit;
  font-weight: 800;
  cursor: pointer;
}

button:hover {
  background: var(--accent-strong);
}

.form-actions {
  display: flex;
  justify-content: flex-end;
}

.primary-action {
  min-width: 11rem;
}

pre {
  overflow-x: auto;
  border-radius: 8px;
  padding: 0.85rem 1rem;
  color: var(--code-text);
  background: var(--code-bg);
}

a {
  color: var(--accent-strong);
  overflow-wrap: anywhere;
}
"#;

/// Runtime harness for the fake Discord first vertical slice.
#[derive(Debug)]
pub struct RuntimeHarness {
    bindings: ThreadBindingRegistry,
    transport: FakeDiscordTransport,
    store: FilesystemStore,
    gate_executor: CountingGateExecutor,
}

impl RuntimeHarness {
    /// Creates a local runtime harness rooted at a temporary repository path.
    pub fn new(
        root: impl AsRef<Path>,
        bindings: ThreadBindingRegistry,
        transport: FakeDiscordTransport,
    ) -> Result<Self, RuntimeError> {
        Ok(Self {
            bindings,
            transport,
            store: FilesystemStore::new(root)?,
            gate_executor: CountingGateExecutor::default(),
        })
    }

    /// Returns the number of gate executions attempted by the harness.
    #[must_use]
    pub fn gates_run(&self) -> usize {
        self.gate_executor.runs.get()
    }
}

/// Output from the fake first vertical slice.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SliceOutput {
    /// Thread that received the Discord response.
    pub response_thread_id: ThreadId,
    /// Process node selected by the supervisor graph.
    pub selected_process_node: String,
    /// Persisted artifact identifiers.
    pub persisted_artifact_ids: Vec<String>,
}

/// Output from generating the deterministic complete-software proof project.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProofProjectOutput {
    /// Directory containing the generated proof project.
    pub project_dir: PathBuf,
    /// Generated HTML entrypoint path.
    pub index_path: PathBuf,
    /// Generated proof manifest path.
    pub manifest_path: PathBuf,
    /// Process node selected by the supervisor graph.
    pub selected_process_node: String,
    /// Persisted artifact identifiers.
    pub persisted_artifact_ids: Vec<String>,
}

/// Runtime errors surfaced by the local harness.
#[derive(Debug, Error)]
pub enum RuntimeError {
    /// Discord command could not resolve exactly one work item.
    #[error(transparent)]
    Discord(#[from] DiscordError),
    /// Storage failed.
    #[error(transparent)]
    Storage(#[from] StorageError),
    /// Supervisor failed.
    #[error(transparent)]
    Supervisor(#[from] SupervisorError),
    /// Domain validation failed while constructing the proof command.
    #[error(transparent)]
    Domain(#[from] ironloom_core::IronloomError),
    /// Proof project filesystem operation failed.
    #[error("proof project I/O failed: {0}")]
    Io(#[from] std::io::Error),
    /// Proof project manifest serialization failed.
    #[error("proof project serialization failed: {0}")]
    Serialization(#[from] serde_json::Error),
    /// Supervisor completed without a Discord response.
    #[error("runtime completed without posting a Discord response")]
    MissingResponse,
}

/// Runtime HTTP request context.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RuntimeHttpContext {
    environment: RuntimeConfigInputs,
    setup_gate: RuntimeSetupGate,
    stored_setup: Option<StoredSetupConfig>,
}

impl RuntimeHttpContext {
    /// Builds a runtime HTTP request context.
    #[must_use]
    pub fn new(
        environment: RuntimeConfigInputs,
        setup_environment: Option<SetupEnvironment>,
        stored_setup: Option<StoredSetupConfig>,
    ) -> Self {
        let setup_gate = setup_environment.map_or(RuntimeSetupGate::MissingConfigKey, |value| {
            RuntimeSetupGate::Available(value)
        });
        Self {
            environment,
            setup_gate,
            stored_setup,
        }
    }

    /// Builds a runtime HTTP request context when the installer token is missing.
    #[must_use]
    pub fn missing_installer_token(
        environment: RuntimeConfigInputs,
        stored_setup: Option<StoredSetupConfig>,
    ) -> Self {
        Self {
            environment,
            setup_gate: RuntimeSetupGate::MissingInstallerToken,
            stored_setup,
        }
    }

    fn is_ready(&self) -> bool {
        self.resolved_config().is_ok()
    }

    /// Resolves the runtime configuration using environment values before stored setup.
    pub fn resolved_config(&self) -> Result<RuntimeConfig, ConfigError> {
        RuntimeConfig::resolve(self.environment.clone(), self.stored_setup.as_ref())
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
enum RuntimeSetupGate {
    MissingConfigKey,
    MissingInstallerToken,
    Available(SetupEnvironment),
}

/// Runtime HTTP response returned by the request dispatcher.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RuntimeHttpResponse {
    /// HTTP status code.
    pub status_code: u16,
    /// HTTP content type.
    pub content_type: &'static str,
    /// HTTP response body.
    pub body: String,
}

/// Summary produced by probing externally backed runtime adapters.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RuntimeExternalProbeSummary {
    /// Repository projection read directly from GitHub.
    pub github_repository: RepositoryProjection,
    /// Pull request projection read directly from GitHub when requested.
    pub github_pull_request: Option<PullRequestProjection>,
    /// Check runs read directly from GitHub when requested.
    pub github_check_runs: Vec<CheckRunProjection>,
    /// Current SonarCloud quality gate status.
    pub quality_gate_status: QualityGateStatus,
    /// Current unresolved SonarCloud issues.
    pub open_sonarcloud_issues: Vec<SonarCloudIssue>,
}

/// Optional live reads included in the runtime external adapter probe.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct RuntimeExternalProbeOptions {
    /// Pull request number to read from GitHub.
    pub pull_request_number: Option<u64>,
    /// Branch, tag, or commit SHA whose GitHub check runs should be read.
    pub check_ref: Option<String>,
}

/// Runtime external adapter probe errors.
#[derive(Debug, Error)]
pub enum RuntimeExternalProbeError {
    /// GitHub API probing failed.
    #[error(transparent)]
    GitHub(#[from] GitHubApiError),
    /// SonarCloud API probing failed.
    #[error(transparent)]
    SonarCloud(#[from] SonarCloudError),
}

/// Probes live adapter clients using the resolved runtime configuration.
pub fn probe_runtime_external_services<GitHub, SonarCloud>(
    config: &RuntimeConfig,
    repository: &RepositorySlug,
    github_transport: GitHub,
    sonarcloud_transport: SonarCloud,
) -> Result<RuntimeExternalProbeSummary, RuntimeExternalProbeError>
where
    GitHub: GitHubTransport,
    SonarCloud: SonarCloudTransport,
{
    probe_runtime_external_services_with_options(
        config,
        repository,
        github_transport,
        sonarcloud_transport,
        RuntimeExternalProbeOptions::default(),
    )
}

/// Probes live adapter clients with optional pull request and check-run reads.
pub fn probe_runtime_external_services_with_options<GitHub, SonarCloud>(
    config: &RuntimeConfig,
    repository: &RepositorySlug,
    github_transport: GitHub,
    sonarcloud_transport: SonarCloud,
    options: RuntimeExternalProbeOptions,
) -> Result<RuntimeExternalProbeSummary, RuntimeExternalProbeError>
where
    GitHub: GitHubTransport,
    SonarCloud: SonarCloudTransport,
{
    let github = GitHubApiClient::new(config.github_token_ref.clone(), github_transport);
    let sonarcloud = SonarCloudClient::new(
        config.sonarcloud_token_ref.clone(),
        config.sonarcloud_organization.clone(),
        config.sonarcloud_project_key.clone(),
        sonarcloud_transport,
    );
    let github_repository = github.read_repository(repository)?;
    let github_pull_request = match options.pull_request_number {
        Some(number) => Some(github.read_pull_request(repository, number)?),
        None => None,
    };
    let github_check_runs = match options.check_ref {
        Some(git_ref) => github.list_check_runs_for_ref(repository, &git_ref)?,
        None => Vec::new(),
    };
    Ok(RuntimeExternalProbeSummary {
        github_repository,
        github_pull_request,
        github_check_runs,
        quality_gate_status: sonarcloud.poll_quality_gate()?,
        open_sonarcloud_issues: sonarcloud.search_open_issues()?,
    })
}

/// Handles a runtime HTTP request string.
#[must_use]
pub fn handle_runtime_http_request(
    context: &RuntimeHttpContext,
    request: &str,
) -> RuntimeHttpResponse {
    let Some((method, path)) = parse_request_line(request) else {
        return text_response(400, "bad request");
    };
    match (method, path) {
        ("GET", "/healthz") => text_response(200, "ok"),
        ("GET", "/readyz") if context.is_ready() => text_response(200, "ok"),
        ("GET", "/readyz") => text_response(503, "setup required"),
        ("POST", "/discord/interactions") => handle_discord_interaction_post(context, request),
        ("GET", "/" | "/setup") => html_response(200, setup_page_for_context(context)),
        _ => text_response(404, "not found"),
    }
}

/// Handles a runtime HTTP request string with encrypted setup storage enabled.
#[must_use]
pub fn handle_runtime_http_request_with_store(
    context: &RuntimeHttpContext,
    store: &SetupConfigStore,
    request: &str,
) -> RuntimeHttpResponse {
    let Some((method, path)) = parse_request_line(request) else {
        return text_response(400, "bad request");
    };
    if matches!((method, path), ("POST", "/setup")) {
        return handle_setup_post(context, store, request);
    }
    if matches!((method, path), ("POST", "/setup/openai/oauth/start")) {
        return handle_openai_oauth_start(context);
    }
    if matches!((method, path), ("POST", "/setup/discord/oauth/start")) {
        return handle_discord_oauth_start(context, request);
    }
    handle_runtime_http_request(context, request)
}

/// Handles a runtime HTTP request with setup storage and live work services enabled.
#[must_use]
pub fn handle_runtime_http_request_with_services<Executor>(
    context: &RuntimeHttpContext,
    setup_store: &SetupConfigStore,
    work_store: &FilesystemStore,
    gate_executor: &Executor,
    request: &str,
) -> RuntimeHttpResponse
where
    Executor: GateExecutor,
{
    let Some((method, path)) = parse_request_line(request) else {
        return text_response(400, "bad request");
    };
    if matches!((method, path), ("POST", "/discord/interactions")) {
        return handle_discord_interaction_post_with_work(
            context,
            work_store,
            gate_executor,
            request,
        );
    }
    handle_runtime_http_request_with_store(context, setup_store, request)
}

/// Setup page state rendered by the runtime HTTP surface.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SetupPageModel {
    /// Setup cannot proceed until `IRONLOOM_CONFIG_KEY` is configured.
    MissingConfigKey,
    /// Setup cannot proceed until `IRONLOOM_INSTALLER_TOKEN` is configured.
    MissingInstallerToken,
    /// Runtime config is incomplete and setup inputs can be accepted.
    ConfigForm { fields: Vec<SetupFieldModel> },
}

impl SetupPageModel {
    /// Builds the setup page model for a missing config key.
    #[must_use]
    pub fn missing_config_key() -> Self {
        Self::MissingConfigKey
    }

    /// Builds the setup page model from current environment and stored setup values.
    #[must_use]
    pub fn from_config_state(
        environment: &RuntimeConfigInputs,
        setup_environment: Option<&SetupEnvironment>,
        stored: Option<&StoredSetupConfig>,
    ) -> Self {
        if setup_environment.is_none() {
            return Self::MissingInstallerToken;
        }
        Self::ConfigForm {
            fields: setup_fields(environment, stored),
        }
    }

    /// Renders the setup page as static HTML.
    #[must_use]
    pub fn render_html(&self) -> String {
        match self {
            Self::MissingConfigKey => missing_config_key_html(),
            Self::MissingInstallerToken => missing_installer_token_html(),
            Self::ConfigForm { fields } => config_form_html(fields),
        }
    }
}

/// Setup form field rendered by the runtime setup page.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SetupFieldModel {
    /// Stored setup field name.
    pub name: &'static str,
    /// Human-facing field label.
    pub label: &'static str,
    /// Field source.
    pub source: SetupFieldSource,
}

/// Source for a setup form field.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SetupFieldSource {
    /// Value is provided by environment and must not be edited or displayed.
    Environment,
    /// Value is available in encrypted local setup storage.
    Stored,
    /// Value is missing and must be supplied.
    Missing,
}

/// Parsed setup form submission.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct SetupFormSubmission {
    values: Vec<(String, String)>,
}

impl SetupFormSubmission {
    /// Builds a setup form submission from key-value pairs.
    pub fn from_pairs<'a>(pairs: impl IntoIterator<Item = (&'a str, &'a str)>) -> Self {
        Self {
            values: pairs
                .into_iter()
                .map(|(name, value)| (name.to_owned(), value.to_owned()))
                .collect(),
        }
    }

    fn value(&self, name: &str) -> Option<String> {
        self.values
            .iter()
            .find(|(candidate, _)| candidate == name)
            .map(|(_, value)| value.trim().to_owned())
            .filter(|value| !value.is_empty())
    }
}

/// Error returned when a setup form cannot be accepted.
#[derive(Debug, Error, Eq, PartialEq)]
pub enum SetupSubmissionError {
    /// Submitted installer token did not match the configured token.
    #[error("invalid installer token")]
    InvalidInstallerToken,
    /// Submitted OpenAI authentication method was not recognized.
    #[error("invalid OpenAI authentication method")]
    InvalidOpenAiAuthMethod,
}

/// Converts an authenticated setup form submission into encrypted setup state.
pub fn submit_setup_form(
    setup_environment: &SetupEnvironment,
    submission: &SetupFormSubmission,
) -> Result<StoredSetupConfig, SetupSubmissionError> {
    let installer_token = submission
        .value(FIELD_INSTALLER_TOKEN)
        .ok_or(SetupSubmissionError::InvalidInstallerToken)?;
    if installer_token != setup_environment.installer_token {
        return Err(SetupSubmissionError::InvalidInstallerToken);
    }
    let auth_method = submission
        .value(FIELD_OPENAI_AUTH_METHOD)
        .unwrap_or_else(|| OPENAI_AUTH_METHOD_API_KEY.to_owned());
    let mut config = StoredSetupConfig {
        runtime_url: submission.value(FIELD_RUNTIME_URL),
        discord_application_id: submission.value(FIELD_DISCORD_APPLICATION_ID),
        discord_token_ref: submission.value(FIELD_DISCORD_TOKEN_REF),
        discord_public_key_ref: submission.value(FIELD_DISCORD_PUBLIC_KEY_REF),
        github_token_ref: submission.value(FIELD_GITHUB_TOKEN_REF),
        sonarcloud_token_ref: submission.value(FIELD_SONARCLOUD_TOKEN_REF),
        sonarcloud_organization: submission.value(FIELD_SONARCLOUD_ORGANIZATION),
        sonarcloud_project_key: submission.value(FIELD_SONARCLOUD_PROJECT_KEY),
        openai_api_key_ref: None,
        openai_oauth_session_ref: None,
    };
    match auth_method.as_str() {
        OPENAI_AUTH_METHOD_API_KEY => {
            config.openai_api_key_ref = submission.value(FIELD_OPENAI_API_KEY_REF);
        }
        OPENAI_AUTH_METHOD_CHATGPT_OAUTH => {
            config.openai_oauth_session_ref = submission.value(FIELD_OPENAI_OAUTH_SESSION_REF);
        }
        _ => return Err(SetupSubmissionError::InvalidOpenAiAuthMethod),
    }
    Ok(config)
}

/// Runs the fake Discord command through the first Rust vertical slice.
pub fn run_fake_discord_gate_slice(
    harness: &mut RuntimeHarness,
    command: DiscordCommand,
) -> Result<SliceOutput, RuntimeError> {
    let work_item_id = harness.bindings.resolve(&command.thread_id)?;
    let supervisor_output = run_gate_work(
        &SupervisorInput {
            work_item_id,
            thread_id: command.thread_id.clone(),
            actor_id: command.actor_id,
            correlation_id: command.correlation_id,
            command: command.command,
        },
        &harness.store,
        &harness.gate_executor,
    )?;
    harness.transport.post_response(
        command.thread_id,
        format!(
            "Gate completed through {}",
            supervisor_output.selected_process_node
        ),
    );
    let response = harness
        .transport
        .last_response()
        .ok_or(RuntimeError::MissingResponse)?;
    Ok(SliceOutput {
        response_thread_id: response.thread_id.clone(),
        selected_process_node: supervisor_output.selected_process_node,
        persisted_artifact_ids: supervisor_output.persisted_artifact_ids,
    })
}

/// Runs a deterministic proof through the supervisor and writes a complete static app.
pub fn run_complete_software_proof(
    runtime_root: impl AsRef<Path>,
    project_dir: impl AsRef<Path>,
) -> Result<ProofProjectOutput, RuntimeError> {
    let project_dir = project_dir.as_ref().to_path_buf();
    let mut bindings = ThreadBindingRegistry::new();
    bindings.bind(
        ThreadId::new(PROOF_THREAD_ID)?,
        ironloom_core::WorkItemId::new(PROOF_WORK_ITEM_ID)?,
    )?;
    let mut harness = RuntimeHarness::new(
        runtime_root.as_ref(),
        bindings,
        FakeDiscordTransport::default(),
    )?;
    let slice_output = run_fake_discord_gate_slice(
        &mut harness,
        DiscordCommand {
            thread_id: ThreadId::new(PROOF_THREAD_ID)?,
            actor_id: ironloom_core::ActorId::new(PROOF_ACTOR_ID)?,
            correlation_id: ironloom_core::CorrelationId::new(PROOF_CORRELATION_ID)?,
            command: PROOF_COMMAND.to_owned(),
        },
    )?;

    fs::create_dir_all(&project_dir)?;
    write_proof_file(&project_dir, PROOF_INDEX_FILE, proof_index_html())?;
    write_proof_file(&project_dir, PROOF_STYLE_FILE, proof_style_css())?;
    write_proof_file(&project_dir, PROOF_SCRIPT_FILE, proof_app_js())?;
    write_proof_file(&project_dir, PROOF_README_FILE, proof_readme_md())?;
    let manifest_path = project_dir.join(PROOF_MANIFEST_FILE);
    let manifest = serde_json::json!({
        "kind": "complete_software",
        "name": "Ironloom Proof App",
        "selected_process_node": slice_output.selected_process_node.clone(),
        "persisted_artifact_ids": slice_output.persisted_artifact_ids.clone(),
        "entrypoint": PROOF_INDEX_FILE,
    });
    fs::write(&manifest_path, serde_json::to_vec_pretty(&manifest)?)?;

    Ok(ProofProjectOutput {
        index_path: project_dir.join(PROOF_INDEX_FILE),
        manifest_path,
        project_dir,
        selected_process_node: slice_output.selected_process_node,
        persisted_artifact_ids: slice_output.persisted_artifact_ids,
    })
}

/// Runs the minimal runtime health server.
pub fn run_health_server(bind_addr: &str) -> std::io::Result<()> {
    let listener = TcpListener::bind(bind_addr)?;
    for stream in listener.incoming() {
        respond_to_runtime_request(stream?)?;
    }
    Ok(())
}

fn respond_to_runtime_request(mut stream: TcpStream) -> std::io::Result<()> {
    let mut buffer = [0_u8; HTTP_READ_BUFFER_BYTES];
    let bytes_read = stream.read(&mut buffer)?;
    let request = String::from_utf8_lossy(&buffer[..bytes_read]);
    let (context, store) = runtime_context_from_environment();
    let work_root = work_store_root_from_context(&context)?;
    let work_store = FilesystemStore::new(&work_root).map_err(std::io::Error::other)?;
    let gate_executor = default_command_gate_executor(&work_root);
    let response = handle_runtime_http_request_with_services(
        &context,
        &store,
        &work_store,
        &gate_executor,
        &request,
    );
    stream.write_all(encode_http_response(&response).as_bytes())?;
    stream.flush()
}

fn runtime_context_from_environment() -> (RuntimeHttpContext, SetupConfigStore) {
    let environment = RuntimeConfigInputs::from_environment();
    let state_root = environment
        .state_root()
        .unwrap_or_else(|| PathBuf::from(DEFAULT_STATE_ROOT));
    let store = SetupConfigStore::new(&state_root);
    match SetupEnvironment::from_environment() {
        Ok(setup_environment) => {
            let stored_setup = store.read(&setup_environment.config_key).ok().flatten();
            (
                RuntimeHttpContext::new(environment, Some(setup_environment), stored_setup),
                store,
            )
        }
        Err(error) if is_missing_config_key(&error) => {
            (RuntimeHttpContext::new(environment, None, None), store)
        }
        Err(_) => (
            RuntimeHttpContext::missing_installer_token(environment, None),
            store,
        ),
    }
}

fn is_missing_config_key(error: &ConfigError) -> bool {
    matches!(
        error,
        ConfigError::MissingEnvironment {
            name: IRONLOOM_CONFIG_KEY_ENV
        } | ConfigError::EmptySecretRef {
            field: FIELD_CONFIG_KEY
        } | ConfigError::InvalidConfigKey
    )
}

fn encode_http_response(response: &RuntimeHttpResponse) -> String {
    format!(
        "HTTP/1.1 {} {}\r\ncontent-type: {}\r\ncontent-length: {}\r\n\r\n{}",
        response.status_code,
        status_text(response.status_code),
        response.content_type,
        response.body.len(),
        response.body
    )
}

fn status_text(status_code: u16) -> &'static str {
    match status_code {
        200 => "OK",
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        404 => "Not Found",
        500 => "Internal Server Error",
        503 => "Service Unavailable",
        _ => "OK",
    }
}

fn parse_request_line(request: &str) -> Option<(&str, &str)> {
    let mut parts = request.lines().next()?.split_whitespace();
    let method = parts.next()?;
    let path = parts.next()?;
    Some((method, path))
}

fn handle_discord_interaction_post(
    context: &RuntimeHttpContext,
    request: &str,
) -> RuntimeHttpResponse {
    let Ok(config) = context.resolved_config() else {
        return text_response(503, "setup required");
    };
    let Some(signature) = request_header(request, "x-signature-ed25519") else {
        return text_response(400, "missing Discord signature");
    };
    let Some(timestamp) = request_header(request, "x-signature-timestamp") else {
        return text_response(400, "missing Discord signature timestamp");
    };
    let interaction = DiscordInteractionRequest {
        public_key: config.discord_public_key_ref,
        signature: signature.to_owned(),
        timestamp: timestamp.to_owned(),
        body: request_body(request).to_owned(),
    };
    match handle_discord_interaction(&interaction) {
        Ok(response) => json_response(response.status, response.body),
        Err(DiscordError::InvalidInteractionSignature | DiscordError::InvalidSignatureEncoding) => {
            text_response(401, "invalid Discord interaction signature")
        }
        Err(error) => text_response(400, &error.to_string()),
    }
}

fn handle_discord_interaction_post_with_work<Executor>(
    context: &RuntimeHttpContext,
    work_store: &FilesystemStore,
    gate_executor: &Executor,
    request: &str,
) -> RuntimeHttpResponse
where
    Executor: GateExecutor,
{
    let Ok(config) = context.resolved_config() else {
        return text_response(503, "setup required");
    };
    let Some(signature) = request_header(request, "x-signature-ed25519") else {
        return text_response(400, "missing Discord signature");
    };
    let Some(timestamp) = request_header(request, "x-signature-timestamp") else {
        return text_response(400, "missing Discord signature timestamp");
    };
    let body = request_body(request);
    let interaction = DiscordInteractionRequest {
        public_key: config.discord_public_key_ref,
        signature: signature.to_owned(),
        timestamp: timestamp.to_owned(),
        body: body.to_owned(),
    };
    if let Err(error) = ironloom_discord::verify_discord_interaction(&interaction) {
        return match error {
            DiscordError::InvalidInteractionSignature | DiscordError::InvalidSignatureEncoding => {
                text_response(401, "invalid Discord interaction signature")
            }
            _ => text_response(400, &error.to_string()),
        };
    }
    let Ok(payload) = serde_json::from_str::<serde_json::Value>(body) else {
        return text_response(400, "invalid Discord interaction JSON");
    };
    let interaction_type = payload
        .get("type")
        .and_then(serde_json::Value::as_u64)
        .unwrap_or_default();
    if interaction_type != DISCORD_APPLICATION_COMMAND_INTERACTION_TYPE {
        return handle_discord_interaction_post(context, request);
    }
    let command = match discord_command_from_application_interaction(&payload) {
        Ok(command) => command,
        Err(reason) => return discord_channel_message_response(reason),
    };
    let work_item_id = match work_store.resolve_thread_binding(&command.thread_id) {
        Ok(work_item_id) => work_item_id,
        Err(error) => {
            return discord_channel_message_response(thread_binding_error_message(&error));
        }
    };
    match run_gate_work(
        &SupervisorInput {
            work_item_id,
            thread_id: command.thread_id,
            actor_id: command.actor_id,
            correlation_id: command.correlation_id,
            command: command.command,
        },
        work_store,
        gate_executor,
    ) {
        Ok(output) => discord_channel_message_response(format!(
            "Gate completed through {}",
            output.selected_process_node
        )),
        Err(error) => discord_channel_message_response(format!("Gate failed: {error}")),
    }
}

fn discord_command_from_application_interaction(
    payload: &serde_json::Value,
) -> Result<DiscordCommand, String> {
    let thread_id = required_json_str(payload, "channel_id")?;
    let actor_id = payload
        .pointer("/member/user/id")
        .or_else(|| payload.pointer("/user/id"))
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| "Discord interaction is missing actor id".to_owned())?;
    let correlation_id = required_json_str(payload, "id")?;
    let command = payload
        .pointer("/data/name")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| "Discord interaction is missing command name".to_owned())?;
    Ok(DiscordCommand {
        thread_id: ThreadId::new(thread_id).map_err(|error| error.to_string())?,
        actor_id: ActorId::new(actor_id).map_err(|error| error.to_string())?,
        correlation_id: CorrelationId::new(correlation_id).map_err(|error| error.to_string())?,
        command: command.to_owned(),
    })
}

fn required_json_str<'a>(payload: &'a serde_json::Value, field: &str) -> Result<&'a str, String> {
    payload
        .get(field)
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| format!("Discord interaction is missing {field}"))
}

fn thread_binding_error_message(error: &ThreadBindingError) -> String {
    match error {
        ThreadBindingError::Missing { .. } => "Missing thread binding".to_owned(),
        ThreadBindingError::Ambiguous { .. } => "Ambiguous thread binding".to_owned(),
        ThreadBindingError::Invalid { .. } | ThreadBindingError::Storage(_) => error.to_string(),
    }
}

fn discord_channel_message_response(content: impl Into<String>) -> RuntimeHttpResponse {
    json_response(
        200,
        serde_json::json!({
            "type": DISCORD_CHANNEL_MESSAGE_RESPONSE_TYPE,
            "data": {
                "content": content.into()
            }
        })
        .to_string(),
    )
}

fn request_header<'a>(request: &'a str, expected_name: &str) -> Option<&'a str> {
    request
        .split("\r\n\r\n")
        .next()?
        .lines()
        .skip(1)
        .find_map(|line| {
            let (name, value) = line.split_once(':')?;
            if name.trim().eq_ignore_ascii_case(expected_name) {
                Some(value.trim())
            } else {
                None
            }
        })
}

fn request_body(request: &str) -> &str {
    request.split("\r\n\r\n").nth(1).unwrap_or_default()
}

fn handle_setup_post(
    context: &RuntimeHttpContext,
    store: &SetupConfigStore,
    request: &str,
) -> RuntimeHttpResponse {
    let RuntimeSetupGate::Available(setup_environment) = &context.setup_gate else {
        return text_response(403, "setup prerequisites required");
    };
    let submission = parse_form_submission(request);
    let Ok(config) = submit_setup_form(setup_environment, &submission) else {
        return text_response(403, "setup rejected");
    };
    if store.write(&setup_environment.config_key, &config).is_err() {
        return text_response(500, "setup save failed");
    }
    text_response(200, "setup saved")
}

fn handle_openai_oauth_start(context: &RuntimeHttpContext) -> RuntimeHttpResponse {
    if !matches!(context.setup_gate, RuntimeSetupGate::Available(_)) {
        return text_response(403, "setup prerequisites required");
    }
    html_response(200, openai_oauth_start_html())
}

fn handle_discord_oauth_start(context: &RuntimeHttpContext, request: &str) -> RuntimeHttpResponse {
    if !matches!(context.setup_gate, RuntimeSetupGate::Available(_)) {
        return text_response(403, "setup prerequisites required");
    }
    let submission = parse_form_submission(request);
    let Some(application_id) = discord_application_id_for_authorization(context, &submission)
    else {
        return text_response(400, "discord application id required");
    };
    html_response(200, discord_oauth_start_html(&application_id))
}

fn parse_form_submission(request: &str) -> SetupFormSubmission {
    let body = request.split("\r\n\r\n").nth(1).unwrap_or_default();
    let values = url::form_urlencoded::parse(body.as_bytes())
        .map(|(name, value)| (name.into_owned(), value.into_owned()))
        .collect();
    SetupFormSubmission { values }
}

fn setup_page_for_context(context: &RuntimeHttpContext) -> String {
    let model = match &context.setup_gate {
        RuntimeSetupGate::MissingConfigKey => SetupPageModel::missing_config_key(),
        RuntimeSetupGate::MissingInstallerToken => SetupPageModel::MissingInstallerToken,
        RuntimeSetupGate::Available(setup_environment) => SetupPageModel::from_config_state(
            &context.environment,
            Some(setup_environment),
            context.stored_setup.as_ref(),
        ),
    };
    model.render_html()
}

fn text_response(status_code: u16, body: &str) -> RuntimeHttpResponse {
    RuntimeHttpResponse {
        status_code,
        content_type: "text/plain",
        body: body.to_owned(),
    }
}

fn json_response(status_code: u16, body: String) -> RuntimeHttpResponse {
    RuntimeHttpResponse {
        status_code,
        content_type: "application/json",
        body,
    }
}

fn work_store_root_from_context(context: &RuntimeHttpContext) -> std::io::Result<PathBuf> {
    if let Ok(config) = context.resolved_config() {
        if config
            .state_root
            .file_name()
            .is_some_and(|name| name == ".ironloom")
        {
            return Ok(config
                .state_root
                .parent()
                .map(Path::to_path_buf)
                .unwrap_or(config.state_root));
        }
        return Ok(config.state_root);
    }
    std::env::current_dir()
}

fn default_command_gate_executor(working_dir: &Path) -> CommandGateExecutor {
    let mut executor = CommandGateExecutor::new(working_dir);
    executor.allow_command(GateCommand::new(
        DEFAULT_GATE_RUNTIME_BANNER,
        IRONLOOM_PROGRAM,
    ));
    executor.allow_command(
        GateCommand::new(DEFAULT_GATE_CARGO_FMT_CHECK, CARGO_PROGRAM)
            .args([CARGO_FMT_SUBCOMMAND, CARGO_CHECK_FLAG]),
    );
    executor.allow_command(
        GateCommand::new(DEFAULT_GATE_CARGO_TEST, CARGO_PROGRAM).args([
            CARGO_TEST_SUBCOMMAND,
            CARGO_WORKSPACE_FLAG,
            CARGO_ALL_FEATURES_FLAG,
        ]),
    );
    executor
}

fn html_response(status_code: u16, body: String) -> RuntimeHttpResponse {
    RuntimeHttpResponse {
        status_code,
        content_type: "text/html; charset=utf-8",
        body,
    }
}

fn setup_fields(
    environment: &RuntimeConfigInputs,
    stored: Option<&StoredSetupConfig>,
) -> Vec<SetupFieldModel> {
    vec![
        field_model(
            FIELD_RUNTIME_URL,
            "Public URL",
            environment.has_non_empty(IRONLOOM_PUBLIC_URL_ENV),
            stored
                .and_then(|setup| setup.runtime_url.as_ref())
                .is_some(),
        ),
        field_model(
            FIELD_DISCORD_APPLICATION_ID,
            "Discord application ID",
            environment.has_non_empty(IRONLOOM_DISCORD_APPLICATION_ID_ENV),
            stored
                .and_then(|setup| setup.discord_application_id.as_ref())
                .is_some(),
        ),
        field_model(
            FIELD_DISCORD_TOKEN_REF,
            "Discord token",
            environment.has_non_empty(IRONLOOM_DISCORD_TOKEN_ENV),
            stored
                .and_then(|setup| setup.discord_token_ref.as_ref())
                .is_some(),
        ),
        field_model(
            FIELD_DISCORD_PUBLIC_KEY_REF,
            "Discord public key",
            environment.has_non_empty(IRONLOOM_DISCORD_PUBLIC_KEY_ENV),
            stored
                .and_then(|setup| setup.discord_public_key_ref.as_ref())
                .is_some(),
        ),
        field_model(
            FIELD_GITHUB_TOKEN_REF,
            "GitHub token",
            environment.has_non_empty(IRONLOOM_GITHUB_TOKEN_ENV),
            stored
                .and_then(|setup| setup.github_token_ref.as_ref())
                .is_some(),
        ),
        field_model(
            FIELD_SONARCLOUD_TOKEN_REF,
            "SonarCloud token",
            environment.has_non_empty(IRONLOOM_SONARCLOUD_TOKEN_ENV),
            stored
                .and_then(|setup| setup.sonarcloud_token_ref.as_ref())
                .is_some(),
        ),
        field_model(
            FIELD_SONARCLOUD_ORGANIZATION,
            "SonarCloud organization",
            environment.has_non_empty(IRONLOOM_SONARCLOUD_ORGANIZATION_ENV),
            stored
                .and_then(|setup| setup.sonarcloud_organization.as_ref())
                .is_some(),
        ),
        field_model(
            FIELD_SONARCLOUD_PROJECT_KEY,
            "SonarCloud project key",
            environment.has_non_empty(IRONLOOM_SONARCLOUD_PROJECT_KEY_ENV),
            stored
                .and_then(|setup| setup.sonarcloud_project_key.as_ref())
                .is_some(),
        ),
        field_model(
            FIELD_OPENAI_API_KEY_REF,
            "OpenAI API key",
            environment.has_non_empty(IRONLOOM_OPENAI_API_KEY_ENV),
            stored
                .and_then(|setup| setup.openai_api_key_ref.as_ref())
                .is_some(),
        ),
        field_model(
            FIELD_OPENAI_OAUTH_SESSION_REF,
            "ChatGPT OAuth session",
            environment.has_non_empty(IRONLOOM_OPENAI_OAUTH_SESSION_ENV),
            stored
                .and_then(|setup| setup.openai_oauth_session_ref.as_ref())
                .is_some(),
        ),
    ]
}

fn field_model(
    name: &'static str,
    label: &'static str,
    from_environment: bool,
    from_stored_setup: bool,
) -> SetupFieldModel {
    let source = if from_environment {
        SetupFieldSource::Environment
    } else if from_stored_setup {
        SetupFieldSource::Stored
    } else {
        SetupFieldSource::Missing
    };
    SetupFieldModel {
        name,
        label,
        source,
    }
}

fn missing_config_key_html() -> String {
    let body = r#"
<main class="setup-page setup-page--notice">
  <header class="setup-header">
    <p class="eyebrow">Ironloom setup</p>
    <h1>Setup key required</h1>
    <p class="lede">IRONLOOM_CONFIG_KEY must be configured before setup inputs can be accepted.</p>
  </header>
  <section class="instruction-list" aria-label="Config key examples">
    <pre>openssl rand -base64 32</pre>
    <pre>docker run -e IRONLOOM_CONFIG_KEY=&lt;base64-key&gt; ...</pre>
    <pre>kubectl -n ironloom create secret generic ironloom-setup --from-literal=config-key=&lt;base64-key&gt;</pre>
  </section>
</main>
"#;
    html_page("Ironloom Setup", body)
}

fn missing_installer_token_html() -> String {
    let body = r#"
<main class="setup-page setup-page--notice">
  <header class="setup-header">
    <p class="eyebrow">Ironloom setup</p>
    <h1>Installer token required</h1>
    <p class="lede">IRONLOOM_INSTALLER_TOKEN must be configured before setup inputs can be accepted.</p>
  </header>
  <section class="instruction-list" aria-label="Installer token examples">
    <pre>openssl rand -base64 32</pre>
    <pre>kubectl -n ironloom create secret generic ironloom-setup --from-literal=installer-token=&lt;token&gt;</pre>
  </section>
</main>
"#;
    html_page("Ironloom Setup", body)
}

fn config_form_html(fields: &[SetupFieldModel]) -> String {
    let mut body = String::from(
        r#"<main class="setup-page setup-page--form">
  <header class="setup-header">
    <p class="eyebrow">First-run configuration</p>
    <h1>Ironloom setup</h1>
    <p class="lede">Bind values from Docker or Kubernetes secrets, or save encrypted local setup values under IRONLOOM_STATE_ROOT.</p>
  </header>
  <form class="setup-form" method="post" action="/setup">
    <section class="form-section">
      <h2>Installer access</h2>
      <label class="field field--secret" data-field="installer_token">
        <span class="field-label">Installer token</span>
        <input type="password" name="installer_token" autocomplete="off" required>
      </label>
    </section>
    <section class="form-section">
      <h2>Runtime values</h2>
      <p class="section-copy">Environment-backed fields are locked and secret values are never displayed.</p>
      <div class="field-grid">
"#,
    );
    for field in fields {
        body.push_str(&field_html(field));
    }
    body.push_str(
        r#"      </div>
    </section>
    <div class="action-grid">
    <section class="action-panel" aria-labelledby="discord-auth-heading">
      <h2 id="discord-auth-heading">Discord app authorization</h2>
      <p>Use the Discord application ID to create a server install URL with bot and applications.commands scopes.</p>
      <p><button type="submit" formaction="/setup/discord/oauth/start">Start Discord authorization</button></p>
    </section>
    <section class="action-panel" aria-labelledby="openai-auth-heading">
      <h2 id="openai-auth-heading">OpenAI authentication</h2>
      <div class="option-list" role="radiogroup" aria-labelledby="openai-auth-heading">
        <label class="option-choice">
          <input type="radio" name="openai_auth_method" value="api_key" checked>
          <span><span class="option-title">API key</span><span class="option-copy">Use a bound API key or local encrypted reference.</span></span>
        </label>
        <label class="option-choice">
          <input type="radio" name="openai_auth_method" value="chatgpt_oauth">
          <span><span class="option-title">ChatGPT OAuth</span><span class="option-copy">Use the setup flow to save an OAuth session reference.</span></span>
        </label>
      </div>
      <p><button type="submit" formaction="/setup/openai/oauth/start">Start ChatGPT OAuth</button></p>
    </section>
    </div>
    <div class="form-actions">
      <button class="primary-action" type="submit">Save setup</button>
    </div>
  </form>
</main>
"#,
    );
    html_page("Ironloom Setup", &body)
}

fn openai_oauth_start_html() -> String {
    let body = r#"
<main>
  <h1>ChatGPT OAuth</h1>
  <p>Start a managed ChatGPT OAuth device-code flow with the local app-server using account/login/start and params type chatgptDeviceCode.</p>
  <pre>{ "method": "account/login/start", "id": 1, "params": { "type": "chatgptDeviceCode" } }</pre>
  <p>After the login completes, paste the encrypted OAuth session reference into the setup field named <code>openai_oauth_session_ref</code> and save setup with OpenAI authentication set to ChatGPT OAuth.</p>
  <form method="get" action="/setup"><button type="submit">Return to setup</button></form>
</main>
"#;
    html_page("Ironloom OpenAI OAuth Setup", body)
}

fn discord_oauth_start_html(application_id: &str) -> String {
    let authorize_url = discord_authorize_url(application_id);
    let body = format!(
        r#"
<main>
  <h1>Discord authorization</h1>
  <p>Open this URL in a browser while signed in as a Discord server administrator, then select the server that should host Ironloom.</p>
  <p><a href="{authorize_url}">{authorize_url}</a></p>
  <p>The URL requests the <code>bot</code> and <code>applications.commands</code> scopes with the minimal default permission bitfield.</p>
  <form method="get" action="/setup"><button type="submit">Return to setup</button></form>
</main>
"#
    );
    html_page("Ironloom Discord Authorization", &body)
}

fn discord_authorize_url(application_id: &str) -> String {
    let mut serializer = url::form_urlencoded::Serializer::new(String::new());
    serializer.append_pair("client_id", application_id);
    serializer.append_pair("scope", DISCORD_AUTHORIZE_SCOPE);
    serializer.append_pair("permissions", DISCORD_DEFAULT_PERMISSIONS);
    format!("{DISCORD_AUTHORIZE_URL}?{}", serializer.finish())
}

fn discord_application_id_for_authorization(
    context: &RuntimeHttpContext,
    submission: &SetupFormSubmission,
) -> Option<String> {
    submission
        .value(FIELD_DISCORD_APPLICATION_ID)
        .or_else(|| context.environment.discord_application_id())
        .or_else(|| {
            context
                .stored_setup
                .as_ref()
                .and_then(|setup| setup.discord_application_id.clone())
        })
}

fn field_html(field: &SetupFieldModel) -> String {
    match field.source {
        SetupFieldSource::Environment => format!(
            "        <div class=\"field field--locked\" data-field=\"{}\"><div class=\"field-row\"><span class=\"field-label\">{}</span><span class=\"status-pill\">Environment</span></div><p class=\"field-note\">Provided by environment</p></div>\n",
            field.name, field.label
        ),
        SetupFieldSource::Stored => format!(
            "        <label class=\"field field--stored\" data-field=\"{}\"><span class=\"field-row\"><span class=\"field-label\">{}</span><span class=\"status-pill\">Stored</span></span><input type=\"{}\" name=\"{}\" placeholder=\"Stored encrypted value present\" autocomplete=\"off\"></label>\n",
            field.name,
            field.label,
            field_input_type(field.name),
            field.name
        ),
        SetupFieldSource::Missing => format!(
            "        <label class=\"field field--missing\" data-field=\"{}\"><span class=\"field-label\">{}</span><input type=\"{}\" name=\"{}\" autocomplete=\"off\"></label>\n",
            field.name,
            field.label,
            field_input_type(field.name),
            field.name
        ),
    }
}

fn field_input_type(name: &str) -> &'static str {
    match name {
        FIELD_RUNTIME_URL
        | FIELD_DISCORD_APPLICATION_ID
        | FIELD_SONARCLOUD_ORGANIZATION
        | FIELD_SONARCLOUD_PROJECT_KEY => "text",
        _ => "password",
    }
}

fn html_page(title: &str, body: &str) -> String {
    format!(
        r#"<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <link rel="icon" href="data:,">
    <title>{title}</title>
    <style>{SETUP_PAGE_STYLE}</style>
  </head>
  <body>
    <div class="setup-shell">{body}</div>
  </body>
</html>"#
    )
}

fn write_proof_file(project_dir: &Path, file_name: &str, contents: &str) -> std::io::Result<()> {
    fs::write(project_dir.join(file_name), contents)
}

fn proof_index_html() -> &'static str {
    r#"<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Ironloom Proof App</title>
    <link rel="stylesheet" href="./style.css">
  </head>
  <body>
    <main>
      <p class="eyebrow">Ironloom proof</p>
      <h1>Ironloom Proof App</h1>
      <p id="status">A complete static app generated after a supervisor-gated proof run.</p>
      <button id="verify" type="button">Verify proof</button>
    </main>
    <script src="./app.js"></script>
  </body>
</html>
"#
}

fn proof_style_css() -> &'static str {
    r#"body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  font-family: system-ui, sans-serif;
  color: #f7f4ee;
  background: #090d12;
}

main {
  width: min(42rem, calc(100% - 2rem));
}

.eyebrow {
  color: #ff8800;
  font-weight: 700;
  text-transform: uppercase;
}

button {
  border: 0;
  border-radius: 6px;
  padding: 0.75rem 1rem;
  color: #090d12;
  background: #ff8800;
  font-weight: 700;
}
"#
}

fn proof_app_js() -> &'static str {
    r##"const status = document.querySelector("#status");
const verify = document.querySelector("#verify");

verify.addEventListener("click", () => {
  status.textContent = "Proof manifest and static app files are present.";
});
"##
}

fn proof_readme_md() -> &'static str {
    r#"# Ironloom Proof App

This complete static app is generated by `ironloom proof` after the runtime
successfully routes a deterministic work item through the supervisor, process
graph, gate worker, and artifact store.

Open `index.html` in a browser to run the app.
"#
}

#[derive(Debug, Default)]
struct CountingGateExecutor {
    runs: Cell<usize>,
}

impl GateExecutor for CountingGateExecutor {
    fn run_gate(&self, command: &str) -> GateResult {
        self.runs.set(self.runs.get() + 1);
        GateResult::passed(format!("accepted command: {command}"))
    }
}
