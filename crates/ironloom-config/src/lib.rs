#![forbid(unsafe_code)]

use std::collections::BTreeMap;
use std::path::PathBuf;

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Environment variable containing the public runtime URL.
pub const IRONLOOM_PUBLIC_URL_ENV: &str = "IRONLOOM_PUBLIC_URL";
/// Environment variable containing the runtime state root.
pub const IRONLOOM_STATE_ROOT_ENV: &str = "IRONLOOM_STATE_ROOT";
/// Environment variable containing the setup encryption key.
pub const IRONLOOM_CONFIG_KEY_ENV: &str = "IRONLOOM_CONFIG_KEY";
/// Environment variable containing the first-run installer token.
pub const IRONLOOM_INSTALLER_TOKEN_ENV: &str = "IRONLOOM_INSTALLER_TOKEN";
/// Environment variable containing the Discord token.
pub const IRONLOOM_DISCORD_TOKEN_ENV: &str = "IRONLOOM_DISCORD_TOKEN";
/// Environment variable containing the Discord public key.
pub const IRONLOOM_DISCORD_PUBLIC_KEY_ENV: &str = "IRONLOOM_DISCORD_PUBLIC_KEY";
/// Environment variable containing the GitHub token.
pub const IRONLOOM_GITHUB_TOKEN_ENV: &str = "IRONLOOM_GITHUB_TOKEN";
/// Environment variable containing the SonarCloud token.
pub const IRONLOOM_SONARCLOUD_TOKEN_ENV: &str = "IRONLOOM_SONARCLOUD_TOKEN";
/// Environment variable containing the SonarCloud organization.
pub const IRONLOOM_SONARCLOUD_ORGANIZATION_ENV: &str = "IRONLOOM_SONARCLOUD_ORGANIZATION";
/// Environment variable containing the SonarCloud project key.
pub const IRONLOOM_SONARCLOUD_PROJECT_KEY_ENV: &str = "IRONLOOM_SONARCLOUD_PROJECT_KEY";
/// Environment variable containing the OpenAI API key.
pub const IRONLOOM_OPENAI_API_KEY_ENV: &str = "IRONLOOM_OPENAI_API_KEY";
/// Environment variable containing a ChatGPT OAuth session reference.
pub const IRONLOOM_OPENAI_OAUTH_SESSION_ENV: &str = "IRONLOOM_OPENAI_OAUTH_SESSION";

const FIELD_RUNTIME_URL: &str = "runtime_url";
const FIELD_STATE_ROOT: &str = "state_root";
const FIELD_DISCORD_TOKEN_REF: &str = "discord_token_ref";
const FIELD_DISCORD_PUBLIC_KEY_REF: &str = "discord_public_key_ref";
const FIELD_GITHUB_TOKEN_REF: &str = "github_token_ref";
const FIELD_SONARCLOUD_TOKEN_REF: &str = "sonarcloud_token_ref";
const FIELD_SONARCLOUD_ORGANIZATION: &str = "sonarcloud_organization";
const FIELD_SONARCLOUD_PROJECT_KEY: &str = "sonarcloud_project_key";
const FIELD_OPENAI_AUTH: &str = "openai_auth";
const FIELD_OPENAI_API_KEY_REF: &str = "openai_api_key_ref";
const FIELD_OPENAI_OAUTH_SESSION_REF: &str = "openai_oauth_session_ref";
const CONFIG_KEY_BYTES: usize = 32;

/// Resolved source for a runtime configuration field.
#[derive(Clone, Copy, Debug, Eq, JsonSchema, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ConfigSource {
    /// Field came from a process environment variable.
    Environment,
    /// Field came from the encrypted local setup file.
    StoredSetup,
}

/// OpenAI authentication method selected for coding-agent work.
#[derive(Clone, Debug, Eq, JsonSchema, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case", tag = "method")]
pub enum OpenAiAuthConfig {
    /// Authenticate with an OpenAI API key.
    ApiKey {
        /// API key secret reference or secret value.
        api_key_ref: String,
    },
    /// Authenticate with a ChatGPT-managed OAuth session.
    ChatGptOAuth {
        /// OAuth session reference or serialized session state.
        session_ref: String,
    },
}

