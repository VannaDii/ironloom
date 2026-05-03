# @vannadii/devplat-branching

Downstream branch coordination contracts.

## Responsibility

This package owns branch dependency planning, branch-conflict next-action
constants, and rebase execution result modeling after pull request merges. It
coordinates with worktree synchronization rather than implementing GitHub review
or merge behavior directly. Dependent rebase execution feeds worktree sync
conflicts back into the plan's conflict classification so OpenClaw and operator
surfaces receive the same remediation next action as the execution result.

## Real-World Flow

```mermaid
flowchart LR
  Merge[PR merged] --> Graph[Dependent branch graph]
  Graph --> Plan[Rebase plan]
  Plan --> Worktrees[Worktree sync]
  Worktrees --> Conflict{Conflicts detected?}
  Conflict -->|yes| Resolve[Resolve conflicts]
  Conflict -->|no| Result[Rebase result artifact]
  Resolve --> Result
  Result --> GitHub[GitHub branch updates]
```

## Boundaries

- Keep dependent-branch graph and conflict classification contracts here.
- Keep rebase plan and execution-result types derived from the exported codecs.
- Delegate actual worktree sync behavior to `@vannadii/devplat-worktrees`.
- Do not call Discord or OpenClaw from this package.

## Development

```bash
npm run test --workspace @vannadii/devplat-branching
```
