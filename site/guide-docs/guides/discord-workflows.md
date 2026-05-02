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

## Channel Layout

- `spec` parent channel: source for spec threads and approval routing
- `implementation` parent channel: source for execution and remediation threads
- `pull-request` parent channel: source for PR coordination threads
- `audit` channel: operator-visible audit summaries and privileged-action traces
- `project-management` channel: query-only status surface for active work summaries that link back to the bound work threads

Project-management lookups must stay read-only. Any lifecycle-changing action still executes from the bound spec, implementation, or pull-request thread.

## Operator Actions

- `run this`: execute work in the active thread context
- `claim this`: claim the bound queue work item before execution begins
- `approve this`: approve the bound spec, slice, or pull request state
- `block this`: mark the active work item blocked without leaving thread context
- `complete this`: mark the active work item complete when the thread reaches a terminal handoff
- `retry`: re-run failed gates or remediation in the bound thread context
- `merge`: trigger the merge path for the bound pull request context
- `rebase dependents`: trigger branching coordination for the bound context
- `pause` or `resume`: change execution state without leaving the bound thread
- `show status`: summarize the active work item and last known lifecycle state
- `show last artifact`: surface the latest auditable artifact for the bound thread
- `explain failure`: summarize the latest failing gate, review, or remediation state
- `sync worktree`: refresh the bound branch workspace against its base branch
- `release worktree`: clean up the bound branch workspace after completion or abandonment
- `update spec`: create a new revision of the bound spec while preserving approval history

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