/// Setup values persisted in the encrypted local setup file.
#[derive(Clone, Debug, Default, Eq, JsonSchema, PartialEq, Deserialize, Serialize)]
pub struct StoredSetupConfig {
    /// Public runtime base URL.
    pub runtime_url: Option<String>,
    /// Discord token secret reference or secret value.
    pub discord_token_ref: Option<String>,
    /// Discord public key secret reference or secret value.
    pub discord_public_key_ref: Option<String>,
    /// GitHub credential secret reference or secret value.
    pub github_token_ref: Option<String>,
    /// SonarCloud token secret reference or secret value.
    pub sonarcloud_token_ref: Option<String>,
    /// SonarCloud organization.
    pub sonarcloud_organization: Option<String>,
    /// SonarCloud project key.
    pub sonarcloud_project_key: Option<String>,
    /// OpenAI API key secret reference or secret value.
    pub openai_api_key_ref: Option<String>,
    /// ChatGPT OAuth session reference or serialized session state.
    pub openai_oauth_session_ref: Option<String>,
}

/// Captured runtime configuration environment values.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct RuntimeConfigInputs {
    values: BTreeMap<String, String>,
}

impl RuntimeConfigInputs {
    /// Loads runtime configuration inputs from process environment variables.
    #[must_use]
    pub fn from_environment() -> Self {
        Self::from_reader(|name| std::env::var(name).ok())
    }

    /// Loads runtime configuration inputs from key-value pairs for deterministic tests.
    pub fn from_environment_pairs<'a>(pairs: impl IntoIterator<Item = (&'a str, &'a str)>) -> Self {
        let values = pairs
            .into_iter()
            .map(|(name, value)| (name.to_owned(), value.to_owned()))
            .collect();
        Self { values }
    }

    /// Returns the configured state root when supplied by environment.
    #[must_use]
    pub fn state_root(&self) -> Option<PathBuf> {
        self.value(IRONLOOM_STATE_ROOT_ENV)
            .filter(|value| !is_empty(value))
            .map(PathBuf::from)
    }

    /// Returns whether a named environment variable was supplied with a non-empty value.
    #[must_use]
    pub fn has_non_empty(&self, name: &str) -> bool {
        self.values.get(name).is_some_and(|value| !is_empty(value))
    }

    fn from_reader(mut read: impl FnMut(&str) -> Option<String>) -> Self {
        let names = [
            IRONLOOM_PUBLIC_URL_ENV,
            IRONLOOM_STATE_ROOT_ENV,
            IRONLOOM_DISCORD_TOKEN_ENV,
            IRONLOOM_DISCORD_PUBLIC_KEY_ENV,
            IRONLOOM_GITHUB_TOKEN_ENV,
            IRONLOOM_SONARCLOUD_TOKEN_ENV,
            IRONLOOM_SONARCLOUD_ORGANIZATION_ENV,
            IRONLOOM_SONARCLOUD_PROJECT_KEY_ENV,
            IRONLOOM_OPENAI_API_KEY_ENV,
            IRONLOOM_OPENAI_OAUTH_SESSION_ENV,
        ];
        let values = names
            .into_iter()
            .filter_map(|name| read(name).map(|value| (name.to_owned(), value)))
            .collect();
        Self { values }
    }

    fn value(&self, name: &str) -> Option<String> {
        self.values.get(name).cloned()
    }
}

/// Setup-only environment required before accepting local setup input.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SetupEnvironment {
    /// Encryption key used for the local setup file.
    pub config_key: String,
    /// Installer token required to submit setup changes.
    pub installer_token: String,
}

impl SetupEnvironment {
    /// Loads setup environment values from process environment variables.
    pub fn from_environment() -> Result<Self, ConfigError> {
        Self::from_environment_reader(|name| std::env::var(name).ok())
    }

