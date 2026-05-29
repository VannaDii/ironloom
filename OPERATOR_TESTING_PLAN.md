# Operator Testing Plan

This document now serves as both:

- the live operator testing guide
- the target operator-experience product spec used to close implementation gaps

## 1. Objective

Deliver a Discord-first operator experience where a human operator can run the full project lifecycle from anywhere (mobile-first), with minimal intervention, strict auditability, and strong standards enforcement.

## 2. Current Reality vs Target

## 2.1 Current reality

- Discord commands exist mainly for already-bound threads.
- Initial research/spec bootstrap still requires OpenClaw/agent initiation.
- `/new-project` exists, but Discord-only bootstrap remains incomplete because repository auto-resolution/auto-creation and immediate discovery-thread kickoff are not fully implemented.

## 2.2 Target state

- Operator uses Discord only for end-to-end control.
- `/new-project --repo <repo> --project <name>` bootstraps a project.
- Threads are project-bound and phase-bound, lazy-created, and auditable.
- Role-based controls gate mutating actions.
- Release completes with canonical summary, links, and health metrics.

## 3. Core UX Principles

- Continuous progress with minimal human intervention.
- Rigid standards/completeness enforcement when strictness is on.
- Mobile-first readability and command consistency.
- Fail-closed context safety for all mutating actions.
- GitHub remains source of truth; Discord is operator control plane.

## 4. Global Command Design

- Command names use kebab-case.
- New commands use named options only (no positional args).
- Slash + button role checks use dynamic role evaluation at action time.
- Non-mutating commands available broadly; mutating commands are role-restricted.

## 5. Role Model

Global role mapping (server-wide):

- `project-operator`
- `spec-approver`
- `merge-approver`

Day-one restrictions:

- `/new-project`, `/open-project`, `/project-settings`, `/project-settings-history` (detailed), `/cancel-project`, `/resume-project`: `project-operator`
- spec/slice approvals: `spec-approver`
- merge + release approvals: `merge-approver` (plus `project-operator` for release button)

Permission-denied responses:

- in-thread message
- includes caller, attempted action, required role, project/thread context
- written as durable audit artifact

## 6. Project Identity and Binding

- Multiple projects per repo are allowed.
- Project name required and unique per repo.
- Project name length: 3-30 chars.
- All messages and threads are bound to project context.
- Mutating actions fail closed on missing/mismatched project context.
- Failure message includes expected vs detected context and suggested recovery `/open-project --repo ... --project ...`.

## 7. Lifecycle Model

Phase order:

1. Spec Draft
2. Spec Refinement/Approval
3. Slicing
4. Slicing Refinement/Approval
5. Slice Implementation
6. Slice PR Creation
7. Slice PR Review
8. Slice Approval Request
9. Slice PR Merge
10. Next Slice or Release
11. Completion message with links and activity summary

Phase behavior:

- Each phase posts one primary phase message.
- Updates are threaded under that message.
- Phase thread accepts only phase-appropriate slash commands.
- Each phase has one pinned phase-contract message (updated in place).

## 8. End-to-End Operator Flow

## 8.1 Project bootstrap

Operator runs:

- `/new-project --repo <repo_name> --project <project_name> [--quality-strictness on|off]`

Rules:

- `GITHUB_REPO` should not be required as standard static config.
- Resolve repo via connected GitHub account/credentials.
- If no account/config: error prompting GitHub config.
- If repo exists: use it.
- If missing and create permission exists: auto-create.
- If missing and no permission: notify operator to create repo first.
- On auto-create, kickoff message includes repo URL + creation actor.

Discovery kickoff:

- System immediately creates/binds discovery thread.
- Posts prompt: describe what to build.
- Clarification loop is open-ended until operator runs `/research`.

## 8.2 Discovery and research controls

Allowed commands:

- `/redirect <direction_prompt>` (replaces prior direction)
- `/consider <url>` (queues as input for next research update)
- `/alts` and `/alternatives` (3 alternatives with effort+risk)
- `/cancel` (current thread only, `project-operator`)
- `/spec`
- `/research`

`/alts` output requirements:

- effort: both S/M/L and time range
- risk: level + type tags: `technical`, `product`, `security`, `dependency`, `operational`

`/spec` behavior:

- posts research summary with `Approve` action
- all research commands remain available before approval
- if research slash command is used after summary, prior approval button is removed
- fallback `/approve-this` allowed if button fails/expires

## 8.3 Approval and workstream start

- `Approve` starts speccing and workstream.
- Phases proceed with thread-bound controls.
- Slice plan approval prompts merge mode selection:
  - `Auto Approve Slices`
  - `Manual Merge Approval`
- Choice locks for project until changed in `/project-settings`.

## 8.4 Slice execution and approvals

- Parallel by default with max 3 active slices (configurable).
- Queue policy: FIFO.
- If active slice blocks, it frees a slot.
- System may scan forward to next dependency-ready slice.
- Dependency order cannot be violated.
- Status must disclose when FIFO is bypassed and why.

Manual mode:

- Per-slice checkpoint requiring approval: merge only.

Mode changes mid-project:

- apply immediately to in-flight/unmerged PRs
- manual->auto: unmerged PRs auto-merge once gates green
- auto->manual: unmerged PRs move to awaiting merge approval

## 8.5 Gate failures and stalls

Gate failure policy:

- agent iterates until gate succeeds
- if unresolved due to external config limitations, notify operator with details and suggested resolution
- continue unrelated slices/work while blocked path waits

Resume policy:

- operator runs `/resume` in blocked/stalled thread
- preflight includes:
  - last heartbeat timestamp
  - last successful step
  - blocker/stall reason
  - safe-to-resume yes/no
- even if not safe, operator-directed resume proceeds
- forced unsafe resume requires:
  - `spec-approver` for spec threads
  - `merge-approver` for code threads

Stall detection:

- no heartbeat/telemetry for 30s, or process exit without completion
- wait for operator action (no auto-recovery)

## 8.6 Spec/research re-entry from later phases

- `/spec` is allowed from later phases and globally pauses active work.
- `/research` from any project-bound thread also globally pauses active implementation/PR work.
- Post-research resumption requires explicit approval (`Approve` button; `/approve-this` fallback).
- Completed/merged slices are re-validated against revised spec.
- Non-compliant slices create remediation proposals requiring `spec-approver` approval.

## 8.7 Completion and release

Completion definition:

- all approved slice PRs merged to default branch
- constraints/standards satisfied
- no missing implementations/outstanding issues

Release command:

- `/release-project`
- requires dedicated approval button in addition to command
- button click allowed by `merge-approver` or `project-operator`
- preconditions re-validated at click time:
  - all required slices merged
  - all required gates pass
  - no blocked threads

If approval fails preconditions:

- remove button
- regenerate release request
- include diff since last release attempt:
  - newly merged PRs
  - gate status changes
  - blocker changes
  - settings/approval-mode changes

## 9. Project-Level Cancel/Resume

- `/cancel-project` (`project-operator`) pauses all activity and posts per-phase cancellation summaries.
- `/resume-project` (`project-operator`) resumes all previously active threads.
- `/resume-project` runs global preflight; if issues found, second confirmation required (button or `/resume-project --force`).
- force-resume notifies impacted roles.

## 10. Thread and Continuation Rules

- Threads are lazily created per phase.
- Phase contract is pinned and auto-updated.
- Contract updates post in-thread changelog and mention impacted roles.
- `/phase-contract` available to all participants.
- Even with guidance disabled, `/phase-contract` always shows allowed commands + locked markers + required roles.

Post-release:

- phase threads auto-archive and lock
- non-mutating commands still work in locked threads
- mutating attempts get standardized locked-thread message with recommended next action

Reopen behavior:

- `/open-project --repo ... --project ... --intent maintenance|bugfix|new-feature`
- intent is required and immutable per reopened run
- try unarchive first
- if unarchive fails, create continuation thread with explicit notice and backlinks
- continuation suffix format: `-N`, starts at `-1`, global counter per project, never resets
- summary shows counter and last continuation event (thread + reason)

## 11. Settings Model

`/project-settings` (interactive + flags; named options only):

- approval mode
- per-slice merge approval mode
- phase-transition notifications
- default branch
- quality strictness profile (boolean)
- show command guidance (`show_command_guidance`, default `on`)
- release `@everyone` setting (default `on`)
- max parallel slices (default `3`)

Behavior:

- applies immediately to in-flight threads
- interactive edits auto-apply
- confirmations are batched (5s debounce)
- batch includes successful + rejected changes
- invalid change in batch => atomic rollback of entire batch
- on rollback, interactive controls auto-reopen with invalid field highlighted

`/project-settings-history`:

- append-only immutable history
- detailed mode: `project-operator` only
- public summary mode: all participants
- public fields: timestamp, actor, changed keys, new effective values (sensitive redacted)

Every settings change:

- emits durable config-version artifact
- `/show-status` shows current config version

## 12. Messaging and Visibility

## 12.1 Full status section order (strict)

1. identity header
2. phase
3. current action
4. blockers
5. approvals
6. links
7. next actions

Identity header always includes:

- repo
- project name
- phase
- thread kind

Links section (when available):

- spec PR
- active slice PR
- merged slice PRs
- latest artifact
- workflow run
- published assets

Next actions section:

- show all possible actions
- include locked/denied markers and required roles

`show_command_guidance`:

- if off, hide action hints in normal messages
- `/phase-contract` remains authoritative and still shows allowed commands/locks

## 12.2 Participant visibility

Non-role participants can see:

- repo
- project name
- current phase
- phase status
- blocked/unblocked state (no blocker details)
- pending approvals count
- operational health summaries
- unmet prerequisite checklists

Non-role participants cannot see:

- sensitive artifact links/details
- ETA

`/project-summary`:

- available for all participants (read-only)
- default: all phases condensed with footer listing phase filter commands
- supports phase filtering
- includes role-user extras (for role users): config version, strictness, approval mode state, audit links
- includes release unmet-prerequisites block when release is not possible
- prerequisite ordering by critical path
- includes next command suggestions with role markers
- shows button alternatives only when currently available

## 13. Mentions and Notifications

- Mention specific roles by default.
- `@everyone` only on successful release if enabled in project settings.
- Always mention impacted roles on blockers and approval-required events.
- Blocked spec -> mention `spec-approver`.
- Blocked implementation/PR -> mention `merge-approver`.

## 14. Degraded Contract Sync

If contract update fails:

- post fallback contract message
- mark thread `contract-sync-degraded`
- continue operations (non-blocking)
- auto-mention impacted roles
- rate-limit degraded mentions: 15m per thread

When recovered:

- immediate `sync restored` message
- mention impacted roles
- include degradation start time + duration
- persist durable audit
- include degradation notes in release summary and precondition checklist as non-blocking informational items visible to all

## 15. Slice Naming Rules

Primary format:

- prefer `verb-object-scope`
- 3-7 words
- must include action verb, concrete object, scope term
- reject vague terms (e.g., misc, stuff)
- immutable once created
- unique per project

Generation policy:

- regenerate until valid/unique
- max 20 attempts
- catalog failed terms and avoid reusing bad terms
- fallback pattern if all attempts fail:
  - `do-slice-<scope>-<n>` (scope inferred automatically)
- mark `fallback-name-used` in audit/status
- release not blocked by fallback names
- release summary lists fallback names

## 16. Timing and Responsiveness

- interaction acknowledge target: within 1 second
- if full response not ready, include estimate (including variable estimates like "when job completes")
- Discord messages use relative-time tags only
- audit artifacts keep absolute UTC timestamps

## 17. Atomicity and Failure Behavior

`/new-project` is atomic:

- if setup step fails, roll back partial state
- on rollback failure, require manual cleanup and inform operator
- failure summary includes partial resources created:
  - repo
  - project record key
  - thread IDs
  - artifact IDs
- include clickable links to partial resources
- sensitive links visible only to role users

## 18. Operational Health and Release Summary

Release summary is canonical:

- one canonical message in dedicated project-management thread
- pinned automatically
- short link-back notices posted to each phase thread

Required release summary fields:

- repo
- branch
- merged PR links
- spec link
- slice list/status
- gate results
- unresolved risks
- follow-up recommendations
- downloadable/published asset links
- operational health section

Operational health section includes:

- blocker incidents
- stall incidents
- contract degradation incidents
- both lifetime and current-run counts
- links to incident threads/artifacts (redact sensitive links for non-role users)

## 19. Implementation Gap Matrix

## 19.1 High-priority gaps

