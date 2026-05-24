# Operator Expectation Gaps Checklist

This checklist is a full conversion of [OPERATOR_TESTING_PLAN.md](/workspace/devplat/OPERATOR_TESTING_PLAN.md) into actionable work items.

Usage rules:

- Mark items complete only when implemented and validated.
- While completing items, update [operator-guide.md](/workspace/devplat/site/guide-docs/guides/operator-guide.md) and related docs.
- Re-check this checklist against [OPERATOR_TESTING_PLAN.md](/workspace/devplat/OPERATOR_TESTING_PLAN.md) after each milestone; if any requirement is missing, add it here immediately.

## 1. Objective Alignment

- [ ] Deliver Discord-first operator control for full lifecycle.
- [ ] Ensure mobile-first operation and readability.
- [ ] Minimize required human intervention while preserving control points.
- [ ] Preserve strict auditability for all lifecycle-changing actions.
- [ ] Preserve GitHub as source of truth.

## 2. Current-to-Target Gap Closure

- [ ] Close gap: bootstrap currently requires OpenClaw/agent initiation.
- [ ] Add full Discord-only bootstrap path.
- [ ] Close gap: no `/new-project` currently exists.
- [ ] Ensure release produces canonical summary with required links and health metrics.

## 3. Global Command Contract

- [ ] Enforce kebab-case command naming.
- [x] Enforce named options only for new commands (no positional args).
- [x] Enforce dynamic role checks at action time for slash and button actions.
- [x] Keep non-mutating commands broadly available.
- [ ] Keep mutating commands role-restricted.

## 4. Roles and Permissions

- [x] Configure global role mappings: `project-operator`, `spec-approver`, `merge-approver`.
- [x] Restrict `/new-project` to `project-operator`.
- [x] Restrict `/open-project` to `project-operator`.
- [x] Restrict `/project-settings` to `project-operator`.
- [x] Restrict `/project-settings-history` detailed mode to `project-operator`.
- [x] Restrict `/cancel-project` to `project-operator`.
- [x] Restrict `/resume-project` to `project-operator`.
- [x] Restrict spec/slice approvals to `spec-approver`.
- [x] Restrict merge approvals to `merge-approver`.
- [x] Allow release approval button click by `merge-approver` or `project-operator`.
- [x] On permission-denied, post in-thread message.
- [x] Include caller, attempted action, required role, and project/thread context in denial message.
- [x] Persist permission-denied events as durable audit artifacts.

## 5. Project Identity and Context Safety

- [ ] Support multiple concurrent projects per repo.
- [ ] Require project name on creation.
- [ ] Enforce project name uniqueness per repo.
- [x] Enforce project name length 3-30 characters.
- [ ] Bind all project messages/threads to project context.
- [x] Require explicit project context for all mutating actions.
- [x] Fail closed on missing/mismatched project context.
- [x] Include expected and detected context in mismatch failures.
- [x] Include recovery suggestion: `/open-project --repo ... --project ...`.

## 6. Lifecycle Phase Model

- [ ] Implement and expose phase: Spec Draft.
- [ ] Implement and expose phase: Spec Refinement/Approval.
- [ ] Implement and expose phase: Slicing.
- [ ] Implement and expose phase: Slicing Refinement/Approval.
- [ ] Implement and expose phase: Slice Implementation.
- [ ] Implement and expose phase: Slice PR Creation.
- [ ] Implement and expose phase: Slice PR Review.
- [ ] Implement and expose phase: Slice Approval Request.
- [ ] Implement and expose phase: Slice PR Merge.
- [ ] Implement and expose phase: Next Slice or Release.
- [ ] Implement and expose phase: Completion message with links/activity summary.
- [ ] For each phase, post one primary phase message.
- [ ] Thread all updates under that primary phase message.
- [ ] Accept only phase-appropriate commands in each phase thread.
- [ ] Keep one pinned phase-contract message per active phase thread.
- [ ] Update pinned phase-contract in place.

## 7. `/new-project` Bootstrap