    /// Loads setup environment values from key-value pairs for deterministic tests.
    pub fn from_environment_pairs<'a>(
        pairs: impl IntoIterator<Item = (&'a str, &'a str)>,
    ) -> Result<Self, ConfigError> {
        let values = pairs
            .into_iter()
            .map(|(name, value)| (name.to_owned(), value.to_owned()))
            .collect::<Vec<_>>();
        Self::from_environment_reader(|name| {
            values
                .iter()
                .find(|(candidate, _)| candidate == name)
                .map(|(_, value)| value.clone())
        })
    }

    fn from_environment_reader(
        mut read: impl FnMut(&str) -> Option<String>,
    ) -> Result<Self, ConfigError> {
        let config_key = read_required(&mut read, IRONLOOM_CONFIG_KEY_ENV, "config_key")?;
        validate_config_key(&config_key)?;
        let installer_token =
            read_required(&mut read, IRONLOOM_INSTALLER_TOKEN_ENV, "installer_token")?;
        Ok(Self {
            config_key,
            installer_token,
        })
    }
}

/// Runtime configuration required before accepting work.
#[derive(Clone, Debug, Eq, JsonSchema, PartialEq, Deserialize, Serialize)]
pub struct RuntimeConfig {
    /// Public runtime base URL.
    pub runtime_url: String,
    /// State root that contains `.ironloom`.
    pub state_root: PathBuf,
    /// Discord token secret reference.
    pub discord_token_ref: String,
    /// Discord public key secret reference.
    pub discord_public_key_ref: String,
    /// GitHub credential secret reference.
    pub github_token_ref: String,
    /// SonarCloud token secret reference.
    pub sonarcloud_token_ref: String,
    /// SonarCloud organization.
    pub sonarcloud_organization: String,
    /// SonarCloud project key.
    pub sonarcloud_project_key: String,
    /// OpenAI authentication settings.
    pub openai_auth: OpenAiAuthConfig,
    /// Source of each resolved configuration field.
    #[serde(skip)]
    #[schemars(skip)]
    pub sources: BTreeMap<String, ConfigSource>,
}

/// Runtime configuration validation error.
#[derive(Debug, Error, Eq, PartialEq)]
pub enum ConfigError {
    /// A required environment variable was missing.
    #[error("{name} must be set")]
    MissingEnvironment {
        /// Missing environment variable name.
        name: &'static str,
    },
    /// A required secret reference was empty.
    #[error("{field} must not be empty")]
    EmptySecretRef { field: &'static str },
    /// A required runtime field was missing from both environment and local setup.
    #[error("{field} is required before the runtime accepts work")]
    MissingRuntimeField {
        /// Missing runtime field name.
        field: &'static str,
    },
    /// Setup encryption key was not valid base64-encoded key material.
    #[error("IRONLOOM_CONFIG_KEY must be base64-encoded 32-byte key material")]
    InvalidConfigKey,
}

impl RuntimeConfig {
    /// Loads runtime configuration from process environment variables.
    pub fn from_environment() -> Result<Self, ConfigError> {
        Self::resolve(RuntimeConfigInputs::from_environment(), None)
    }

    /// Loads runtime configuration from key-value pairs for deterministic tests.
    pub fn from_environment_pairs<'a>(
        pairs: impl IntoIterator<Item = (&'a str, &'a str)>,
    ) -> Result<Self, ConfigError> {
        Self::resolve(RuntimeConfigInputs::from_environment_pairs(pairs), None)
    }

