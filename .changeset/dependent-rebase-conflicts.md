---
'@vannadii/devplat-branching': patch
'@vannadii/devplat-openclaw': patch
---

Project dependent-branch rebase conflicts back into the executed rebase plan.

Dependent rebase execution already delegated branch refresh work to
`@vannadii/devplat-worktrees` and returned the raw sync results. It now also
derives the returned plan's `conflictClassification` from sync results that
report `conflictsDetected`, so downstream OpenClaw tool output and operator
surfaces receive the concrete affected branches and `resolve-conflicts` next
action without reinterpreting raw worktree records.