- [ ] Implement `/new-project --repo <repo_name> --project <project_name> [--quality-strictness on|off]`.
- [ ] Remove dependency on static `GITHUB_REPO` for standard runtime bootstrap.
- [ ] Resolve repo using connected GitHub credentials/account.
- [ ] If no GitHub account/config, fail with operator-facing config guidance.
- [ ] If repo exists, use it.
- [ ] If repo missing and create permission exists, auto-create repo.
- [ ] If repo missing and create permission does not exist, notify operator to create it first.
- [ ] If auto-created, include repo URL and creation actor in kickoff message.
- [ ] Immediately create and bind discovery thread on success.
- [ ] Immediately prompt operator to describe what to build.
- [ ] Keep clarification loop open-ended until operator runs `/research`.

## 8. Discovery and Research Controls

- [ ] Implement `/redirect <direction_prompt>` in discovery flow.
- [ ] Ensure `/redirect` replaces previous direction (not append).
- [ ] Persist previous direction in audit history.
- [ ] Post concise in-thread direction-change summary.
- [ ] Implement `/consider <url>`.
- [ ] Allow any URL for `/consider`.
- [ ] Queue `/consider` inputs for next research update (not immediate inline fetch summary).
- [ ] Implement `/alts` aliasing `/alternatives`.
- [ ] Return exactly 3 alternatives by default.
- [ ] Include effort estimates in S/M/L.
- [ ] Include effort estimates in time ranges.
- [ ] Include risk level per alternative.
- [ ] Include risk types per alternative: technical, product, security, dependency, operational.
- [ ] Implement `/cancel` for current thread only.
- [ ] Restrict `/cancel` to `project-operator`.
- [ ] On thread cancel, post next recommended actions and links to last artifacts.
- [ ] Implement `/spec` availability in discovery.
- [ ] Implement `/research` availability in discovery.

## 9. Spec Trigger and Approval UX

- [ ] On `/spec`, post research summary with `Approve` action.
- [ ] Keep research commands available before approval.
- [ ] If additional research command used, remove stale prior approval button.
- [ ] On approval button failure/expiry, provide `/approve-this` fallback in-thread.
- [ ] Restrict fallback `/approve-this` with same `spec-approver` permission and identical audit semantics.
- [ ] On approval, start speccing/workstream immediately.

## 10. Spec/Research Re-entry and Global Pause

- [ ] Allow `/spec` from later phases.
- [ ] On `/spec` from later phase, globally pause active work.
- [ ] Allow `/research` from any project-bound thread.
- [ ] On `/research` re-entry, globally pause active implementation/PR activity.
- [ ] Use approval button to resume after re-entered research.
- [ ] Support `/approve-this` fallback if resume approval button fails.
- [ ] Re-validate completed/merged slices against revised spec automatically.
- [ ] Create remediation proposals for non-compliant merged slices.
- [ ] Require `spec-approver` approval for remediation proposals.

## 11. Slice Planning, Queueing, and Concurrency

- [ ] Default to parallel slice execution.
- [ ] Set default max parallel slices = 3.
- [ ] Make max parallel slices configurable in project settings.
- [ ] Enforce FIFO queue policy.
- [ ] When an active slice blocks, free its slot.
- [ ] Allow scan-forward to next dependency-ready slice when FIFO head is dependency-blocked.
- [ ] Never violate dependency order.
- [ ] Explicitly report FIFO bypass events in status.
- [ ] Include which dependency blocked skipped slice.
- [ ] Include which slice started instead.
- [ ] Make dependency-bypass transparency visible to all participants.
- [ ] Keep strict FIFO reprioritization policy (no manual reprioritize command).

## 12. Slice Approval Modes

- [ ] At slice-plan approval, present explicit mode choice buttons:
- [ ] `Auto Approve Slices`.
- [ ] `Manual Merge Approval`.
- [ ] Lock selected mode for project until changed in `/project-settings`.
- [ ] In manual mode, require approval at merge checkpoint only.
- [ ] Apply mode changes immediately to open unmerged PRs.
- [ ] On auto->manual change, move open unmerged PRs to awaiting merge approval.
- [ ] On manual->auto change, auto-merge open unmerged PRs when gates are green.

## 13. Gate Failures, Stalls, and Resume

