# Crate API

Ironloom crate responsibilities को strict रखता है ताकि runtime orchestration domain logic से अलग रहे।

| Crate | Responsibility |
| --- | --- |
| `ironloom-core` | Typed IDs, repository और branch primitives, shared errors. |
| `ironloom-config` | Runtime configuration resolution, setup gating और environment precedence. |
| `ironloom-artifacts` | Immutable artifact envelopes और schema contracts. |
| `ironloom-storage` | `.ironloom/` filesystem state, artifact indexes, encrypted setup configuration और persisted thread bindings. |
| `ironloom-policy` | Fail-closed policy decisions. |
| `ironloom-process-graph` | Typed process graph validation और routing. |
| `ironloom-queue` | Durable work item lifecycle contracts. |
| `ironloom-observability` | Audit और telemetry records. |
| `ironloom-worktrees` | Local git worktree safety. |
| `ironloom-gates` | Gate contracts और allow-listed command execution, जिसमें timeout, working directory, environment controls और captured streams शामिल हैं। |
| `ironloom-workers` | Worker request/response envelopes और in-process worker registry. |
| `ironloom-supervisor` | Process graph route selection और registry-backed worker dispatch. |
| `ironloom-discord` | Signed HTTP interaction verification वाला thread-aware operator adapter. |
| `ironloom-github` | GitHub source-of-truth API requests, HTTP transport और repository projections. |
| `ironloom-sonarcloud` | SonarCloud bootstrap, HTTP transport, quality gate polling और issue normalization. |
| `ironloom-runtime` | Service composition, health, readiness और first-run setup HTTP surface. |
