# Crate API

Ironloom keeps crate responsibilities strict so runtime orchestration stays separate from domain logic.

| Crate | Responsibility |
| --- | --- |
| `ironloom-core` | Typed IDs, repository and branch primitives, shared errors. |
| `ironloom-config` | Runtime configuration resolution, setup gating, and environment precedence. |
| `ironloom-artifacts` | Immutable artifact envelopes and schema contracts. |
| `ironloom-storage` | `.ironloom/` filesystem state, indexes, and encrypted setup configuration. |
| `ironloom-policy` | Fail-closed policy decisions. |
| `ironloom-process-graph` | Typed process graph validation and routing. |
| `ironloom-queue` | Durable work item lifecycle contracts. |
| `ironloom-observability` | Audit and telemetry records. |
| `ironloom-worktrees` | Local git worktree safety. |
| `ironloom-gates` | Gate execution contracts. |
| `ironloom-workers` | Worker request and response envelopes. |
| `ironloom-supervisor` | Process graph route selection and worker dispatch. |
| `ironloom-discord` | Thread-aware operator adapter. |
| `ironloom-github` | GitHub source-of-truth projections. |
| `ironloom-sonarcloud` | SonarCloud quality and compliance normalization. |
| `ironloom-runtime` | Service composition, health, readiness, and first-run setup HTTP surface. |
