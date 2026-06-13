#![forbid(unsafe_code)]

use std::path::PathBuf;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Environment variable containing the public runtime URL.
pub const IRONLOOM_PUBLIC_URL_ENV: &str = "IRONLOOM_PUBLIC_URL";
/// Environment variable containing the runtime state root.
pub const IRONLOOM_STATE_ROOT_ENV: &str = "IRONLOOM_STATE_ROOT";
/// Environment variable containing the Discord token.
pub const IRONLOOM_DISCORD_TOKEN_ENV: &str = "IRONLOOM_DISCORD_TOKEN";
/// Environment variable containing the GitHub token.
pub const IRONLOOM_GITHUB_TOKEN_ENV: &str = "IRONLOOM_GITHUB_TOKEN";
/// Environment variable containing the SonarCloud token.
pub const IRONLOOM_SONARCLOUD_TOKEN_ENV: &str = "IRONLOOM_SONARCLOUD_TOKEN";

/// Runtime configuration required before accepting work.
#[derive(Clone, Debug, Eq, JsonSchema, PartialEq, Deserialize, Serialize)]
pub struct RuntimeConfig {
    /// Public runtime base URL.
    pub runtime_url: String,
    /// State root that contains `.ironloom`.
    pub state_root: PathBuf,
    /// Discord token secret reference.
    pub discord_token_ref: String,
    /// GitHub credential secret reference.
    pub github_token_ref: String,
    /// SonarCloud token secret reference.
    pub sonarcloud_token_ref: String,
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
}

impl RuntimeConfig {
    /// Loads runtime configuration from process environment variables.
    pub fn from_environment() -> Result<Self, ConfigError> {
        Self::from_environment_reader(|name| std::env::var(name).ok())
    }

    /// Loads runtime configuration from key-value pairs for deterministic tests.
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

    /// Validates required secret references before the runtime accepts work.
    pub fn validate(&self) -> Result<(), ConfigError> {
        validate_secret("runtime_url", &self.runtime_url)?;
        validate_secret("discord_token_ref", &self.discord_token_ref)?;
        validate_secret("github_token_ref", &self.github_token_ref)?;
        validate_secret("sonarcloud_token_ref", &self.sonarcloud_token_ref)?;
        Ok(())
    }

    fn from_environment_reader(
        mut read: impl FnMut(&str) -> Option<String>,
    ) -> Result<Self, ConfigError> {
        let runtime_url = read_required(&mut read, IRONLOOM_PUBLIC_URL_ENV, "runtime_url")?;
        let state_root = read_required(&mut read, IRONLOOM_STATE_ROOT_ENV, "state_root")?;
        let discord_token_ref =
            read_required(&mut read, IRONLOOM_DISCORD_TOKEN_ENV, "discord_token_ref")?;
        let github_token_ref =
            read_required(&mut read, IRONLOOM_GITHUB_TOKEN_ENV, "github_token_ref")?;
        let sonarcloud_token_ref = read_required(
            &mut read,
            IRONLOOM_SONARCLOUD_TOKEN_ENV,
            "sonarcloud_token_ref",
        )?;
        let config = Self {
            runtime_url,
            state_root: PathBuf::from(state_root),
            discord_token_ref,
            github_token_ref,
            sonarcloud_token_ref,
        };
        config.validate()?;
        Ok(config)
    }
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
    if value.trim().is_empty() {
        Err(ConfigError::EmptySecretRef { field })
    } else {
        Ok(())
    }
}
