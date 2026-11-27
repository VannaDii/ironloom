#![forbid(unsafe_code)]

/// Software factory contracts; legacy foundation contracts remain readable.
pub mod factory;

/// Hosted inference streaming without tool execution.
pub mod providers;

/// Publisher/host-aware access, metadata and resumable downloads.
pub mod sources;

/// Service-owned local engine lifecycle.
pub mod engines;

/// Static/observed device identity; admission remains central policy.
pub mod devices;