- [ ] On gate failure, iterate corrective attempts until gate succeeds.
- [ ] If unresolved due to external configuration limits, notify operator with details and suggested resolution.
- [ ] Continue unrelated slices/work while blocked path waits.
- [ ] Detect stalls on no heartbeat/telemetry for 30 seconds.
- [ ] Detect stalls on process exit without completion.
- [ ] Wait for operator action after stall (no auto-recovery).
- [ ] Use `/resume` in blocked/stalled thread to recover.
- [ ] On `/resume`, run preflight with:
- [ ] last heartbeat timestamp.
- [ ] last successful step.
- [ ] blocker/stall reason.
- [ ] safe-to-resume yes/no.
- [ ] Always resume when operator commands resume, even if not safe.
- [ ] If not-safe resume in spec context, require `spec-approver` authorization.
- [ ] If not-safe resume in code context, require `merge-approver` authorization.
- [ ] On `/resume`, post all-clear or updated blocker state after verification.
- [ ] Require manual `/resume` retries when blocker remains (no automatic retry loop).

## 14. Project-Level Cancel and Resume

- [ ] Implement `/cancel-project`.
- [ ] On `/cancel-project`, immediately pause all activity.
- [ ] Post cancellation summary per phase thread.
- [ ] Implement `/resume-project`.
- [ ] On `/resume-project`, run global preflight (repo access, branch state, PR status, gate health, blocker inventory).
- [ ] Post single resume readiness report.
- [ ] If preflight has issues, require second confirmation.
- [ ] Support second confirmation via button.
- [ ] Support second confirmation via `/resume-project --force` fallback.
- [ ] Restrict force resume to `project-operator`.
- [ ] On force resume, notify impacted roles automatically.
- [ ] On resume, restart from latest durable artifact checkpoints.
- [ ] Post resumed checkpoint ID/timestamp and persist audit.

## 15. Release Orchestration

- [ ] Implement `/release-project`.
- [ ] Require dedicated release approval button in addition to command.
- [ ] Re-validate release preconditions at button click time.
- [ ] Precondition: all required slices merged.
- [ ] Precondition: all required gates pass.
- [ ] Precondition: no blocked threads (any thread blocked and not resumed).
- [ ] If release preconditions fail at approval click:
- [ ] remove prior approval button.
- [ ] regenerate release request message.
- [ ] include diff since last release attempt:
- [ ] newly merged PRs.
- [ ] gate status changes.
- [ ] blocker thread changes.
- [ ] settings/approval-mode changes.
- [ ] If release attempted too early, include unmet prerequisites checklist with links.
- [ ] Include role-required markers for who can unblock each prerequisite.
- [ ] Include next-command suggestions for each unmet prerequisite.

## 16. Completion Definition and Summary

- [ ] Enforce completion condition: all approved slice PRs merged to default branch.
- [ ] Enforce completion condition: defined constraints/standards satisfied.
- [ ] Enforce completion condition: no outstanding issues or missing implementations.
- [ ] Produce canonical final summary in dedicated project-management thread.
- [ ] Pin canonical summary.
- [ ] Post short link-back notices in each phase thread.
- [ ] Include required summary fields:
- [ ] repo.
- [ ] branch.
- [ ] merged PR links.
- [ ] spec link.
- [ ] slice list/status.
- [ ] gate results.
- [ ] unresolved risks.
- [ ] follow-up recommendations.
- [ ] downloadable/published asset links.

## 17. Operational Health Reporting

- [ ] Include operational health section in release summary.
- [ ] Include blocker incidents.
- [ ] Include stall incidents.
- [ ] Include contract degradation incidents.
- [ ] Show both project-lifetime totals and current-run totals.
- [ ] Link each count to incident thread/artifact details.
- [ ] Apply redaction rules for sensitive links when viewer lacks roles.
- [ ] Keep operational health section visible to all participants.

## 18. Thread Lifecycle and Continuations

- [ ] Lazily create phase threads as phases start.
- [ ] Auto-post and pin phase contract in each phase thread.
- [ ] Keep phase contract auto-updated when settings change.
- [ ] On phase contract update, post visible changelog message.
- [ ] Mention impacted roles on permission/approval behavior changes.
- [ ] Support `/phase-contract` command for all participants.
- [ ] Keep `/phase-contract` authoritative even when command guidance is off.
- [ ] Show contract-allowed commands in `/phase-contract` with lock markers and required roles.
- [ ] Auto-archive phase threads on successful release.
- [ ] Lock phase threads post-release.
- [ ] Keep non-mutating commands functional in locked threads.
- [ ] On mutating command in locked thread, post standardized in-thread response with recommended next action.

## 19. `/open-project` Reopen Semantics