    /// Resolves runtime configuration with environment values taking precedence.
    pub fn resolve(
        environment: RuntimeConfigInputs,
        stored: Option<&StoredSetupConfig>,
    ) -> Result<Self, ConfigError> {
        let state_root =
            environment
                .value(IRONLOOM_STATE_ROOT_ENV)
                .ok_or(ConfigError::MissingEnvironment {
                    name: IRONLOOM_STATE_ROOT_ENV,
                })?;
        validate_secret(FIELD_STATE_ROOT, &state_root)?;
        let mut sources = BTreeMap::new();
        let runtime_url = resolve_field(
            &environment,
            stored,
            IRONLOOM_PUBLIC_URL_ENV,
            FIELD_RUNTIME_URL,
            |setup| setup.runtime_url.as_ref(),
            &mut sources,
        )?;
        let discord_token_ref = resolve_field(
            &environment,
            stored,
            IRONLOOM_DISCORD_TOKEN_ENV,
            FIELD_DISCORD_TOKEN_REF,
            |setup| setup.discord_token_ref.as_ref(),
            &mut sources,
        )?;
        let discord_public_key_ref = resolve_field(
            &environment,
            stored,
            IRONLOOM_DISCORD_PUBLIC_KEY_ENV,
            FIELD_DISCORD_PUBLIC_KEY_REF,
            |setup| setup.discord_public_key_ref.as_ref(),
            &mut sources,
        )?;
        let github_token_ref = resolve_field(
            &environment,
            stored,
            IRONLOOM_GITHUB_TOKEN_ENV,
            FIELD_GITHUB_TOKEN_REF,
            |setup| setup.github_token_ref.as_ref(),
            &mut sources,
        )?;
        let sonarcloud_token_ref = resolve_field(
            &environment,
            stored,
            IRONLOOM_SONARCLOUD_TOKEN_ENV,
            FIELD_SONARCLOUD_TOKEN_REF,
            |setup| setup.sonarcloud_token_ref.as_ref(),
            &mut sources,
        )?;
        let sonarcloud_organization = resolve_field(
            &environment,
            stored,
            IRONLOOM_SONARCLOUD_ORGANIZATION_ENV,
            FIELD_SONARCLOUD_ORGANIZATION,
            |setup| setup.sonarcloud_organization.as_ref(),
            &mut sources,
        )?;
        let sonarcloud_project_key = resolve_field(
            &environment,
            stored,
            IRONLOOM_SONARCLOUD_PROJECT_KEY_ENV,
            FIELD_SONARCLOUD_PROJECT_KEY,
            |setup| setup.sonarcloud_project_key.as_ref(),
            &mut sources,
        )?;
        let openai_auth = resolve_openai_auth(&environment, stored, &mut sources)?;
        let config = Self {
            runtime_url,
            state_root: PathBuf::from(state_root),
            discord_token_ref,
            discord_public_key_ref,
            github_token_ref,
            sonarcloud_token_ref,
            sonarcloud_organization,
            sonarcloud_project_key,
            openai_auth,
            sources,
        };
        config.validate()?;
        Ok(config)
    }

    /// Validates required secret references before the runtime accepts work.
    pub fn validate(&self) -> Result<(), ConfigError> {
        validate_secret(FIELD_RUNTIME_URL, &self.runtime_url)?;
        if self.state_root.as_os_str().is_empty() {
            return Err(ConfigError::EmptySecretRef {
                field: FIELD_STATE_ROOT,
            });
        }
        validate_secret(FIELD_DISCORD_TOKEN_REF, &self.discord_token_ref)?;
        validate_secret(FIELD_DISCORD_PUBLIC_KEY_REF, &self.discord_public_key_ref)?;
        validate_secret(FIELD_GITHUB_TOKEN_REF, &self.github_token_ref)?;
        validate_secret(FIELD_SONARCLOUD_TOKEN_REF, &self.sonarcloud_token_ref)?;
        validate_secret(FIELD_SONARCLOUD_ORGANIZATION, &self.sonarcloud_organization)?;
        validate_secret(FIELD_SONARCLOUD_PROJECT_KEY, &self.sonarcloud_project_key)?;
        match &self.openai_auth {
            OpenAiAuthConfig::ApiKey { api_key_ref } => {
                validate_secret(FIELD_OPENAI_API_KEY_REF, api_key_ref)?;
            }
            OpenAiAuthConfig::ChatGptOAuth { session_ref } => {
                validate_secret(FIELD_OPENAI_OAUTH_SESSION_REF, session_ref)?;
            }
        }
        Ok(())
    }
}

