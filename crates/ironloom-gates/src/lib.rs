#![forbid(unsafe_code)]

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

const DEFAULT_GATE_TIMEOUT: Duration = Duration::from_secs(300);
const TIMEOUT_EXIT_CODE: i32 = -1;
const PROCESS_START_EXIT_CODE: i32 = -1;
const PROCESS_CAPTURE_EXIT_CODE: i32 = -1;

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

    /// Creates a failed gate result for fail-closed executor paths.
    #[must_use]
    pub fn failed(exit_code: i32, stderr: impl Into<String>) -> Self {
        Self {
            status: GateStatus::Failed,
            exit_code,
            stdout: String::new(),
            stderr: stderr.into(),
        }
    }
}

/// A controlled gate executor boundary.
pub trait GateExecutor {
    /// Runs a safe gate command and returns a structured result.
    fn run_gate(&self, command: &str) -> GateResult;
}

/// A configured command that may be executed by the command gate executor.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GateCommand {
    name: String,
    program: String,
    args: Vec<String>,
    env: BTreeMap<String, String>,
    timeout: Option<Duration>,
}

impl GateCommand {
    /// Creates a named command with an executable program.
    #[must_use]
    pub fn new(name: impl Into<String>, program: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            program: program.into(),
            args: Vec::new(),
            env: BTreeMap::new(),
            timeout: None,
        }
    }

    /// Appends one command argument.
    #[must_use]
    pub fn arg(mut self, arg: impl Into<String>) -> Self {
        self.args.push(arg.into());
        self
    }

    /// Appends multiple command arguments.
    #[must_use]
    pub fn args(mut self, args: impl IntoIterator<Item = impl Into<String>>) -> Self {
        self.args.extend(args.into_iter().map(Into::into));
        self
    }

    /// Adds one explicit environment binding.
    #[must_use]
    pub fn env(mut self, name: impl Into<String>, value: impl Into<String>) -> Self {
        self.env.insert(name.into(), value.into());
        self
    }

    /// Overrides the executor timeout for this command.
    #[must_use]
    pub fn timeout(mut self, timeout: Duration) -> Self {
        self.timeout = Some(timeout);
        self
    }
}

/// Gate executor that runs allow-listed local commands with captured output.
#[derive(Debug)]
pub struct CommandGateExecutor {
    working_dir: PathBuf,
    commands: BTreeMap<String, GateCommand>,
    default_timeout: Duration,
}

impl CommandGateExecutor {
    /// Creates a command executor rooted at a controlled working directory.
    #[must_use]
    pub fn new(working_dir: impl AsRef<Path>) -> Self {
        Self {
            working_dir: working_dir.as_ref().to_path_buf(),
            commands: BTreeMap::new(),
            default_timeout: DEFAULT_GATE_TIMEOUT,
        }
    }

    /// Replaces the executor default timeout.
    #[must_use]
    pub fn with_timeout(mut self, timeout: Duration) -> Self {
        self.default_timeout = timeout;
        self
    }

    /// Allows a named command for later gate execution.
    pub fn allow_command(&mut self, command: GateCommand) {
        self.commands.insert(command.name.clone(), command);
    }
}

impl GateExecutor for CommandGateExecutor {
    fn run_gate(&self, command: &str) -> GateResult {
        let Some(spec) = self.commands.get(command) else {
            return GateResult::failed(
                PROCESS_START_EXIT_CODE,
                format!("gate command is not allow-listed: {command}"),
            );
        };
        run_command(
            spec,
            &self.working_dir,
            spec.timeout.unwrap_or(self.default_timeout),
        )
    }
}

fn run_command(spec: &GateCommand, working_dir: &Path, timeout: Duration) -> GateResult {
    let mut command = Command::new(&spec.program);
    command
        .args(&spec.args)
        .current_dir(working_dir)
        .env_clear()
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(path) = std::env::var_os("PATH") {
        command.env("PATH", path);
    }
    for (name, value) in &spec.env {
        command.env(name, value);
    }
    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(error) => {
            return GateResult::failed(
                PROCESS_START_EXIT_CODE,
                format!("failed to start gate command {}: {error}", spec.name),
            );
        }
    };
    let deadline = Instant::now() + timeout;
    loop {
        match child.try_wait() {
            Ok(Some(_status)) => return collect_output(child, &spec.name),
            Ok(None) if Instant::now() >= deadline => {
                if let Err(error) = child.kill() {
                    return GateResult::failed(
                        TIMEOUT_EXIT_CODE,
                        format!(
                            "gate command {} timed out and could not be killed: {error}",
                            spec.name
                        ),
                    );
                }
                let _ = child.wait();
                return GateResult::failed(
                    TIMEOUT_EXIT_CODE,
                    format!("gate command {} timed out", spec.name),
                );
            }
            Ok(None) => thread::sleep(Duration::from_millis(10)),
            Err(error) => {
                return GateResult::failed(
                    PROCESS_CAPTURE_EXIT_CODE,
                    format!(
                        "failed while waiting for gate command {}: {error}",
                        spec.name
                    ),
                );
            }
        }
    }
}

fn collect_output(child: std::process::Child, command_name: &str) -> GateResult {
    match child.wait_with_output() {
        Ok(output) => {
            let exit_code = output.status.code().unwrap_or(PROCESS_CAPTURE_EXIT_CODE);
            GateResult {
                status: if output.status.success() {
                    GateStatus::Passed
                } else {
                    GateStatus::Failed
                },
                exit_code,
                stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
                stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
            }
        }
        Err(error) => GateResult::failed(
            PROCESS_CAPTURE_EXIT_CODE,
            format!("failed to capture gate command {command_name}: {error}"),
        ),
    }
}
