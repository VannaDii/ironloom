# Operator Workflows

Lifecycle-changing Discord actions must be bound to exactly one persisted work item and thread. Missing or ambiguous thread context fails closed before any worker runs.

## Command Sequence

```mermaid
sequenceDiagram
  participant Operator as Discord operator
  participant Discord as ironloom-discord
  participant Runtime as ironloom-runtime
  participant Supervisor as ironloom-supervisor
  participant GitHub as ironloom-github
  participant Worker as ironloom-workers
  participant Storage as ironloom-storage

  Operator->>Discord: Submit slash command in thread
  Discord->>Runtime: POST signed interaction
  Runtime->>Runtime: Verify signature and resolve thread binding
  alt Thread binding is missing or ambiguous
    Runtime-->>Discord: Return fail-closed channel response
    Discord-->>Operator: Explain failed binding in thread
  else Thread binding is unambiguous
    Runtime->>Supervisor: Route thread-bound command
    Supervisor->>GitHub: Refresh source-of-truth state
    GitHub-->>Supervisor: Current repository state
    Supervisor->>Supervisor: Apply policy and process graph
    Supervisor->>Worker: Dispatch work through registry
    Worker-->>Supervisor: Return structured result
    Supervisor->>Storage: Write immutable artifact
    Storage-->>Supervisor: Artifact index updated
    Supervisor-->>Runtime: Return audited outcome
    Runtime-->>Discord: Return channel message response
    Discord-->>Operator: Reply in originating thread
  end
```

## Thread Binding

Ironloom treats the Discord thread as the operator context. A command must resolve to a single work item before policy or worker dispatch runs.

## GitHub State

GitHub state should be refreshed before pull request, branch, check, review, or merge decisions. Cached state can support display and indexing, but it is not the source of truth.

## Artifacts

The supervisor stores immutable artifacts under `.ironloom` and indexes them by thread and work item. Operator-facing responses should point back to the originating thread.
