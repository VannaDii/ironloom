# Architecture

Ironloom routes work through a typed process graph. The supervisor validates policy, selects a worker, records immutable artifacts under `.ironloom`, and reports outcomes back to the originating control surface.

Adapters for Discord, GitHub, and SonarCloud stay at the edges. Business rules live in core crates, policy, the process graph, workers, and the supervisor.

## Boundary Rules

- `ironloom-runtime` is the deployable service and composition boundary.
- `ironloom-supervisor` owns process routing and worker dispatch decisions.
- `ironloom-discord` is the operator control-plane adapter.
- `ironloom-github` reads and writes GitHub source-of-truth state through auditable requests.
- `ironloom-sonarcloud` owns SonarCloud quality and compliance normalization.
- `ironloom-storage` owns direct `.ironloom/` filesystem access.

## First Vertical Slice

1. A fake Discord command is bound to exactly one thread and work item.
2. The Discord adapter fails closed for missing or ambiguous bindings.
3. The supervisor selects the gate worker through the process graph.
4. Policy permits only a thread-bound non-destructive gate action.
5. The gate worker returns a structured result.
6. Storage writes an immutable artifact under `.ironloom` and indexes it by thread and work item.
7. The fake Discord transport replies to the originating thread.
