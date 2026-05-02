# DevPlat Platform Completion Spec

## Summary

DevPlat is a Discord-first autonomous development platform delivered as a strict native-ESM TypeScript monorepo. It uses OpenClaw as the runtime/control surface, GitHub as the source of truth for specs and pull requests, SonarCloud for quality gating, GitHub Packages for npm distribution, GHCR for Docker and Helm distribution, and GitHub Pages for guide-style documentation.

The repository already has a strong foundation. This document captures:

- what is already implemented
- what remains between the current repository and the intended platform
- the minimum completion bar for OpenClaw, Discord, CI/CD, and distribution
- a package-by-package gap analysis against the current platform specs
- the operator, adapter, and enforcement surfaces that already exist in code today

## Current Baseline

The repository already provides:

- npm workspaces for `packages/*` and `site/guide-docs`
- Node and npm alignment through `.nvmrc`, `engines`, and install-time verification
- strict root scripts for build, typecheck, tests, docs, schema generation, manifest generation, and repo validation
- the full package inventory for the foundation scope
- generated JSON schemas and a deterministic `openclaw.plugin.json`
- CI for setup, generated artifacts, repo validation, lint, typecheck, coverage tests, build, docs build, and SonarCloud
- a Linux-only TypeScript compatibility matrix for TS `5.x` and `6.x`
- GitHub Pages deployment through the artifact flow
- GHCR publication workflows for the Docker runtime image and Helm chart
- Docker and Helm scaffolding in the expected repository locations

This phase is therefore not about creating the monorepo. It is about closing the remaining platform-completion gap cleanly and explicitly.

## Current Implementation Highlights

The current repository already includes the concrete surfaces that this phase is meant to finish and harden:

- Discord control actions currently cover `run-this`, `claim-this`, `approve-this`, `block-this`, `complete-this`, `pause-this`, `resume-this`, `retry-gates`, `merge-now`, `rebase-all-dependents`, `show-status`, `show-last-artifact`, `explain-failure`, `sync-worktree`, `release-worktree`, and `update-spec`.
- Discord thread/session contracts now distinguish `spec`, `implementation`, and `pull-request` thread kinds so PR workflows can stay thread-scoped instead of remaining only a documented target.
- Discord operator messages are compact structured UI payloads with status/scope/item/result fields plus contextual buttons; route failures and policy denials fail closed and persist audit records.
- Discord categories default to the configured repository name for multi-repository guild separation; OpenClaw test and live-lab traffic uses the `test` category.
- The OpenClaw adapter already exposes explicit worktree sync/release tools, explicit spec-update handling, pull-request update and merge submission tools, and dependent rebase execution delegated into platform packages.
- The guide site already includes a dedicated publishing and release guide at `site/guide-docs/guides/publishing-release.md`.
- Pre-commit enforcement is centralized through `scripts/check-pre-commit.mjs`, which verifies Node, regenerates schemas and the OpenClaw manifest twice around `lint-staged`, re-stages generated files, then runs workspace typecheck and repository validation.
- SonarCloud analysis is wired into CI as a required path and is no longer guarded by a standalone pre-check step; a missing or misconfigured secret must fail the actual scan path rather than silently skipping analysis.

## Full Autonomy Buildout

The single-repo autonomous production path is implemented incrementally through
the package responsibilities below. Current completion work focuses on:

- repository-scoped runtime configuration for GitHub, Discord, OpenClaw, Sonar,
  storage, and worktrees
- codec-owned package contracts where exported `io-ts` codecs are the schema
  and TypeScript type source of truth for lifecycle records and tool inputs
- durable `.devplat` storage records with layout metadata and index materialization
- versioned artifact envelopes with migration metadata for future schema changes
- explicit policy decisions with approval, audit, and privilege-level outcomes
- package-local README coverage enforced by repository validation
- OpenClaw and Discord surfaces that delegate into platform packages while
  preserving auditable state and fail-closed control behavior

## Goals

