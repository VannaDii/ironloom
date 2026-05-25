# Discord Workflows

## Control Plane Model

- Discord is the primary operator control plane through OpenClaw.
- GitHub remains the source of truth for specs, code state, reviews, and merges.
- Discord threads should expose lifecycle progress and approvals, not replace GitHub state.
- Discord transport and thread code should delegate into platform services rather than own business logic or contract normalization.
- `PLATFORM.md` defines the required operator workflow surface. This guide describes how to keep that surface thread-aware and auditable.

## Thread-Based Execution

- open a Discord thread for the work item
- bind the thread to the platform record
- use `spec`, `implementation`, and `pull-request` thread kinds to keep operator context explicit
- route implementation updates, audit events, approvals, retries, and rebase notices through the thread binding
- require every lifecycle-changing action to resolve its context from thread metadata
- fail closed when a command is issued without a valid thread binding

## Server and API Alignment

- normalize Discord REST access against `https://discord.com/api/v10`
- run production interactions through an outbound Discord Gateway session so the
  operator runtime can stay private and does not require public ingress
- provide an application id, public key, and bot token through runtime config or referenced secrets
- install the app with the `bot` and `applications.commands` scopes
- grant only the permissions needed for thread-aware operation: `ViewChannel`, `SendMessages`, `CreatePublicThreads`, `CreatePrivateThreads`, `SendMessagesInThreads`, `ManageThreads`, and `ReadMessageHistory`
- keep thread creation anchored to the configured spec, implementation, and pull-request parent channels so thread inheritance stays explicit
- return structured interaction payloads from both the Gateway runtime and the
  explicit webhook helper so live slash commands and button callbacks keep the
  same compact status text, safe mention configuration, and contextual controls
  as thread messages
- acknowledge valid slash commands and button interactions before persistence and
  audit writes, then persist the control result and post the bound-thread status
  message before completing the deferred interaction with a minimal ephemeral
  follow-up, so live controls stay inside Discord's prompt response window
  without duplicating the full button-bearing payload
- fail closed with `responsePostError` and audit logging when Discord rejects
  the initial acknowledgement response, the acknowledgement transport throws, or
  a route-refusal acknowledgement is rejected, without writing lifecycle state
- preserve the acknowledgement receipt and durable control result with a
  `threadPostError` diagnostic when the post-acknowledgement thread status
  message cannot be delivered or returns a non-2xx Discord receipt
- preserve deferred-completion failures as `completionPostError` diagnostics
  when Discord rejects the minimal follow-up that clears the interaction state
- persist one Discord route trace marker for interaction-originated actions by
  normalizing each routed interaction request once

## Channel Layout

- `spec` parent channel: source for spec threads and approval routing
- `implementation` parent channel: source for execution and remediation threads
- `pull-request` parent channel: source for PR coordination threads
- `audit` channel: operator-visible audit summaries and privileged-action traces
- `project-management` channel: query-only status surface for active work summaries that link back to the bound work threads

Project-management lookups must stay read-only. Any lifecycle-changing action still executes from the bound spec, implementation, or pull-request thread.

## Operator Actions

The Discord command surface supports project bootstrap, project management, and
bound-thread lifecycle controls.

