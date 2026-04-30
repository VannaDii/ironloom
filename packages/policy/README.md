# @vannadii/devplat-policy

Governance and privileged action policy.

## Responsibility

This package owns allow/deny decisions, approval requirements, audit requirements, and privilege levels for lifecycle-changing actions such as merge, command execution, worktree release, rebase, publish, and destructive cleanup.

## Real-World Flow

```mermaid
flowchart LR
  Request[Lifecycle-changing request] --> Classify[Privilege classification]
  Classify --> Decision[Allow or deny]
  Decision --> Reason[Audit reason]
  Decision -->|allowed| Action[Caller performs action]
  Decision -->|denied| Response[Operator denial response]
```

## Boundaries

- Keep policy deterministic and testable.
- Do not perform the requested action from policy code.
- Return explicit denial reasons for Discord, OpenClaw, and audit artifacts.

- Keep public TypeScript contracts derived from the exported codecs.

## Development

```bash
npm run test --workspace @vannadii/devplat-policy
```
