# Crate API

Ironloom keeps crate responsibilities strict so runtime orchestration stays separate from domain logic.

| Crate | Responsibility |
| --- | --- |
| `ironloom-core` | Typed IDs, repository and branch primitives, shared errors. |
| `ironloom-config` | Runtime configuration resolution, setup gating, and environment precedence. |
| `ironloom-artifacts` | Immutable artifact envelopes and schema contracts. |
| `ironloom-storage` | `.ironloom/` filesystem state, artifact indexes, encrypted setup configuration, and persisted thread bindings. |
| `ironloom-policy` | Fail-closed policy decisions. |
| `ironloom-process-graph` | Typed process graph validation and routing. |
| `ironloom-queue` | Durable work item lifecycle contracts. |
| `ironloom-observability` | Audit and telemetry records. |
| `ironloom-worktrees` | Local git worktree safety. |
| `ironloom-gates` | Gate contracts plus allow-listed command execution with timeouts, working directories, environment controls, and captured streams. |
| `ironloom-workers` | Worker request/response envelopes and the in-process worker registry. |
| `ironloom-supervisor` | Process graph route selection and registry-backed worker dispatch. |
| `ironloom-discord` | Thread-aware operator adapter with signed HTTP interaction verification. |
| `ironloom-github` | GitHub source-of-truth API requests, HTTP transport, and repository projections. |
| `ironloom-sonarcloud` | SonarCloud bootstrap, HTTP transport, quality gate polling, and issue normalization. |
| `ironloom-runtime` | Service composition, health, readiness, and first-run setup HTTP surface. |