| Slash command               | Bound thread context                             | Operator intent                                                      |
| --------------------------- | ------------------------------------------------ | -------------------------------------------------------------------- |
| `/new-project`              | project-management                               | Bootstrap a project with repository and project identity.            |
| `/open-project`             | project-management                               | Reopen a project run with explicit intent and dashboard routing.     |
| `/project-summary`          | project-management                               | Show read-only lifecycle and release-precondition summary.           |
| `/project-settings`         | project-management                               | Update project runtime settings and approval mode.                   |
| `/project-settings-history` | project-management                               | Show append-only settings history (public or detailed by role).      |
| `/cancel-project`           | project-management                               | Pause all project activity and post per-phase cancellation status.   |
| `/cancel`                   | project-management                               | Alias for `/cancel-project` in the current thread context.           |
| `/resume-project`           | project-management                               | Run global preflight and resume paused project activity.             |
| `/release-project`          | project-management                               | Request release orchestration and approval.                          |
| `/phase-contract`           | spec, implementation, or pull-request            | Show authoritative allowed actions, lock markers, and role gates.    |
| `/alternatives`             | discovery or research                            | Show three alternatives with effort and risk metadata.               |
| `/alts`                     | discovery or research                            | Alias for `/alternatives`.                                           |
| `/redirect`                 | discovery or research                            | Replace the active research direction prompt.                        |
| `/consider`                 | discovery or research                            | Queue a URL for inclusion in the next research update.               |
| `/research`                 | discovery, spec, implementation, or pull-request | Enter or re-enter research mode for the bound project.               |
| `/spec`                     | discovery, spec, implementation, or pull-request | Prepare and request spec approval for the active project.            |
| `/run-this`                 | implementation                                   | Execute work in the active implementation thread.                    |
| `/claim-this`               | implementation                                   | Claim the queued work item before execution begins.                  |
| `/approve-this`             | spec, implementation, or pull-request            | Approve the bound spec, slice, or pull-request state.                |
| `/block-this`               | spec, implementation, or pull-request            | Mark the active work item blocked without leaving thread context.    |
| `/complete-this`            | implementation or pull-request                   | Mark the active work item complete after terminal handoff.           |
| `/pause-this`               | spec, implementation, or pull-request            | Pause automation for the bound item.                                 |
| `/resume-this`              | spec, implementation, or pull-request            | Resume automation for the bound item.                                |
| `/retry-gates`              | implementation or pull-request                   | Re-run failed gates or remediation in the bound thread context.      |
| `/merge-now`                | pull-request                                     | Trigger the merge path for the bound pull request context.           |
| `/rebase-dependents`        | spec, implementation, or pull-request            | Refresh branches that depend on the bound work item.                 |
| `/sync-worktree`            | implementation or pull-request                   | Refresh the bound branch workspace against its base branch.          |
| `/release-worktree`         | implementation or pull-request                   | Clean up the bound branch workspace after completion or abandonment. |
| `/show-status`              | spec, implementation, or pull-request            | Summarize the active work item and last known lifecycle state.       |
| `/show-last-artifact`       | spec, implementation, or pull-request            | Surface the latest auditable artifact for the bound thread.          |
| `/explain-failure`          | implementation or pull-request                   | Summarize the latest failing gate, review, or remediation state.     |
| `/update-spec`              | spec                                             | Create a new revision of the bound spec while preserving history.    |

Named-option command contracts are registered for bootstrap, reopen, and
research/project controls:

- `/new-project --repo <repo_name> --project <project_name> [--quality-strictness on|off]`
- `/open-project --repo <repo_name> --project <project_name> --intent maintenance|bugfix|new-feature`
- `/resume-project [--force force]`
- `/project-settings-history [--mode summary|detailed]`
- `/redirect --direction-prompt <text>`
- `/consider --url <value>`

For the full research-to-PR command workflow, use the canonical
[Commanded Delivery Flow](./operator-guide.md#commanded-delivery-flow) in the
operator guide.

## Approval Flow

- create an approval record artifact
- evaluate privileged actions through the policy package and OpenClaw action gates
- persist the decision path and resulting audit log
- reflect the resulting state back into GitHub and operator-visible thread updates
- keep Discord-facing approval contracts aligned with codecs, generated schemas, and auditable artifacts
- route slash commands and buttons through exactly one bound thread session, then project that session into a typed spec, implementation, or pull-request work item before responding

## Operational Pattern

1. Research creates a brief.
2. Specs turn that brief into an approvable record and spec PR.
3. Slicing produces dependency-aware implementation units.
4. Queue and supervisor coordinate execution.
5. Discord approvals unblock merges or retries with explicit traceability.

## Guarantees

- every action is auditable
- no context leakage between threads
- thread == unit of work
- missing or ambiguous thread context must fail closed rather than guess

## Related Guides

- [Live Test Lab](./live-test-lab.md)
- [Live Test Discord Setup](./live-test-discord-setup.md)
