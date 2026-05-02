# @vannadii/devplat-worktrees

Worktree allocation and synchronization contracts.

## Responsibility

This package owns worktree allocation, sync, release semantics, branch safety, and cleanup result modeling for task execution.
The service exposes pure record helpers and Git-backed async methods for
`git worktree add`, fetch/rebase or fast-forward sync, and archive/delete
release behavior. Branch names are evaluated before any Git command runs, and
unsafe names produce blocked records with next-action hints.

## Real-World Flow

```mermaid
flowchart LR
  Task[Claimed task] --> Allocate[git worktree add]
  Allocate --> Safety[Branch safety check]
  Safety -->|safe| Git[Git worktree command]
  Safety -->|blocked| Operator[Choose safe branch name]
  Git --> Sync[Fetch and rebase or fast-forward]
  Sync --> Implement[Run implementation]
  Implement --> Release[Archive or delete worktree]
  Release --> Audit[Worktree artifact]
```

## Boundaries

- Keep Git worktree behavior here.
- Fail closed before Git execution when branch names are unsafe.
- Require policy mediation before destructive release actions.
- Do not submit GitHub pull request updates directly.

- Keep public TypeScript contracts derived from the exported codecs.

## Development

```bash
npm run test --workspace @vannadii/devplat-worktrees
```
