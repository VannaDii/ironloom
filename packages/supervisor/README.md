# @vannadii/devplat-supervisor

Lifecycle orchestration brain.

## Responsibility

This package owns deterministic supervisor decisions and lifecycle routing across research, specs, slicing, implementation, gates, review, remediation, merge, and continuation.

## Real-World Flow

```mermaid
flowchart LR
  State[Current lifecycle state] --> Policy[Policy decision]
  Policy --> Decision[Supervisor decision]
  Decision --> Phase[Lifecycle phase route]
  Phase --> Next[Next service action]
  Next --> Trace[Auditable trace]
```

## Boundaries

- Use policy decisions as inputs for privileged actions.
- Do not own OpenClaw agent execution; OpenClaw remains the agent loop.
- Keep outputs auditable and artifact-friendly.

## Development

```bash
npm run test --workspace @vannadii/devplat-supervisor
```