fn resolve_field(
    environment: &RuntimeConfigInputs,
    stored: Option<&StoredSetupConfig>,
    environment_name: &str,
    field: &'static str,
    stored_value: impl Fn(&StoredSetupConfig) -> Option<&String>,
    sources: &mut BTreeMap<String, ConfigSource>,
) -> Result<String, ConfigError> {
    if let Some(value) = environment.value(environment_name) {
        validate_secret(field, &value)?;
        sources.insert(field.to_owned(), ConfigSource::Environment);
        return Ok(value);
    }
    if let Some(value) = stored.and_then(stored_value) {
        validate_secret(field, value)?;
        sources.insert(field.to_owned(), ConfigSource::StoredSetup);
        return Ok(value.clone());
    }
    Err(ConfigError::MissingRuntimeField { field })
}

fn resolve_openai_auth(
    environment: &RuntimeConfigInputs,
    stored: Option<&StoredSetupConfig>,
    sources: &mut BTreeMap<String, ConfigSource>,
) -> Result<OpenAiAuthConfig, ConfigError> {
    if let Some(api_key_ref) = environment.value(IRONLOOM_OPENAI_API_KEY_ENV) {
        validate_secret(FIELD_OPENAI_API_KEY_REF, &api_key_ref)?;
        sources.insert(FIELD_OPENAI_AUTH.to_owned(), ConfigSource::Environment);
        return Ok(OpenAiAuthConfig::ApiKey { api_key_ref });
    }
    if let Some(session_ref) = environment.value(IRONLOOM_OPENAI_OAUTH_SESSION_ENV) {
        validate_secret(FIELD_OPENAI_OAUTH_SESSION_REF, &session_ref)?;
        sources.insert(FIELD_OPENAI_AUTH.to_owned(), ConfigSource::Environment);
        return Ok(OpenAiAuthConfig::ChatGptOAuth { session_ref });
    }
    if let Some(api_key_ref) = stored.and_then(|setup| setup.openai_api_key_ref.as_ref()) {
        validate_secret(FIELD_OPENAI_API_KEY_REF, api_key_ref)?;
        sources.insert(FIELD_OPENAI_AUTH.to_owned(), ConfigSource::StoredSetup);
        return Ok(OpenAiAuthConfig::ApiKey {
            api_key_ref: api_key_ref.clone(),
        });
    }
    if let Some(session_ref) = stored.and_then(|setup| setup.openai_oauth_session_ref.as_ref()) {
        validate_secret(FIELD_OPENAI_OAUTH_SESSION_REF, session_ref)?;
        sources.insert(FIELD_OPENAI_AUTH.to_owned(), ConfigSource::StoredSetup);
        return Ok(OpenAiAuthConfig::ChatGptOAuth {
            session_ref: session_ref.clone(),
        });
    }
    Err(ConfigError::MissingRuntimeField {
        field: FIELD_OPENAI_AUTH,
    })
}

fn read_required(
    read: &mut impl FnMut(&str) -> Option<String>,
    name: &'static str,
    field: &'static str,
) -> Result<String, ConfigError> {
    let value = read(name).ok_or(ConfigError::MissingEnvironment { name })?;
    validate_secret(field, &value)?;
    Ok(value)
}

fn validate_secret(field: &'static str, value: &str) -> Result<(), ConfigError> {
    if is_empty(value) {
        Err(ConfigError::EmptySecretRef { field })
    } else {
        Ok(())
    }
}

fn validate_config_key(value: &str) -> Result<(), ConfigError> {
    let decoded = STANDARD
        .decode(value)
        .map_err(|_| ConfigError::InvalidConfigKey)?;
    if decoded.len() != CONFIG_KEY_BYTES {
        return Err(ConfigError::InvalidConfigKey);
    }
    Ok(())
}

fn is_empty(value: &str) -> bool {
    value.trim().is_empty()
}
