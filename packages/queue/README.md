# @vannadii/devplat-queue

Task queue lifecycle state machine.

## Responsibility

This package owns task records, claim transitions, lifecycle updates, and transition history for spec and slice work.

## Real-World Flow

```mermaid
flowchart LR
  Slice[Slice work packet] --> Task[Queued task]
  Task --> Claim[Claim transition]
  Claim --> Run[Running implementation]
  Run --> Complete[Complete or blocked status]
  Complete --> History[Transition history]
```

## Boundaries

- Keep task state independent of Discord message formatting.
- Persist durable state through storage-facing callers.
- Keep task record and transition-event types derived from the exported codecs.
- Do not allocate worktrees directly from queue logic.

## Development

```bash
npm run test --workspace @vannadii/devplat-queue
```
