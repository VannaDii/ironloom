# @vannadii/devplat-slicing

Dependency-aware slice planning.

## Responsibility

This package owns slice plans, dependencies, readiness checks, acceptance criteria, and PR-sized work packets derived from approved specs.

## Real-World Flow

```mermaid
flowchart LR
  Spec[Approved spec] --> Plan[Slice plan]
  Plan --> Graph[Dependency graph]
  Graph --> Ready[Readiness check]
  Ready --> Packet[PR-sized work packet]
  Packet --> Queue[Task queue]
```

## Boundaries

- Keep slice readiness deterministic.
- Do not claim tasks or allocate worktrees here.
- Keep dependency output usable by queue and branching flows.

- Keep public TypeScript contracts derived from the exported codecs.

## Development

```bash
npm run test --workspace @vannadii/devplat-slicing
```
