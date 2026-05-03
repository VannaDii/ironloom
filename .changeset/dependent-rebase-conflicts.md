---
'@vannadii/devplat-branching': patch
'@vannadii/devplat-openclaw': patch
---

Project dependent-branch rebase conflicts back into the executed rebase plan.
Deepen OpenClaw worktree delegation with explicit Git-backed worktree tool
execution.
Record OpenClaw gate execution telemetry with actor, classification, and
next-action details.

Dependent rebase execution already delegated branch refresh work to
`@vannadii/devplat-worktrees` and returned the raw sync results. It now also
derives the returned plan's `conflictClassification` from sync results that
report `conflictsDetected`, so downstream OpenClaw tool output and operator
surfaces receive the concrete affected branches and `resolve-conflicts` next
action without reinterpreting raw worktree records.

OpenClaw worktree lifecycle tools now accept explicit `applyToDisk` input. Pure
record projection remains the default, while `applyToDisk: true` delegates
allocation, sync, and release to the Git-backed worktree service methods.

OpenClaw gate runs now record telemetry through the configured storage root.
The `run_gates` tool accepts an optional `actorId`, preserves the gate report
shape, and adds the persisted telemetry event id to its result so downstream
operators can audit pass/fail classification and next actions.

OpenClaw worktree tool `baseBranch` inputs now use the shared Git branch codec
instead of raw strings. Generated schemas also carry the shared Git branch
pattern so adapter decoding and external tool contracts reject flag-like,
whitespace-containing, or otherwise invalid branch refs before any Git-backed
worktree operation runs.
