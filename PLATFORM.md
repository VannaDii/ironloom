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
- The OpenClaw adapter already exposes explicit worktree sync/release tools, explicit spec-update handling, pull-request update and merge submission tools, and dependent rebase execution delegated into platform packages.
- The guide site already includes a dedicated publishing and release guide at `site/guide-docs/guides/publishing-release.md`.
- Pre-commit enforcement is centralized through `scripts/check-pre-commit.mjs`, which verifies Node, regenerates schemas and the OpenClaw manifest twice around `lint-staged`, re-stages generated files, then runs workspace typecheck and repository validation.
- SonarCloud analysis is wired into CI as a required path and is no longer guarded by a standalone pre-check step; a missing or misconfigured secret must fail the actual scan path rather than silently skipping analysis.

## Remaining Gap

The main remaining work is:

- complete the OpenClaw adapter surface so the tools match the intended platform operations, not just record normalization
- keep Discord thread-aware and continue expanding operator behavior until all common development operations resolve directly from bound work-item context
- harden hook and CI enforcement so schema, manifest, and Sonar requirements fail loudly
- close documentation gaps, especially publishing/release guidance and current-vs-target implementation notes
- continue normalizing packages toward the fuller per-package specs below
- finish per-package README coverage and other remaining normalization backlog items that the repo does not yet machine-enforce

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

## Repository Structure

- `packages/`: platform, integration, adapter, and control-plane packages
- `docker/openclaw-runtime/`: container runtime
- `deploy/helm/devplat/`: OCI Helm chart
- `site/guide-docs/`: VitePress documentation site
- `scripts/`: validation and generation scripts
- `.github/workflows/`: CI, release, publishing, and deployment workflows

## Package Responsibilities

### Core Layer

- `@vannadii/devplat-core`: domain-wide lifecycle state, result/error primitives, shared metadata helpers, exactness helpers
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

- `@vannadii/devplat-core`: current code covers lifecycle status, trace snapshots, result primitives, codecs, and exactness helpers; remaining gap is typed IDs, richer error taxonomy, and typed timestamp/value-object helpers.
- `@vannadii/devplat-config`: current code covers normalized runtime config for GitHub, Discord, OpenClaw, and Sonar; remaining gap is broader deployment/storage/worktree defaults and fuller config validation errors.
- `@vannadii/devplat-artifacts`: current code covers artifact envelopes, approval, audit, merge, rebase, and validation; remaining gap is a fuller artifact registry, explicit migrations, and broader artifact coverage for research/spec/slice/task/review handoffs.
- `@vannadii/devplat-memory`: current code covers a basic memory-entry contract and persistence path; remaining gap is explicit decision-log, known-trap, and reusable context-bundle modeling.
- `@vannadii/devplat-research`: current code covers structured research briefs; remaining gap is deeper capability comparison, feasibility structure, and richer source attribution.
- `@vannadii/devplat-specs`: current code covers spec records, approval, and explicit revision updates; remaining gap is richer revision history and PR-ready spec rendering contracts.
- `@vannadii/devplat-slicing`: current code covers slice plans and readiness checks; remaining gap is an explicit dependency-graph artifact and richer PR-sized work packet modeling.
- `@vannadii/devplat-queue`: current code covers task creation, claim, and lifecycle updates; remaining gap is fuller queue abstractions including release/resume history and explicit transition-event outputs.
- `@vannadii/devplat-worktrees`: current code covers allocation plus explicit sync and release result contracts; remaining gap is deeper branch-safety validation and real cleanup/sync execution semantics.
- `@vannadii/devplat-execution`: current code covers structured subprocess execution and timeouts; remaining gap is explicit retry policy, truncation policy, and retry outcome contracts.
- `@vannadii/devplat-gates`: current code covers gate execution and reports; remaining gap is richer failure classification, next-action hints, and remediation hooks.
- `@vannadii/devplat-sonarcloud`: current code covers bootstrap verification and quality gate interpretation; remaining gap is fuller issue normalization into review/remediation inputs.
- `@vannadii/devplat-review`: current code covers structured review findings; remaining gap is broader review summary generation and spec-vs-implementation conformance contracts.
- `@vannadii/devplat-remediation`: current code covers remediation planning; remaining gap is explicit remediation result artifacts and unresolved-issue summaries.
- `@vannadii/devplat-prs`: current code covers PR normalization plus update and merge submission semantics; remaining gap is richer PR body/update projections and deeper review/remediation status projection.
- `@vannadii/devplat-branching`: current code covers dependent rebase planning and explicit merge-triggered execution through worktree sync orchestration; remaining gap is a fuller branch dependency graph and deeper conflict classification.
- `@vannadii/devplat-supervisor`: current code covers minimal next-step decision and telemetry; remaining gap is broader lifecycle routing across research, specs, slicing, implementation, review, remediation, merge, and continuation.
- `@vannadii/devplat-observability`: current code covers telemetry events; remaining gap is richer audit-specific schemas, run metrics, and run summaries.
- `@vannadii/devplat-github`: current code covers GitHub action requests and policy-aware submission semantics; remaining gap is richer normalized repo/PR state and issue/spec-PR contracts.
- `@vannadii/devplat-openclaw`: current code covers deterministic plugin config, broad tool validation, and adapter delegation; remaining gap is keeping tool inventory and handler depth aligned with the intended end-to-end platform surface as package behavior becomes more concrete.
- `@vannadii/devplat-discord`: current code covers thread-aware bindings, approvals, expanded operator actions, and explicit `pull-request` thread sessions; remaining gap is richer response formatting and deeper command-to-work-item resolution.
- `@vannadii/devplat-policy`: current code covers privileged-action decisions and explicit approval requirements for risky Discord actions; remaining gap is richer merge/autofix/escalation policy modeling.
- `@vannadii/devplat-storage`: current code covers filesystem-backed record storage under `.devplat`; remaining gap is richer storage interfaces and explicit layout contracts for every domain surface.

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

The current implementation already includes these capabilities in code and docs. The remaining gap is depth and completeness of delegated platform behavior, not basic tool registration.

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

Current Discord thread/session contracts must support:

- `spec` thread context
- `implementation` thread context
- `pull-request` thread context

Runtime Discord configuration must also declare:

- Discord API `v10` access
- application id, public key, and bot token inputs
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

The current repo already satisfies the structural/package metadata rules broadly, but package `README.md` coverage remains incomplete. Only `@vannadii/devplat-openclaw` currently has a package-local README, so the remaining packages stay on the normalization backlog until each publishable package has one.

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