- Normalize all packages into a clean, enforceable architecture.
- Deliver a complete OpenClaw adapter exposing the intended DevPlat tool surface.
- Deliver thread-aware Discord workflows as the primary operator interface.
- Deliver Docker runtime and Helm deployment artifacts through GHCR.
- Deliver a complete VitePress documentation site through GitHub Pages.
- Enforce strict engineering discipline from day one.
- Preserve GitHub as the source of truth and keep Discord/OpenClaw flows auditable.

## Non-goals

- Fully implementing every platform business behavior in this phase.
- Supporting non-Linux runtime environments.
- Supporting additional chat/control surfaces beyond OpenClaw and Discord as first-class UX.
- Optimizing for TypeScript compatibility outside the explicit Linux TS `5.x` and `6.x` lanes.

## Technology Standards

- Node.js: `>= 24`, pinned through `.nvmrc`
- npm: `>= 11`
- TypeScript authoring baseline: stable `6.x`
- TypeScript compatibility matrix: stable `5.x` and `6.x`
- TypeScript type assertions and casts are banned in authored code, including `as`, `as unknown`, angle-bracket casts, non-null assertions, and double assertions.
- Module system: ESM with `NodeNext`
- Runtime target: Linux containers
- Container base: stable Alpine Linux
- Docs: VitePress
- CI/CD: GitHub Actions
- Quality gate: SonarCloud
- Public JSON schemas are generated from exported `io-ts` codecs; codec-owned
  TypeScript public record types derive from those codecs to avoid parallel
  interface and codec definitions.

## Repository Structure

- `packages/`: platform, integration, adapter, and control-plane packages
- `docker/openclaw-runtime/`: container runtime
- `deploy/helm/devplat/`: OCI Helm chart
- `site/guide-docs/`: VitePress documentation site
- `scripts/`: validation and generation scripts
- `.github/workflows/`: CI, release, publishing, and deployment workflows

## Package Responsibilities

### Core Layer

- `@vannadii/devplat-core`: domain-wide lifecycle state, result/error primitives, codec-derived public contracts, shared metadata helpers
- `@vannadii/devplat-config`: environment parsing, typed configuration, defaults, normalization
- `@vannadii/devplat-artifacts`: artifact envelopes, validators, schema contracts, versioned machine-readable handoffs

### Planning Layer

- `@vannadii/devplat-memory`: persistent knowledge, decisions, constraints, long-lived context
- `@vannadii/devplat-research`: research intake and structured implementation context
- `@vannadii/devplat-specs`: spec drafting, revisioning, lifecycle state, approval state
- `@vannadii/devplat-slicing`: dependency-aware implementation decomposition

### Execution Layer

- `@vannadii/devplat-queue`: task lifecycle state and queue coordination
- `@vannadii/devplat-worktrees`: isolated worktree allocation, sync, release, and safety rules
- `@vannadii/devplat-execution`: structured command execution
- `@vannadii/devplat-gates`: build/lint/type/test/coverage orchestration and classification

### Review Layer

- `@vannadii/devplat-review`: structured automated review findings
- `@vannadii/devplat-remediation`: remediation planning, retry hints, autofix eligibility

### Delivery Layer

- `@vannadii/devplat-prs`: pull request lifecycle state and merge-readiness state
- `@vannadii/devplat-branching`: dependent branch refresh and rebase coordination

### Control Layer

- `@vannadii/devplat-supervisor`: orchestration decisions, routing, and escalation
- `@vannadii/devplat-observability`: telemetry, auditability, correlation, and trace history

### Integrations and Control Planes

- `@vannadii/devplat-github`: GitHub action/request translation
- `@vannadii/devplat-sonarcloud`: SonarCloud quality gate interpretation and issue normalization
- `@vannadii/devplat-openclaw`: adapter only, registers all platform tools, no business logic
- `@vannadii/devplat-discord`: thread-aware operator workflow model
- `@vannadii/devplat-policy`: approval, privilege, and escalation constraints
- `@vannadii/devplat-storage`: persistence abstraction and initial `.devplat` implementation

## Package Analysis Snapshot