- [x] Implement `/open-project --repo ... --project ... --intent maintenance|bugfix|new-feature`.
- [x] Require `--intent` with no default.
- [ ] Keep reopen intent immutable for the reopened run.
- [ ] On open, post project dashboard summary:
- [ ] phase.
- [ ] blockers.
- [ ] active slices.
- [ ] pending approvals.
- [ ] key links.
- [ ] Route commands into project-bound threads.
- [ ] Reopen archived threads by default.
- [ ] If thread reopen fails, create continuation thread and notify explicit reopen failure with links to prior context.
- [ ] Preserve original thread type/phase labels in continuation thread.
- [ ] Add backlink to original thread.
- [ ] Apply continuation naming suffix `-N`.
- [ ] Start continuation counter at `-1`.
- [ ] Use global continuation counter per project (not per thread lineage).
- [ ] Persist continuation counter across release/archive cycles (never reset).
- [ ] Store continuation counter changes in versioned config/audit artifacts.
- [ ] Show continuation counter to all users in summaries.
- [ ] Show last continuation event (thread + reason) in summaries.

## 20. Settings and Config Governance

- [ ] Implement `/project-settings` with interactive mode and named-option flags.
- [ ] Default to interactive-first UX on mobile.
- [ ] If controls time out, auto-repost fresh controls.
- [ ] Reset timed-out controls to current persisted settings.
- [ ] Auto-apply settings edits (no explicit save required).
- [ ] Batch settings confirmations with 5s debounce.
- [ ] Include successful and rejected changes in same batch summary.
- [ ] On any invalid setting in batch, roll back whole batch atomically.
- [ ] On rollback, auto-reopen controls with invalid field highlighted.
- [ ] Apply settings immediately to in-flight phases/threads.
- [ ] Implement settings keys:
- [ ] approval mode.
- [ ] per-slice merge approval.
- [ ] phase-transition notifications.
- [ ] default branch.
- [ ] quality strictness boolean.
- [ ] max parallel slices (default 3).
- [ ] `show_command_guidance` (default on).
- [ ] release `@everyone` toggle (default on).
- [ ] Emit durable config-version artifact on every settings change.
- [ ] Include current config version in status output.

## 21. Settings History

- [ ] Implement `/project-settings-history`.
- [ ] Keep history append-only and immutable.
- [x] Detailed history mode restricted to `project-operator`.
- [ ] Public summary mode available to all participants.
- [ ] In public summary mode, include:
- [ ] timestamp.
- [ ] actor.
- [ ] changed setting keys.
- [ ] new effective values with sensitive values redacted.

## 22. Messaging Format and Content

- [ ] Enforce strict full-status section order:
- [ ] identity header.
- [ ] phase.
- [ ] current action.
- [ ] blockers.
- [ ] approvals.
- [ ] links.
- [ ] next actions.
- [ ] In identity header include:
- [ ] repo.
- [ ] project name.
- [ ] phase.
- [ ] thread kind.
- [ ] In links section include when available:
- [ ] spec PR.
- [ ] active slice PR.
- [ ] merged slice PRs.
- [ ] latest artifact.
- [ ] workflow run.
- [ ] published assets.
- [ ] In next actions show all possible commands (not only authorized ones).
- [ ] Show locked/denied markers and required roles for unavailable actions.
- [ ] For `/show-last-artifact`, add one-line “why this matters now” interpretation summary.
- [ ] For `/show-status`, include project identity header at top every time.
- [ ] For status payloads, always full detail (no condensed default).

## 23. Command Guidance and Discoverability

- [ ] Support `show_command_guidance` setting across all message types.
- [ ] When `show_command_guidance=off`, hide command guidance hints in normal messages.
- [ ] Even with guidance off, `/phase-contract` must continue to show full allowed command contract.
- [ ] In guidance-enabled mode, show button alternatives only when currently available.
- [ ] In checklist/next-action messaging, include slash + button alternatives where supported.
- [ ] Keep `/phase-contract` as single guaranteed source of command discoverability when guidance is off.
- [ ] Include link references from summaries to current phase-contract messages.

## 24. Visibility and Redaction Model

