# Architecture

Ironloom routes work through a typed process graph. The supervisor validates policy, selects a worker, records immutable artifacts under `.ironloom`, and reports outcomes back to the originating control surface.

Adapters for Discord, GitHub, and SonarCloud stay at the edges. Business rules live in core crates, policy, the process graph, workers, and the supervisor.

## Runtime Boundaries

```mermaid
flowchart TB
  runtime[ironloom-runtime]
  runtime --> config[ironloom-config]
  runtime --> supervisor[ironloom-supervisor]
  runtime --> storage[ironloom-storage]
  supervisor --> policy[ironloom-policy]
  supervisor --> graph[ironloom-process-graph]
  supervisor --> workers[ironloom-workers]
  workers --> gates[ironloom-gates]
  workers --> github[ironloom-github]
  workers --> sonar[ironloom-sonarcloud]
  storage --> artifacts[(.ironloom state)]
  discord[ironloom-discord] --> runtime
  core[ironloom-core] --> config
  core --> policy
  core --> graph
  core --> workers
```

## Boundary Rules

- `ironloom-runtime` is the deployable service and composition boundary.
- `ironloom-supervisor` owns process routing and worker registry dispatch decisions.
- `ironloom-discord` is the operator control-plane adapter and verifies signed Discord HTTP interactions before handling them.
- `ironloom-github` reads GitHub source-of-truth state through auditable API requests before supervisor decisions.
- `ironloom-sonarcloud` owns SonarCloud bootstrap validation, quality gate polling, and issue normalization.
- `ironloom-storage` owns direct `.ironloom/` filesystem access.

## First Vertical Slice

1. A signed Discord command interaction is accepted on the runtime HTTP port.
2. The runtime resolves the Discord thread to exactly one persisted work item and fails closed for missing or ambiguous bindings.
3. The supervisor selects the gate worker through the process graph and dispatches it through the worker registry.
4. Policy permits only a thread-bound non-destructive gate action.
5. The gate worker runs an allow-listed command with controlled environment, timeout, and captured streams, then returns a structured result.
6. Storage writes an immutable artifact under `.ironloom` and indexes it by thread and work item.
7. The runtime returns a Discord channel message response to the originating interaction.
