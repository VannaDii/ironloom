#![forbid(unsafe_code)]

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};

use ironloom_config::{
    ConfigError, IRONLOOM_CONFIG_KEY_ENV, IRONLOOM_DISCORD_PUBLIC_KEY_ENV,
    IRONLOOM_DISCORD_TOKEN_ENV, IRONLOOM_GITHUB_TOKEN_ENV, IRONLOOM_OPENAI_API_KEY_ENV,
    IRONLOOM_OPENAI_OAUTH_SESSION_ENV, IRONLOOM_PUBLIC_URL_ENV,
    IRONLOOM_SONARCLOUD_ORGANIZATION_ENV, IRONLOOM_SONARCLOUD_PROJECT_KEY_ENV,
    IRONLOOM_SONARCLOUD_TOKEN_ENV, RuntimeConfig, RuntimeConfigInputs, SetupEnvironment,
    StoredSetupConfig,
};
use ironloom_core::ThreadId;
use ironloom_discord::{DiscordCommand, DiscordError, FakeDiscordTransport, ThreadBindingRegistry};
use ironloom_gates::{GateExecutor, GateResult};
use ironloom_storage::{FilesystemStore, SetupConfigStore, StorageError};
use ironloom_supervisor::{SupervisorError, SupervisorInput, run_gate_work};
use thiserror::Error;

const FIELD_RUNTIME_URL: &str = "runtime_url";
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
const DEFAULT_STATE_ROOT: &str = ".ironloom";
const HTTP_READ_BUFFER_BYTES: usize = 16_384;

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
        self.gate_executor.runs
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
        RuntimeConfig::resolve(self.environment.clone(), self.stored_setup.as_ref()).is_ok()
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
    handle_runtime_http_request(context, request)
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
        &mut harness.gate_executor,
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
    let response = handle_runtime_http_request_with_store(&context, &store, &request);
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
<main>
  <h1>Setup key required</h1>
  <p>IRONLOOM_CONFIG_KEY must be configured before setup inputs can be accepted.</p>
  <pre>openssl rand -base64 32</pre>
  <pre>docker run -e IRONLOOM_CONFIG_KEY=&lt;base64-key&gt; ...</pre>
  <pre>kubectl -n ironloom create secret generic ironloom-setup --from-literal=config-key=&lt;base64-key&gt;</pre>
</main>
"#;
    html_page("Ironloom Setup", body)
}

fn missing_installer_token_html() -> String {
    let body = r#"
<main>
  <h1>Installer token required</h1>
  <p>IRONLOOM_INSTALLER_TOKEN must be configured before setup inputs can be accepted.</p>
  <pre>openssl rand -base64 32</pre>
  <pre>kubectl -n ironloom create secret generic ironloom-setup --from-literal=installer-token=&lt;token&gt;</pre>
</main>
"#;
    html_page("Ironloom Setup", body)
}

fn config_form_html(fields: &[SetupFieldModel]) -> String {
    let mut body = String::from(
        r#"<main>
  <h1>Ironloom setup</h1>
  <form method="post" action="/setup">
    <label>Installer token <input type="password" name="installer_token" autocomplete="off" required></label>
"#,
    );
    for field in fields {
        body.push_str(&field_html(field));
    }
    body.push_str(
        r#"    <fieldset>
      <legend>OpenAI authentication</legend>
      <label><input type="radio" name="openai_auth_method" value="api_key" checked> API key</label>
      <label><input type="radio" name="openai_auth_method" value="chatgpt_oauth"> ChatGPT OAuth</label>
      <p><button type="submit" formaction="/setup/openai/oauth/start">Start ChatGPT OAuth</button></p>
    </fieldset>
    <button type="submit">Save setup</button>
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

fn field_html(field: &SetupFieldModel) -> String {
    match field.source {
        SetupFieldSource::Environment => format!(
            "    <p data-field=\"{}\"><strong>{}</strong>: Provided by environment</p>\n",
            field.name, field.label
        ),
        SetupFieldSource::Stored => format!(
            "    <label data-field=\"{}\">{} <input type=\"password\" name=\"{}\" placeholder=\"Stored encrypted value present\"></label>\n",
            field.name, field.label, field.name
        ),
        SetupFieldSource::Missing => format!(
            "    <label data-field=\"{}\">{} <input type=\"password\" name=\"{}\" autocomplete=\"off\"></label>\n",
            field.name, field.label, field.name
        ),
    }
}

fn html_page(title: &str, body: &str) -> String {
    format!(
        "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>{title}</title></head><body>{body}</body></html>"
    )
}

#[derive(Debug, Default)]
struct CountingGateExecutor {
    runs: usize,
}

impl GateExecutor for CountingGateExecutor {
    fn run_gate(&mut self, command: &str) -> GateResult {
        self.runs += 1;
        GateResult::passed(format!("accepted command: {command}"))
    }
}