- [x] Implement `/project-summary` read-only command for all participants.
- [x] Restrict `/open-project` to `project-operator` only.
- [ ] For non-role participants, `/project-summary` shows:
- [ ] repo.
- [ ] project name.
- [ ] current phase.
- [ ] phase status.
- [ ] blocked/unblocked status without blocker details.
- [ ] pending approval counts.
- [ ] Exclude ETA for non-role participants.
- [ ] Redact sensitive artifact links for non-role participants.
- [ ] Allow full continuation event reason visibility to all users.
- [ ] Make unmet release prerequisites visible to all users.
- [ ] Make non-blocking degradation notes visible to all users.
- [ ] For role users, include in summary:
- [ ] current config version.
- [ ] strictness flag state.
- [ ] active approval mode.
- [ ] pending approval-mode impact on open PRs.
- [ ] audit artifact links.

## 25. `/project-summary` UX

- [ ] Default summary view: all phases condensed.
- [ ] Include footer listing phase filters/operators can request.
- [ ] Support phase filtering options via named option style.
- [ ] Include one-tap command examples in footer for each phase filter.
- [ ] Include unmet release prerequisites block whenever release is not possible.
- [ ] Order unmet prerequisites by critical-path impact.
- [ ] Keep prerequisite descriptions strictly factual.
- [ ] Include next command suggestions with role-required markers.

## 26. Mentions and Notification Policy

- [ ] Mention specific roles by default; avoid `@here`.
- [ ] Use `@everyone` on successful release only when project setting enabled.
- [ ] Default release `@everyone` setting to on.
- [ ] Follow setting automatically (no extra notify confirmation step).
- [ ] Always mention blockers/approvals according to impacted role.
- [ ] For blocked spec work, mention `spec-approver`.
- [ ] For blocked implementation/PR work, mention `merge-approver`.
- [ ] For new related activity on blocked threads, auto-mention impacted role again.
- [ ] Mention only impacted roles (not both by default).

## 27. Contract Sync Degradation

- [ ] On pinned phase-contract update failure, post temporary fallback contract message.
- [ ] Mark thread state as `contract-sync-degraded`.
- [ ] Continue operations while degraded (non-blocking).
- [ ] Auto-mention impacted roles on degradation warnings.
- [ ] Rate-limit degraded warning mentions to once per thread per 15 minutes.
- [ ] On recovery, post immediate `sync restored` message.
- [ ] Mention impacted roles immediately on recovery.
- [ ] Include degradation start timestamp and total duration in recovery message.
- [ ] Persist degraded and recovered events in durable audit artifacts.
- [ ] Include degradation incidents in release summary operational health.
- [ ] Keep degradation notes informational only (non-blocking for release).

## 28. Slice Naming Rules

- [ ] Generate human-friendly slice names.
- [ ] Keep slice names unique within project.
- [ ] Keep slice names immutable.
- [ ] Prefer naming format `verb-object-scope`.
- [ ] Enforce clarity checks:
- [ ] includes action verb.
- [ ] includes concrete object.
- [ ] includes scope term.
- [ ] excludes vague words like misc/stuff.
- [ ] 3-7 words.
- [ ] Regenerate names until valid and unique.
- [ ] Cap at 20 generation attempts.
- [ ] Catalog failed terms and avoid reuse of bad terms across attempts.
- [ ] If attempts exhausted, auto-fallback to deterministic safe name.
- [ ] Use fallback pattern `do-slice-<scope>-<n>` with auto-inferred scope.
- [ ] Mark `fallback-name-used` in status/audit.
- [ ] Do not block release because of fallback names.
- [ ] Include fallback slice names in final release summary.

## 29. Responsiveness and Timing

- [ ] Acknowledge operator interactions within 1 second target.
- [ ] If full result not ready, include response time estimate.
- [ ] Allow variable estimate wording (e.g., "when job completes").
- [ ] Show relative-time tags in Discord messages only.
- [ ] Persist absolute UTC timestamps in audit artifacts.

## 30. Atomicity and Recovery for `/new-project`

- [ ] Make `/new-project` setup atomic across repo/project/thread bind operations.
- [ ] Roll back partial setup if any setup step fails.
- [ ] If rollback partially fails, require manual cleanup and notify operator.
- [ ] Failure summary must include partial resources created:
- [ ] repo.
- [ ] project record key.
- [ ] thread IDs.
- [ ] artifact IDs.
- [ ] Include clickable links to partial resources in failure message.
- [ ] Redact sensitive links for non-role users.
- [ ] Provide manual cleanup steps in message (no dedicated cleanup command).

