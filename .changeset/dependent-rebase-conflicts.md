---
'@vannadii/devplat-branching': patch
'@vannadii/devplat-github': patch
'@vannadii/devplat-observability': patch
'@vannadii/devplat-openclaw': patch
'@vannadii/devplat-prs': patch
'@vannadii/devplat-queue': patch
'@vannadii/devplat-worktrees': patch
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
The Git-backed sync and release service methods now recompute the expected
worktree path from the configured root, task id, and branch name, then block
before Git execution when a caller-provided allocation path points somewhere
else.

OpenClaw gate runs now record telemetry through the configured storage root.
The `run_gates` tool accepts an optional `actorId`, preserves the gate report
shape, and adds the persisted telemetry event id to its result so downstream
operators can audit pass/fail classification and next actions.

OpenClaw Sonar quality-gate evaluations now record telemetry through the same
storage path. The `evaluate_sonar_quality_gate` tool accepts an optional
`actorId`, delegates threshold evaluation to the SonarCloud package, and returns
the persisted telemetry event id with project, coverage, blocking issue, status,
and next-action details.

OpenClaw worktree tool `baseBranch` inputs now use the shared Git branch codec
instead of raw strings. Generated schemas also carry the shared Git branch
pattern so adapter decoding and external tool contracts reject flag-like,
whitespace-containing, or otherwise invalid branch refs before any Git-backed
worktree operation runs.

GitHub workflow submission decisions now include the persisted telemetry event
id returned from the policy and REST submission boundary. OpenClaw pull request
update and merge tools continue to delegate to the PR/GitHub packages, but their
operator-facing output can now point directly at the durable GitHub workflow
telemetry record for accepted, blocked, dry-run, and rejected submissions.

Pull request records now decode `branchName` and `baseBranch` through the shared
Git branch codec and `updatedAt` through the shared ISO timestamp codec.
Generated PR and OpenClaw PR-tool schemas carry the same branch pattern and
date-time format, so unsafe refs and malformed timestamps are rejected before PR
update or merge submission.

Worktree allocation, sync, and release records now decode `updatedAt` through
the shared ISO timestamp codec, and sync result `baseBranch` values decode
through the shared Git branch codec. Generated worktree and embedded OpenClaw
schemas now expose the stricter date-time contract for persisted allocation
input while blocked worktree records can still preserve unsafe operator branch
input for auditability.

Queue task records now decode `updatedAt` and transition `occurredAt` values
through the shared ISO timestamp codec. Generated queue and OpenClaw task tool
schemas now expose date-time formats for durable lifecycle records and
transition-event history.

Telemetry events, audit records, and run summaries now decode event, audit, and
run boundary timestamps through the shared ISO timestamp codec. Generated
observability and OpenClaw telemetry-record schemas now expose date-time formats
for persisted telemetry and audit surfaces.