- `@vannadii/devplat-core`: current code covers lifecycle status, trace snapshots, result primitives, codec-derived public types, shared decode helpers, codec-first typed IDs/repository keys/timestamps, and classified platform errors.
- `@vannadii/devplat-config`: current code covers normalized runtime config for GitHub API/web/token settings, storage directories, worktree sync defaults, Docker/Helm deployment defaults, Discord Gateway interaction transport, OpenClaw, Sonar, and structured validation issues.
- `@vannadii/devplat-artifacts`: current code covers artifact envelopes, the default lifecycle artifact registry, explicit migration records, approval, audit, merge, rebase, validation, and registered research/spec/slice/task/review handoff contracts.
- `@vannadii/devplat-memory`: current code covers memory-entry persistence plus decision-log, known-trap, and reusable context-bundle modeling.
- `@vannadii/devplat-research`: current code covers structured research briefs, capability comparisons, feasibility structure, and source attribution.
- `@vannadii/devplat-specs`: current code covers spec records, approval, explicit revision metadata, source artifact references, and PR-ready spec rendering with metadata, criteria, sources, and revision history.
- `@vannadii/devplat-slicing`: current code covers slice plans, readiness checks, explicit dependency-graph artifacts, and PR-sized work packets with task counts, PR title hints, and review focus.
- `@vannadii/devplat-queue`: current code covers task creation, claim, lifecycle updates, release/resume transitions, and explicit transition-event history.
- `@vannadii/devplat-worktrees`: current code covers pure allocation/sync/release records, branch safety checks with fail-closed Git execution, Git-backed worktree add, fetch/rebase or fast-forward sync, and archive/delete release methods.
- `@vannadii/devplat-execution`: current code covers structured subprocess execution, timeouts, retry policy, truncation policy, and retry outcome contracts.
- `@vannadii/devplat-gates`: current code covers gate execution, reports, failure classification, remediation handoff hooks, and next-action hints.
- `@vannadii/devplat-sonarcloud`: current code covers bootstrap verification, quality gate interpretation, normalized issue records, and Sonar issue projection into review findings for remediation planning.
- `@vannadii/devplat-review`: current code covers structured review findings, review summary generation, and spec-vs-implementation conformance contracts.
- `@vannadii/devplat-remediation`: current code covers remediation planning from review findings and gate remediation hooks, remediation result records, and unresolved-issue summaries.
- `@vannadii/devplat-prs`: current code covers PR normalization, review/remediation-aware body projections, update submission semantics, and merge submission semantics.
- `@vannadii/devplat-branching`: current code covers dependent rebase planning, explicit merge-triggered execution through worktree sync orchestration, branch dependency graphs, and conflict classification.
- `@vannadii/devplat-supervisor`: current code covers next-step decisions, telemetry, lifecycle signals, blocker-aware route plans, and phase routing across research, specs, slicing, implementation, gates, review, remediation, merge, and continuation.
- `@vannadii/devplat-observability`: current code covers telemetry events, audit records, run metrics, run summaries, and persisted audit/telemetry evidence.
- `@vannadii/devplat-github`: current code covers GitHub action requests, policy-aware submission semantics, concrete REST request submission for PR create/update/comment/merge and branch sync, normalized repository state, normalized pull request state, and issue/spec/PR link contracts.
- `@vannadii/devplat-openclaw`: current code covers deterministic plugin config, broad tool validation, adapter delegation, a single tool inventory factory used by plugin registration, task lifecycle tools that can preserve durable queue transition history from the current stored record, lifecycle policy evaluation output with action category, risk, escalation target, audit reason, privilege, and next-action metadata, Discord control handling for both normalized control requests and operator interaction callbacks, and hermetic deep-test coverage of durable queue transitions plus callback-shaped Discord interactions through the loopback response transport; remaining gap is deepening delegated platform behavior as package behavior becomes more concrete.
- `@vannadii/devplat-discord`: current code covers thread-aware bindings, approvals, expanded operator actions, explicit `pull-request` thread sessions, codec-backed slash command contracts, raw Discord callback normalization, outbound Discord Gateway `INTERACTION_CREATE` routing with identify and heartbeat support, storage-backed bound-thread resolution for private runtimes, Helm values that start the private Gateway worker without a public webhook host, signature-verified interaction webhook helpers with structured component-bearing interaction responses for explicit inbound deployments, Discord ping responses, live-lab guild command registration, slash/button interaction routing, fail-closed thread ambiguity handling, typed bound work-item projection from Discord thread sessions, prompt interaction acknowledgement before state/telemetry/audit persistence, single-pass normalization for interaction-originated route traces, failed-closed initial acknowledgement rejection and acknowledgement transport failure reporting through `responsePostError`, route-refusal acknowledgement rejection reporting through the same fail-closed diagnostic path, post-acknowledgement thread-post failure reporting through `threadPostError` for thrown and non-2xx responses, REST response posting that names the resolved work item, live-lab status payloads with compact state/scope/item content and no stale interactive buttons, and a live-lab interaction probe that routes a callback-shaped operator command through the Discord response path while failing if callback/thread receipts are missing, the bound thread is wrong, actionable button components are dropped from the posted control-plane payloads, or component custom ids and message receipt ids are not recorded; remaining gap is human operator-triggered slash/button invocation in the sandbox guild because Discord does not provide a supported bot API for clicking buttons as a user.
- `@vannadii/devplat-policy`: current code covers privileged-action decisions, explicit approval requirements, lifecycle action categories for merge, command execution, worktree release, rebase, publish, autofix, and destructive cleanup, risk levels, escalation targets, next-action hints, and audit reasons.
- `@vannadii/devplat-storage`: current code covers filesystem-backed record storage under `.devplat`, explicit layout contracts, and active thread/task/PR/branch/artifact indexes.