## 31. Post-Release Locking and Reopen Flow

- [ ] Lock phase threads on release.
- [ ] Keep non-mutating commands available in locked threads.
- [ ] On mutating command in locked thread, post standardized in-thread notice.
- [ ] Include recommended next action in locked-thread notice.
- [ ] Include role markers for suggested actions in locked-thread notice.

## 32. Read-Only/Public Command Surface

- [ ] Keep `/phase-contract` available to all participants.
- [ ] Keep `/project-summary` available to all participants.
- [ ] Keep `/show-status` and `/show-last-artifact` non-mutating access available where thread context allows.

## 33. Release Preconditions in Summaries

- [ ] Include unmet preconditions in `/project-summary` whenever release not possible.
- [ ] Include direct links to relevant threads/artifacts for each unmet item.
- [ ] Include role markers for each unblock path.
- [ ] Show all possible commands with locked markers (do not personalize suggestions per caller permissions).

## 34. Documentation Update Requirements (while implementing)

- [ ] Update [operator-guide.md](/workspace/devplat/site/guide-docs/guides/operator-guide.md) as each checklist area lands.
- [ ] Update [discord-workflows.md](/workspace/devplat/site/guide-docs/guides/discord-workflows.md) for new commands, role model, and thread contracts.
- [ ] Update [user-guide.md](/workspace/devplat/site/guide-docs/guides/user-guide.md) for Discord-only bootstrap and project lifecycle usage.
- [ ] Update [live-test-lab.md](/workspace/devplat/site/guide-docs/guides/live-test-lab.md) only where behavior overlaps with production operator controls.
- [ ] Update command reference docs to named-option format and kebab-case conventions.
- [ ] Keep docs aligned with final command set:
- [ ] `/new-project`.
- [ ] `/open-project`.
- [ ] `/project-summary`.
- [ ] `/project-settings`.
- [ ] `/project-settings-history`.
- [ ] `/cancel-project`.
- [ ] `/resume-project`.
- [ ] `/release-project`.
- [ ] `/phase-contract`.
- [ ] `/alternatives` and `/alts` alias.
- [ ] `/redirect`.
- [ ] `/consider`.
- [ ] `/research`.
- [ ] `/spec`.
- [ ] Ensure docs describe role checks for both slash commands and button actions.
- [ ] Ensure docs reflect visibility tiers for role and non-role participants.
- [ ] Ensure docs include release summary requirements and operational health section.

## 35. Acceptance Test Checklist

- [ ] New project bootstrap from Discord-only controls.
- [ ] Discovery/research loop with `/redirect`, `/consider`, `/alts`, `/research`, `/spec`.
- [ ] Approval button lifecycle and `/approve-this` fallback behavior.
- [ ] Role enforcement and in-thread denial + durable audit.
- [ ] Project-context fail-closed behavior and recovery hints.
- [ ] Slice scheduling behavior under dependencies and blocks.
- [ ] Gate failure iterative remediation behavior.
- [ ] Stall detection and `/resume` preflight fields.
- [ ] Project-level cancel and resume flows with force confirmation semantics.
- [ ] Settings interactive auto-apply, 5s batching, rollback-on-invalid.
- [ ] Config-version artifact generation on settings changes.
- [ ] Release precondition checks and regenerated request with diff.
- [ ] Canonical release summary with required fields.
- [ ] Operational health counts and incident links.
- [ ] Visibility/redaction differences for role vs non-role users.
- [ ] Post-release archive/lock and reopen/continuation behavior.

## 36. Readiness Completion Criteria

- [ ] Full lifecycle can be run with Discord-only controls.
- [ ] Role and context safety checks are consistently enforced and audited.
- [ ] Release flow is deterministic and policy-complete.
- [ ] Visibility model is correct for role and non-role users.
- [ ] Acceptance tests pass repeatedly across multiple projects.

## 37. Coverage Audit Against Testing Plan

- [ ] Verify every requirement in [OPERATOR_TESTING_PLAN.md](/workspace/devplat/OPERATOR_TESTING_PLAN.md) has a matching checklist item here.
- [ ] After each implementation milestone, re-run this coverage audit.
- [ ] If a requirement exists in testing plan but not checklist, add missing checklist items immediately.
- [ ] If checklist item diverges from testing plan intent, reconcile and update checklist + docs.
