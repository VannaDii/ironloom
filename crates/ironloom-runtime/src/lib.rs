#![forbid(unsafe_code)]

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::Path;

use ironloom_core::ThreadId;
use ironloom_discord::{DiscordCommand, DiscordError, FakeDiscordTransport, ThreadBindingRegistry};
use ironloom_gates::{GateExecutor, GateResult};
use ironloom_storage::{FilesystemStore, StorageError};
use ironloom_supervisor::{SupervisorError, SupervisorInput, run_gate_work};
use thiserror::Error;

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
        respond_to_health_request(stream?)?;
    }
    Ok(())
}

fn respond_to_health_request(mut stream: TcpStream) -> std::io::Result<()> {
    let mut buffer = [0_u8; 512];
    let bytes_read = stream.read(&mut buffer)?;
    let request = String::from_utf8_lossy(&buffer[..bytes_read]);
    let status = if request.starts_with("GET /healthz ") || request.starts_with("GET /readyz ") {
        "HTTP/1.1 200 OK\r\ncontent-type: text/plain\r\ncontent-length: 2\r\n\r\nok"
    } else {
        "HTTP/1.1 404 Not Found\r\ncontent-type: text/plain\r\ncontent-length: 9\r\n\r\nnot found"
    };
    stream.write_all(status.as_bytes())?;
    stream.flush()
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
