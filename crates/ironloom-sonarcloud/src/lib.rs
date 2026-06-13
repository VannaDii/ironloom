#![forbid(unsafe_code)]

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use thiserror::Error;

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
