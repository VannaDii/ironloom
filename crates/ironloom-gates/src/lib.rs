#![forbid(unsafe_code)]

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// Gate execution status.
#[derive(Clone, Debug, Eq, JsonSchema, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum GateStatus {
    /// Gate completed successfully.
    Passed,
    /// Gate completed and reported a validation failure.
    Failed,
}

/// Structured gate execution result.
#[derive(Clone, Debug, Eq, JsonSchema, PartialEq, Deserialize, Serialize)]
pub struct GateResult {
    /// Gate status.
    pub status: GateStatus,
    /// Process exit code.
    pub exit_code: i32,
    /// Captured standard output.
    pub stdout: String,
    /// Captured standard error.
    pub stderr: String,
}

impl GateResult {
    /// Creates a successful fake gate result for local harnesses.
    #[must_use]
    pub fn passed(stdout: impl Into<String>) -> Self {
        Self {
            status: GateStatus::Passed,
            exit_code: 0,
            stdout: stdout.into(),
            stderr: String::new(),
        }
    }
}

/// A controlled gate executor boundary.
pub trait GateExecutor {
    /// Runs a safe gate command and returns a structured result.
    fn run_gate(&mut self, command: &str) -> GateResult;
}
