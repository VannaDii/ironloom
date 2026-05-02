# @vannadii/devplat-slicing

Dependency-aware slice planning.

## Responsibility

This package owns slice plans, dependency graph artifacts, readiness checks, acceptance criteria, and PR-sized work packets derived from approved specs.

## Real-World Flow

```mermaid
flowchart LR
  Spec[Approved spec] --> Plan[Slice plan]
  Plan --> Graph[Dependency graph]
  Graph --> GraphMetadata[Graph id generated time dependency count]
  Graph --> Ready[Readiness check]
  Ready --> Packet[PR-sized work packet]
  Packet --> PacketMetadata[Packet id task count PR title review focus]
  Packet --> Queue[Task queue]
```

## Boundaries

- Keep slice readiness deterministic.
- Do not claim tasks or allocate worktrees here.
- Keep dependency and work-packet metadata usable by queue, PR, review, and branching flows.

- Keep public TypeScript contracts derived from the exported codecs.

## Development

```bash
npm run test --workspace @vannadii/devplat-slicing
```