## OpenClaw Adapter Requirements

`@vannadii/devplat-openclaw` must remain adapter-only.

It must:

- expose the required platform capabilities as tools
- validate and decode OpenClaw input through platform codecs
- delegate behavior into platform packages instead of owning business logic
- generate `openclaw.plugin.json` deterministically
- document the tool surface in both package docs and guide docs

### Required Tool Surface

The foundation-phase adapter must expose tools for:

- research initiation
- spec creation, approval, and explicit spec update
- slice generation and readiness checks
- queue claim and lifecycle updates
- worktree allocation, sync, and release
- command execution
- gate execution
- artifact validation
- review and remediation triggering
- runtime config and plugin config translation
- storage read/list/write actions
- telemetry and policy evaluation
- supervisor step control
- pull request update and merge submission
- dependent rebase planning and explicit execution semantics

The current implementation already includes these capabilities in code and docs. Tool registration is centralized through the OpenClaw tool inventory factory; the remaining gap is depth and completeness of delegated platform behavior.

## Discord Workflow Model

### Hard Requirement

All interactions MUST be thread-aware.

All Discord interactions MUST be thread-aware.

### Rules

- every spec must have a thread
- every slice must have a thread
- every pull request workflow must have a thread
- a dedicated project-management channel may expose read-only status queries, but it must link back to explicit bound thread context
- no operator action may run against ambiguous global context
- all lifecycle-changing actions must resolve context from thread metadata
- if thread context is missing or ambiguous, the system must fail closed unless an explicit override path exists
- message components must encode action and thread context, then revalidate the live Discord payload, persisted binding, policy decision, and current work item before running an action
- test and live-lab OpenClaw Discord traffic must use the standard channels under a `test` category; production ops uses the standard configured channels under a category named for the repository

### Expected Operator Actions

Discord operator actions must cover common development operations such as:

- `run this`
- `claim this`
- `approve this`
- `block this`
- `complete this`
- `retry this`
- `merge this`
- `rebase dependents`
- `pause`
- `resume`
- `show status`
- `show last artifact`
- `explain failure`
- `sync worktree`
- `release worktree`
- `update spec`

### Message UX

Discord messages must be operator UI rather than logs. Primary messages use the
canonical structure:

```text
<indicator> DevPlat · <action label>

Status: <status>
Scope: <thread kind> · <thread id>
Item: <spec | slice | PR | artifact | run>
Actor: <Discord actor mention or id>
→ <result or next action>
```

Actionable messages include contextual buttons for relevant next steps only.
Button payloads may include action and thread context, but encoded payloads are
never trusted by themselves. The control plane must fail closed when the
interaction thread, persisted binding, work item, stale-state check, or policy
decision does not match.

Route failures use:

```text
🔴 DevPlat · Action refused

Status: blocked
Scope: unresolved
Reason: interaction must resolve to exactly one bound thread
→ Run this from the correct spec, implementation, or PR thread.
```

Policy denials use the standard blocked-action format and change no platform
state beyond audit logging.

Current Discord thread/session contracts must support:

- `spec` thread context
- `implementation` thread context
- `pull-request` thread context

Runtime Discord configuration must also declare:

- Discord API `v10` access
- application id, public key, and bot token inputs
- category name, defaulting to the configured repository name except for test traffic
- parent channels for `spec`, `implementation`, and `pull-request` threads
- audit and project-management channels
- an inheritance-based thread binding mode

### Guarantees

- every action is auditable
- no context leakage between threads
- thread == unit of work

## Documentation Site

### Required Guide Set

- introduction
- architecture overview
- package reference
- OpenClaw setup and usage
- Discord workflows
- configuration reference
- examples and end-to-end flows
- Docker runtime usage
- Helm and k3s deployment
- SonarCloud setup and expectations
- publishing and release
- operator guide
- developer guide

### Publishing

- GitHub Actions must build and deploy the site
- deployment must use the Pages artifact flow
- no `gh-pages` branch
- no custom domain required for foundation completion

## Docker Runtime

- location: `docker/openclaw-runtime/`
- Alpine-based image
- Node aligned with `.nvmrc`
- OpenClaw installed
- DevPlat installed
- default entrypoint starts the OpenClaw gateway
- runtime remains configurable through environment and mounted config
- published to GHCR with version and `latest` tags

## Helm Chart

- location: `deploy/helm/devplat/`
- includes deployment and service templates
- includes `values.yaml`
- supports optional PVC and ingress
- references the GHCR runtime image
- remains suitable for k3s
- publishes as an OCI chart to GHCR

## CI and CD Requirements

### CI

The primary CI workflow must continue to cover:

- setup and Node alignment
- generated artifacts
- repo validation
- lint
- typecheck
- tests with coverage
- build
- docs build
- SonarCloud scan

### TypeScript Matrix

- TS `6.x` remains the primary authoring lane
- TS `5.x` and `6.x` must be compatibility-tested on Linux
- the compatibility lanes must run typecheck, test, and build
- lint stays on the primary lane

### Release and Distribution

- Changesets manages release pull request flow
- public DevPlat packages release together through one Changesets fixed group
- npm publication goes to GitHub Packages
- stable releases publish `vN`, `vN.N`, and immutable `vN.N.N` Git tags
- Docker publication goes to GHCR
- Helm OCI publication goes to GHCR
- docs build and deploy through GitHub Pages

## SonarCloud

- Vitest coverage must feed SonarCloud via `sonar.javascript.lcov.reportPaths`
- the quality gate must be enforced in CI
- Sonar analysis must never be conditionally skipped; missing or misconfigured `SONAR_TOKEN` must fail the scan path
- `dist`, generated schemas, coverage artifacts, and transient workspace state must stay excluded appropriately

## Hooks

### Pre-commit

Pre-commit must:

- verify Node version
- centralize verification and generation in `scripts/check-pre-commit.mjs`
- generate schemas and the OpenClaw manifest before `lint-staged`
- stage generated files before `lint-staged`
- run `lint-staged`
- regenerate schemas and the OpenClaw manifest after `lint-staged`
- restage generated files after `lint-staged`
- run workspace typecheck
- run repository validation, including schema and manifest checks

### Pre-push

Pre-push must:

- verify Node alignment
- regenerate committed artifacts
- run full repo validation
- run build, coverage tests, and docs build

## Validation Scripts

Repository validation must enforce:

- package structure
- exports correctness
- dependency graph rules
- schema integrity
- manifest correctness
- instruction drift
- naming rules
- policy boundaries
- unit-test presence

## Package Completion Rules

Every package is expected to provide:

- `package.json`
- `tsconfig.json`
- `src/index.ts`
- `README.md`
- scripts for `build`, `clean`, `lint`, `typecheck`, and `test`

The current repo enforces these package completion rules, including package-local
README coverage, through `npm run check:packages`.

## Cross-package Rules

Forbidden:

- cross-package relative imports
- cyclic dependencies
- business logic inside `@vannadii/devplat-openclaw`
- thread-unaware Discord command handling

Recommended implementation order remains:

1. core
2. config
3. artifacts
4. execution
5. gates
6. openclaw
7. discord
8. queue
9. worktrees
10. supervisor
11. prs
12. branching
13. review
14. remediation
15. github
16. sonarcloud
17. policy
18. storage
19. memory
20. research
21. specs
22. slicing
23. observability

## Acceptance Criteria

This phase is complete when:

- `nvm use && npm ci` succeeds
- root lint, typecheck, test, build, and docs build succeed
- repo validation succeeds
- SonarCloud quality gate succeeds
- TS `5.x` and `6.x` Linux jobs succeed
- Docker runtime builds and publishes to GHCR
- Helm chart packages and publishes to GHCR
- GitHub Pages docs deploys successfully through artifact-based publishing
- `@vannadii/devplat-openclaw` exposes the intended foundation tool surface
- Discord interactions are thread-aware and auditable
- Discord operator messages use compact structured payloads with contextual
  buttons, fail-closed route messages, policy-denied blocked messages, and audit
  records for accepted, blocked, and refused interactions
- the dispatchable live lab registers Discord command contracts and records
  Discord interaction-response probing through operator-visible Discord messages
  with actionable button components preserved in the structured control-plane
  payload, component custom ids, posted content, and Discord message receipt ids
  preserved while the private Gateway runtime is still alive
- the dispatchable live lab fails before sandbox repository mutation when the
  required project-management bootstrap status message cannot post
- the dispatchable live lab records the required bootstrap status receipt with
  channel id, message id, posted content, and an empty component id list
- the Discord package exposes a private outbound Gateway runtime for real
  slash/button callbacks without public ingress, plus a reusable
  signature-verified interaction webhook helper for explicit inbound
  deployments while preserving structured operator payloads and contextual
  buttons
- docs are sufficient for operators and contributors to install and use the platform without private guidance

## Recommended First Vertical Slice

Prioritize an end-to-end thread-aware operator path before broadening deeper package behavior:

1. a Discord thread receives `run this`
2. thread context resolves the active work item
3. OpenClaw routes into the DevPlat gate tool surface
4. a gate-run artifact is generated and validated
5. the result returns to the same thread
6. the operator can retry or approve in-thread

That slice proves the core architecture: thread-aware control, adapter correctness, artifact handling, and operator UX.

Live-lab acceptance must also verify the Discord interactive UX path directly:

1. register or simulate a Discord slash/button interaction
2. route it through the outbound Gateway or callback-shaped Discord
   control-plane service
3. post an interaction acknowledgement and bound-thread status through the Discord response transport
4. record callback and thread-message receipts, message ids, posted content, and structured component custom ids in the live-lab report
5. record the required bootstrap status receipt with channel id, message id, posted content, and an empty component id list
6. fail the live lab before sandbox repository mutation when the required bootstrap status message cannot post
7. fail the live lab if the interaction fails closed, does not resolve to one bound thread, or drops actionable controls

## Implementation Phases

### Phase 1

- package normalization and boundary enforcement
- complete the explicit OpenClaw and Discord control surfaces

### Phase 2

- docs completion, release guidance, and GitHub Pages stability
- TypeScript compatibility and CI hardening

### Phase 3

- Docker, Helm, SonarCloud hardening, and final polish

## Final Principle

DevPlat is a deterministic, auditable, thread-aware system for producing and evolving code.
