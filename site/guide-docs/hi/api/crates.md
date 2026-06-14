# Crate API

Ironloom crate responsibilities को strict रखता है ताकि runtime orchestration domain logic से अलग रहे।

| Crate | Responsibility |
| --- | --- |
| `ironloom-core` | Typed IDs, repository और branch primitives, shared errors. |
| `ironloom-config` | Runtime configuration resolution, setup gating और environment precedence. |
| `ironloom-artifacts` | Immutable artifact envelopes और schema contracts. |
| `ironloom-storage` | `.ironloom/` filesystem state, indexes और encrypted setup configuration. |
| `ironloom-policy` | Fail-closed policy decisions. |
| `ironloom-process-graph` | Typed process graph validation और routing. |
| `ironloom-queue` | Durable work item lifecycle contracts. |
| `ironloom-observability` | Audit और telemetry records. |
| `ironloom-worktrees` | Local git worktree safety. |
| `ironloom-gates` | Gate execution contracts. |
| `ironloom-workers` | Worker request और response envelopes. |
| `ironloom-supervisor` | Process graph route selection और worker dispatch. |
| `ironloom-discord` | Thread-aware operator adapter. |
| `ironloom-github` | GitHub source-of-truth projections. |
| `ironloom-sonarcloud` | SonarCloud quality और compliance normalization. |
| `ironloom-runtime` | Service composition, health, readiness और first-run setup HTTP surface. |