1. Remaining `/new-project` bootstrap parity gaps: GitHub-account repo resolution/auto-create and discovery-thread kickoff flow
2. Remaining `/open-project` reopen parity gaps: dashboard/continuation-thread lifecycle and archived-thread reopen behavior
3. Remaining project-level command gaps: cancellation summaries per phase thread
4. Missing phase-contract pinned message lifecycle
5. Remaining project settings/config-version gaps: interactive controls, batched rollback semantics, and in-flight propagation guarantees
6. Remaining strict project-bound context gaps: bind all project messages/threads to project context (not mutating-only paths)
7. Missing release precondition revalidation + approval-button regeneration diff flow
8. Missing canonical release summary with operational health and visibility tiers

## 19.2 Secondary gaps

1. Discovery clarifications until `/research`
2. Research/spec global pause/re-entry behavior
3. Parallel slice scheduler with dependency-aware FIFO bypass transparency
4. Degraded contract-sync lifecycle and mention throttling
5. Slice naming rule engine + fallback tracking

## 20. Prioritized Delivery Plan

## Phase A: Bootstrap and security envelope

- add `/new-project`, `/open-project`, `/project-summary`
- enforce global role mapping + dynamic checks
- enforce project/thread context lock for all mutating actions
- add project identity header in status messages

Acceptance:

- operator can create/open projects from Discord only
- permission denials are in-thread + durable audit
- cross-project command misuse fails closed

## Phase B: Phase model and controls

- implement lazy phase thread creation
- implement pinned phase-contract and `/phase-contract`
- implement discovery loop commands and `/research` transition
- implement `/spec` approval summary + button lifecycle

Acceptance:

- every phase has bound thread + contract
- commands outside phase contract are refused clearly

## Phase C: Scheduling, gates, pauses, resumes

- implement parallel slices (max=3 default), strict FIFO with dependency scan-forward
- implement gate retry/blocked behavior and `/resume` diagnostics
- implement global pause/re-entry from `/spec` and `/research`

Acceptance:

- blocked slices free slots without dependency-order violations
- stall detection and resume preflight work as specified

## Phase D: Project settings and audit governance

- implement `/project-settings` interactive + atomic batched apply (5s)
- implement `/project-settings-history` (detailed + public summary)
- emit config-version artifacts and display current version in status

Acceptance:

- settings apply immediately to in-flight threads
- invalid batch rolls back atomically and reopens controls

## Phase E: Release orchestration

- implement `/release-project` + dedicated approval button
- revalidate preconditions at click time
- regenerate request with diff if preconditions fail
- implement canonical pinned release summary and thread notices

Acceptance:

- release cannot proceed with unmet blockers/gates/slices
- summary includes all required fields and operational health

## 21. Operator Acceptance Tests

1. New project bootstrap from Discord only

- run `/new-project --repo ... --project ...`
- verify repo handling rules and discovery thread kickoff

2. Discovery-to-spec transition

- run `/redirect`, `/consider`, `/alts`, `/spec`, `Approve`
- verify approval button lifecycle and fallback behavior

3. Role enforcement

- attempt restricted commands with missing role
- verify in-thread denial + durable audit

4. Project context safety

- issue mutating command from wrong thread
- verify fail-closed with expected/detected context + recovery suggestion

5. Slice scheduling behavior

- create blocked + dependency-bound slices
- verify slot freeing, scan-forward, and transparency messages

6. Resume diagnostics

- force stall and run `/resume`
- verify preflight fields and forced resume policy

7. Settings governance

- edit settings interactively
- verify 5s batch summary, rollback on invalid, config-version artifact emission

8. Release preconditions and regeneration

- attempt premature `/release-project`
- verify unmet checklist + role markers + next commands
- verify regenerated request diff after changes

9. Visibility tiers

- validate `/project-summary` output as role user vs non-role user
- verify redactions and allowed public fields

10. Post-release lifecycle

- verify archive+lock behavior
- verify non-mutating commands still work
- verify reopen with intent and continuation counter behavior

## 22. Readiness Criteria

Platform is operator-ready when:

- full lifecycle can be run via Discord-only controls
- all role and context safety checks are enforced and audited
- release path is deterministic and policy-complete
- visibility model works correctly for role and non-role participants
- acceptance tests above pass repeatedly across multiple projects
