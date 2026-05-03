---
'@vannadii/devplat-branching': patch
'@vannadii/devplat-openclaw': patch
---

Project dependent-branch rebase conflicts back into the executed rebase plan.
Deepen OpenClaw worktree delegation with explicit Git-backed worktree tool
execution.

Dependent rebase execution already delegated branch refresh work to
`@vannadii/devplat-worktrees` and returned the raw sync results. It now also
derives the returned plan's `conflictClassification` from sync results that
report `conflictsDetected`, so downstream OpenClaw tool output and operator
surfaces receive the concrete affected branches and `resolve-conflicts` next
action without reinterpreting raw worktree records.

OpenClaw worktree lifecycle tools now accept explicit `applyToDisk` input. Pure
record projection remains the default, while `applyToDisk: true` delegates
allocation, sync, and release to the Git-backed worktree service methods.
