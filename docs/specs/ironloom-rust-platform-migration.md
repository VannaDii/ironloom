# Ironloom Rust Platform Migration Plan

> **For agentic workers:** This is a planning document only. Do not implement from it until the implementation plan is approved. When implementation begins, use `superpowers:subagent-driven-development` or `superpowers:executing-plans` and keep each phase independently reviewable.

**Goal:** Convert the existing `VannaDii/devplat` TypeScript/Node scaffold into Ironloom, a standalone Rust-based autonomous engineering platform by Veritas Labs.

**Company identity:** Veritas Labs, `veritaslabs.dev`

**Product identity:** Ironloom, `ironloom.dev`

**Architecture:** Ironloom is a containerized Rust workspace whose core product is the supervisor runtime. Discord remains the primary operator interface, GitHub remains the source of truth for repository and pull-request state, SonarCloud remains the quality and compliance system, Kubernetes delivery targets k3s through a direct Ironloom Helm chart, and the public landing page lives on the GitHub Pages documentation site.

**Tech stack:** Rust workspace, Cargo, Alpine Linux container runtime, Helm OCI on GHCR, GitHub Actions, GitHub Pages documentation, VitePress, Discord API, GitHub API, SonarCloud API.

---

## Executive Summary

The current repository is a strict native-ESM TypeScript monorepo named DevPlat. It uses npm workspaces under `packages/*`, OpenClaw as the runtime/control adapter, VitePress for documentation, Node-based repository validation scripts, generated `io-ts` JSON schemas, Docker packaging for `devplat-openclaw-runtime`, and a Helm chart at `deploy/helm/devplat`.

The target repository is a Rust workspace named Ironloom. The OpenClaw adapter is removed entirely. TypeScript and Node are removed as the runtime platform. The supervisor becomes the central runtime service and routes work through a typed process graph. Worker modules start as functional Rust modules in one process, but the boundary is designed so workers can later move into separate processes or containers without changing the supervisor contract.

Ironloom also gets a public landing page on `site/guide-docs`. The landing page is part of the static VitePress GitHub Pages documentation site, keeps operator controls out of public content, and avoids adding a separate runtime web application.

Migration must be staged. The first safe route is to add the Rust workspace and prove the first Discord-to-supervisor-to-gate vertical slice before deleting the existing TypeScript/OpenClaw runtime. CI must preserve the repository's strict validation posture throughout the transition.

## Source Baseline

Current important surfaces:

- Root npm workspace: `package.json`, `package-lock.json`, `.nvmrc`, `tsconfig.json`, `turbo.json`, `eslint.config.mjs`, `vitest.package.config.mts`, `commitlint.config.cjs`.
- TypeScript packages: `packages/core`, `packages/config`, `packages/artifacts`, `packages/memory`, `packages/research`, `packages/specs`, `packages/slicing`, `packages/queue`, `packages/worktrees`, `packages/execution`, `packages/gates`, `packages/review`, `packages/remediation`, `packages/prs`, `packages/branching`, `packages/supervisor`, `packages/observability`, `packages/github`, `packages/sonarcloud`, `packages/openclaw`, `packages/discord`, `packages/policy`, `packages/storage`.
- OpenClaw runtime: `packages/openclaw`, generated OpenClaw manifest, `docker/openclaw-runtime`, OpenClaw live-lab workflows and scripts.
- Deployment: `deploy/helm/devplat`, `deploy/artifacthub/devplat`, Docker and Helm publishing workflows.
- Documentation: `site/guide-docs` VitePress site and guide pages.
- Public landing page target: `site/guide-docs`, published by GitHub Pages with guides, developer documentation, LLM output, JSON-LD SEO, and API docs.
- CI/CD: `.github/workflows/ci.yml`, `typescript-matrix.yml`, `docker-publish.yml`, `helm-publish.yml`, `docs-deploy.yml`, `release.yml`, `publish-release.yml`, `sonar-bootstrap-check.yml`, OpenClaw/Discord live-lab workflows.
- Quality system: SonarCloud configured through `sonar-project.properties`, coverage from Vitest LCOV, strict generated-artifact checks.

## Non-Goals

- Do not preserve OpenClaw compatibility.
- Do not ship a Node or TypeScript runtime service.
- Do not keep npm workspaces for application code.
- Do not publish npm packages after the Rust migration completes.
- Do not move business logic into Discord, GitHub, SonarCloud, or Kubernetes adapters.
- Do not require worker process isolation in the first Rust version. Design for it, but start in-process.
- Do not make the docs-hosted public landing page an operator control plane, source of truth, runtime API, or place for Ironloom business logic.
- Do not add a landing-page backend, form Lambda, admin app, or dynamic service unless a later approved product requirement creates that scope.

## Target Repository Structure

```text
.
|-- Cargo.toml
|-- Cargo.lock
|-- rust-toolchain.toml
|-- deny.toml
|-- clippy.toml
|-- sonar-project.properties
|-- AGENTS.md
|-- PLATFORM.md
|-- SECURITY.md
|-- crates
|   |-- ironloom-core
|   |   |-- Cargo.toml
|   |   |-- src/lib.rs
|   |   `-- schemas/
|   |-- ironloom-config
|   |   |-- Cargo.toml
|   |   |-- src/lib.rs
|   |   `-- schemas/
|   |-- ironloom-artifacts
|   |   |-- Cargo.toml
|   |   |-- src/lib.rs
|   |   `-- schemas/
|   |-- ironloom-storage
|   |   |-- Cargo.toml
|   |   `-- src/lib.rs
|   |-- ironloom-policy
|   |   |-- Cargo.toml
|   |   |-- src/lib.rs
|   |   `-- schemas/
|   |-- ironloom-process-graph
|   |   |-- Cargo.toml
|   |   |-- src/lib.rs
|   |   `-- schemas/
|   |-- ironloom-workers
|   |   |-- Cargo.toml
|   |   `-- src/lib.rs
|   |-- ironloom-supervisor
|   |   |-- Cargo.toml
|   |   |-- src/lib.rs
|   |   `-- schemas/
|   |-- ironloom-runtime
|   |   |-- Cargo.toml
|   |   `-- src/main.rs
|   |-- ironloom-discord
|   |   |-- Cargo.toml
|   |   |-- src/lib.rs
|   |   `-- schemas/
|   |-- ironloom-github
|   |   |-- Cargo.toml
|   |   `-- src/lib.rs
|   |-- ironloom-sonarcloud
|   |   |-- Cargo.toml
|   |   `-- src/lib.rs
|   |-- ironloom-gates
|   |   |-- Cargo.toml
|   |   |-- src/lib.rs
|   |   `-- schemas/
|   |-- ironloom-worktrees
|   |   |-- Cargo.toml
|   |   `-- src/lib.rs
|   |-- ironloom-queue
|   |   |-- Cargo.toml
|   |   `-- src/lib.rs
|   `-- ironloom-observability
|       |-- Cargo.toml
|       |-- src/lib.rs
|       `-- schemas/
|-- docker
|   `-- ironloom-runtime
|       |-- Dockerfile
|       `-- entrypoint.sh
|-- deploy
|   |-- artifacthub
|   |   `-- ironloom
|   |       `-- artifacthub-repo.yml
|   `-- helm
|       `-- ironloom
|           |-- Chart.yaml
|           |-- README.md
|           |-- values.yaml
|           |-- values.schema.json
|           `-- templates/
|-- docs
|   `-- specs
|       `-- ironloom-rust-platform-migration.md
|-- site
|   `-- guide-docs
|       |-- .vitepress/
|       |-- api/
|       |-- developers/
|       |-- guides/
|       |-- public/
|       `-- index.md
`-- .github
    |-- actions/
    |-- instructions/
    |-- workflows/
    `-- pull_request_template.md
```

Notes:

- `site/guide-docs` is the VitePress documentation and landing-page surface.
- `site/guide-docs/index.md` is the public landing page. It must remain static, public-safe, and separate from runtime/operator control flows.
- `site/guide-docs` owns product-facing landing content, guides, developer docs, LLM output, JSON-LD SEO, and API docs so GitHub Pages is the first-release public web surface.
- `crates/*/schemas` remains the committed contract surface. Rust types should generate JSON Schema with `schemars` or an equivalent generator.
- `.devplat` runtime data paths should become `.ironloom`. The migration must decide whether to import old `.devplat` records or start clean.

## Rust Workspace Quality Posture

Required gates:

- `cargo fmt --check`
- `cargo clippy --workspace --all-targets --all-features -- -D warnings`
- `cargo test --workspace --all-features`
- `cargo deny check`
- `cargo audit`

Optional but recommended gates:

- `cargo nextest run --workspace --all-features`
- `cargo machete`
- `cargo llvm-cov --workspace --all-features --lcov --output-path target/lcov.info` for SonarCloud coverage.

Workspace lint policy:

- `unsafe_code = "forbid"` at the workspace level.
- Deny warnings in CI.
- Deny `clippy::all`, `clippy::pedantic`, `clippy::nursery`, and `clippy::cargo` where practical.
- Allow exceptions only at the narrowest local scope with a justification comment that names the reason and the tracking issue or follow-up.
- Do not add blanket crate-level `allow` lists for convenience.
- Prefer explicit error types over stringly typed errors.
- Prefer typed IDs and enums over raw strings for domain state.
- Keep public contracts serializable, schema-generatable, and round-trip tested.

Suggested root configuration:

```toml
[workspace]
resolver = "3"
members = ["crates/*"]

[workspace.lints.rust]
unsafe_code = "forbid"
warnings = "deny"

[workspace.lints.clippy]
all = "deny"
pedantic = "deny"
nursery = "deny"
cargo = "deny"
```

## Crate Ownership And Dependency Plan

### `crates/ironloom-core`

Owns:

- Shared domain primitives: typed IDs, repository references, branch references, timestamps, lifecycle status, trace IDs, correlation IDs, run IDs.
- Shared error/result types.
- Common serialization helpers and schema helper traits.
- No side effects.

Does not own:

- Storage layouts.
- Discord, GitHub, or SonarCloud API models.
- Supervisor routing.
- Worker execution.

Depends on:

- Standard library plus foundational crates such as `serde`, `serde_json`, `schemars`, `thiserror`, `time`, `uuid`, and `url`.

### `crates/ironloom-config`

Owns:

- Runtime configuration loading from environment, config files, and Kubernetes-projected secrets.
- Normalization of URLs, repository identity, Discord app configuration, GitHub app/token configuration, SonarCloud project configuration, storage roots, worktree roots, queue settings, process graph defaults, and AI routing settings.
- Redaction-safe config diagnostics.

Does not own:

- Secret retrieval from cloud-specific secret stores.
- Business policy decisions.
- Adapter behavior.

Depends on:

- `ironloom-core`.
- Deserialization/config crates selected during implementation.

### `crates/ironloom-artifacts`

Owns:

- Versioned artifact envelopes.
- Artifact kinds, migration metadata, schema IDs, checksum metadata, producer metadata, and validation diagnostics.
- Contract records produced by the supervisor, gates, process graph, Discord adapter, GitHub adapter, SonarCloud adapter, and workers.

Does not own:

- Persistence.
- Queue semantics.
- Adapter API calls.

Depends on:

- `ironloom-core`.

### `crates/ironloom-storage`

Owns:

- Storage traits and the first filesystem-backed implementation.
- Direct access to `.ironloom/` paths.
- Record layout, index materialization, atomic writes, read/list APIs, and retention hooks.
- Migration/import helpers if `.devplat` data must be preserved.

Does not own:

- Artifact schemas.
- Policy evaluation.
- Supervisor routing.
- Direct Discord/GitHub/SonarCloud calls.

Depends on:

- `ironloom-core`
- `ironloom-artifacts`
- `ironloom-config`

### `crates/ironloom-policy`

Owns:

- Approval policy, privilege levels, risk levels, destructive-action checks, escalation targets, and audit reasons.
- Human approval gate definitions.
- Policy decision records.

Does not own:

- Discord UI rendering.
- GitHub state fetching.
- Worker implementation.

Depends on:

- `ironloom-core`
- `ironloom-artifacts`

### `crates/ironloom-process-graph`

Owns:

- Process graph definitions.
- Node definitions, transitions, required inputs, produced artifact contracts, retry policies, failure states, escalation states, and human approval gate metadata.
- Graph validation and graph compilation.
- Stable graph serialization for audit and replay.

Does not own:

- Worker execution.
- AI provider calls.
- Persistence.
- Discord command parsing.

Depends on:

- `ironloom-core`
- `ironloom-artifacts`
- `ironloom-policy`

### `crates/ironloom-workers`

Owns:

- Worker trait definitions.
- In-process worker registry.
- Functional worker modules for the initial runtime.
- Stable worker request/response envelopes that can later become process or container RPC contracts.

Does not own:

- Supervisor loop decisions.
- Discord/GitHub/SonarCloud transport.
- Kubernetes deployment.

Depends on:

- `ironloom-core`
- `ironloom-artifacts`
- `ironloom-process-graph`
- `ironloom-policy`
- Specific worker-support crates such as `ironloom-gates`, `ironloom-worktrees`, and `ironloom-observability`.

### `crates/ironloom-supervisor`

Owns:

- The supervisor loop.
- Process graph route selection.
- Worker dispatch.
- Retry/escalation handling.
- Human approval pause/resume behavior.
- AI-assisted routing interface and deterministic validation of any AI routing proposal.
- Supervisor decision artifacts.

Does not own:

- Direct API calls to Discord, GitHub, or SonarCloud.
- Storage implementation internals.
- Worker business logic.

Depends on:

- `ironloom-core`
- `ironloom-config`
- `ironloom-artifacts`
- `ironloom-storage`
- `ironloom-policy`
- `ironloom-process-graph`
- `ironloom-workers`
- `ironloom-queue`
- `ironloom-observability`

### `crates/ironloom-runtime`

Owns:

- The deployable binary.
- Runtime wiring, startup validation, graceful shutdown, health/readiness endpoints, signal handling, and background task orchestration.
- Container entrypoint behavior.

Does not own:

- Domain logic.
- Worker logic beyond composition.
- Adapter business rules.

Depends on:

- All runtime crates needed to compose the service: config, storage, queue, supervisor, Discord, GitHub, SonarCloud, gates, worktrees, observability.

### `crates/ironloom-discord`

Owns:

- Discord operator interface.
- Slash command and component payload decoding.
- Discord signature verification for webhook mode if used.
- Gateway interaction handling if private runtime mode remains.
- Thread binding resolution.
- Fail-closed behavior when thread context is missing or ambiguous.
- Posting supervisor responses back to the exact originating thread.

Does not own:

- Business logic.
- Process graph transitions.
- GitHub or SonarCloud decisions.
- Long-term state layout beyond its own adapter records.

Depends on:

- `ironloom-core`
- `ironloom-config`
- `ironloom-artifacts`
- `ironloom-storage`
- `ironloom-policy`
- `ironloom-supervisor` only through narrow input/output types or a runtime-provided command handler trait.
- `ironloom-observability`

### `crates/ironloom-github`

Owns:

- GitHub API client.
- Repository, issue, pull request, review, branch, check, status, and merge-readiness projections.
- GitHub App token handling.
- Source-of-truth reads and auditable write requests.

Does not own:

- Discord flow.
- Policy decisions.
- Worktree filesystem operations.
- Process graph routing.

Depends on:

- `ironloom-core`
- `ironloom-config`
- `ironloom-artifacts`
- `ironloom-policy` for submitting policy-approved actions, not for deciding policy.
- `ironloom-observability`

### `crates/ironloom-sonarcloud`

Owns:

- SonarCloud API client.
- Project bootstrap verification.
- Quality gate status normalization.
- Issue and compliance finding normalization.

Does not own:

- Gate execution.
- Policy decisions.
- GitHub check creation.

Depends on:

- `ironloom-core`
- `ironloom-config`
- `ironloom-artifacts`
- `ironloom-observability`

### `crates/ironloom-gates`

Owns:

- Local gate runner abstractions.
- Command execution wrappers.
- Gate result classification.
- Repository validation gate definitions.
- Cargo gate orchestration for Ironloom itself.
- SonarCloud gate integration points without owning SonarCloud transport.

Does not own:

- Supervisor routing.
- Worktree allocation.
- Discord rendering.

Depends on:

- `ironloom-core`
- `ironloom-artifacts`
- `ironloom-worktrees`
- `ironloom-sonarcloud`
- `ironloom-observability`

### `crates/ironloom-worktrees`

Owns:

- Git worktree allocation, sync, release, and cleanup.
- Branch safety validation.
- Repository path safety.
- Worktree state artifacts.

Does not own:

- GitHub API state.
- Gate execution beyond providing paths.
- Policy decisions.

Depends on:

- `ironloom-core`
- `ironloom-config`
- `ironloom-artifacts`
- `ironloom-observability`

### `crates/ironloom-queue`

Owns:

- Durable queue state and task lifecycle transitions.
- Claim/release/resume state transitions.
- Supervisor work item scheduling.
- Queue storage traits or storage-backed implementation adapters.

Does not own:

- Worker execution.
- Discord commands.
- Process graph definitions.

Depends on:

- `ironloom-core`
- `ironloom-artifacts`
- `ironloom-storage`
- `ironloom-observability`

### `crates/ironloom-observability`

Owns:

- Structured telemetry events.
- Audit records.
- Runtime metrics.
- Correlation and trace propagation.
- Log/metrics/exporter configuration boundaries.

Does not own:

- Business decisions.
- Adapter API calls.
- Storage layout except its own emitted record contracts.

Depends on:

- `ironloom-core`
- `ironloom-artifacts`
- `ironloom-config`

## Existing Package To Rust Crate Mapping

| Current package or surface        | Target crate or action                                                | Notes                                                                                    |
| --------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `@vannadii/devplat-core`          | `ironloom-core`                                                       | Preserve typed domain primitives and result/error discipline.                            |
| `@vannadii/devplat-config`        | `ironloom-config`                                                     | Rename env vars from `DEVPLAT_*` to `IRONLOOM_*`; remove OpenClaw config.                |
| `@vannadii/devplat-artifacts`     | `ironloom-artifacts`                                                  | Preserve artifact-envelope concept with Rust schemas.                                    |
| `@vannadii/devplat-storage`       | `ironloom-storage`                                                    | Rename `.devplat` to `.ironloom`; decide data import policy.                             |
| `@vannadii/devplat-policy`        | `ironloom-policy`                                                     | Preserve fail-closed approvals and audit outcomes.                                       |
| `@vannadii/devplat-supervisor`    | `ironloom-supervisor`                                                 | Promote to core product and runtime decision owner.                                      |
| `@vannadii/devplat-observability` | `ironloom-observability`                                              | Preserve audit and trace records.                                                        |
| `@vannadii/devplat-github`        | `ironloom-github`                                                     | Preserve GitHub as source of truth.                                                      |
| `@vannadii/devplat-sonarcloud`    | `ironloom-sonarcloud`                                                 | Preserve SonarCloud quality/compliance role.                                             |
| `@vannadii/devplat-discord`       | `ironloom-discord`                                                    | Preserve thread-aware operator workflows.                                                |
| `@vannadii/devplat-gates`         | `ironloom-gates`                                                      | Rebuild gate runner around Cargo/Rust and generic repo gates.                            |
| `@vannadii/devplat-execution`     | `ironloom-gates` and `ironloom-workers`                               | Fold command execution into gate/worker boundaries.                                      |
| `@vannadii/devplat-worktrees`     | `ironloom-worktrees`                                                  | Preserve git worktree lifecycle rules.                                                   |
| `@vannadii/devplat-queue`         | `ironloom-queue`                                                      | Preserve durable lifecycle state.                                                        |
| `@vannadii/devplat-openclaw`      | Delete                                                                | No replacement. OpenClaw is dropped entirely.                                            |
| `@vannadii/devplat-memory`        | `ironloom-artifacts`, `ironloom-storage`, future crate only if needed | Keep durable knowledge as artifact/storage records first.                                |
| `@vannadii/devplat-research`      | `ironloom-process-graph` and `ironloom-workers`                       | Model as graph nodes and worker outputs, not a first-class initial crate.                |
| `@vannadii/devplat-specs`         | `ironloom-artifacts` and `ironloom-process-graph`                     | Spec records become artifact contracts and graph inputs.                                 |
| `@vannadii/devplat-slicing`       | `ironloom-process-graph` and `ironloom-workers`                       | Slice planning becomes a graph/worker concern.                                           |
| `@vannadii/devplat-review`        | `ironloom-workers`, `ironloom-artifacts`, future crate only if needed | Review is a worker family producing review artifacts.                                    |
| `@vannadii/devplat-remediation`   | `ironloom-workers`, `ironloom-artifacts`, future crate only if needed | Remediation is a worker family and process graph route.                                  |
| `@vannadii/devplat-prs`           | `ironloom-github`, `ironloom-artifacts`                               | PR lifecycle state is GitHub adapter plus artifacts.                                     |
| `@vannadii/devplat-branching`     | `ironloom-worktrees`, `ironloom-github`, `ironloom-workers`           | Branch refresh and rebase behavior crosses worktree and GitHub boundaries.               |
| `site/guide-docs`                 | `site/guide-docs`                                                           | Rewrite for Ironloom with VitePress, landing page, guides, LLM support, SEO, and API docs. |
| `docker/openclaw-runtime`         | `docker/ironloom-runtime`                                             | Runtime image becomes direct Ironloom service.                                           |
| `deploy/helm/devplat`             | `deploy/helm/ironloom`                                                | Chart deploys Ironloom directly.                                                         |

## Runtime Architecture

### Ironloom Runtime Service

The `ironloom-runtime` binary is the only deployable service in the first release. It loads configuration, opens storage, initializes the queue, registers workers, starts the supervisor loop, starts Discord intake, initializes GitHub and SonarCloud adapters, exposes health/readiness endpoints, and emits audit/telemetry events.

### Supervisor Loop

The supervisor loop is the core product. It consumes work items from Discord, scheduled maintenance, GitHub events, or queue resumes. It evaluates the current process graph state, routes to a worker, records a supervisor decision artifact, executes or schedules the worker, persists produced artifacts, and reports outcomes back through the relevant adapter.

AI may assist route selection, but AI output must be treated as a proposal. The supervisor must validate the proposed node, transition, required inputs, policy gates, and artifact contracts before dispatch. Invalid or ambiguous proposals fail closed into an escalation or clarification state.

### Process Graph

The process graph defines the allowed autonomous engineering workflow. It is the supervisor's route map and audit contract.

Graph concepts:

- **Nodes:** typed units of work such as `discord_command_received`, `resolve_thread_binding`, `run_gate`, `write_artifact`, `post_discord_response`, `await_human_approval`, `escalate_failure`.
- **Transitions:** named edges between nodes, guarded by required state, policy decisions, retry budget, or human approval.
- **Required inputs:** explicit typed inputs needed before a node can run, such as thread ID, repository ID, worktree path, command, gate policy, artifact reference, or approval record.
- **Produced artifacts:** versioned artifact envelopes that prove what happened and feed later nodes.
- **Retry loops:** bounded retry definitions with backoff, retryable failure classification, and final failure behavior.
- **Failure states:** terminal or recoverable states with diagnostics and operational impact.
- **Escalation states:** states that require human intervention, policy override, missing configuration, ambiguous thread binding, or repeated worker failure.
- **Human approval gates:** policy-controlled pauses that record the approver, scope, reason, and approved transition before continuing.

### Worker Registry

Workers start as in-process Rust modules registered through `ironloom-workers`. Each worker receives a typed request envelope and returns a typed response envelope. The envelope is the future process/container isolation boundary, so it must include:

- Worker name and version.
- Request ID and correlation ID.
- Required artifact references.
- Input payload.
- Policy context.
- Timeout and retry metadata.
- Produced artifact references.
- Failure classification.

### Artifact Store

Artifacts are immutable, versioned records. The filesystem implementation writes under `.ironloom/artifacts` with stable indexes for latest-by-kind, by work item, by thread, by pull request, and by run. Writes must be atomic and checksum-addressable.

### Queue And State Store

Queue state tracks work item lifecycle, claims, retries, resumes, and scheduling. The first implementation can be filesystem-backed through `ironloom-storage`; the interfaces should allow later SQLite or Postgres backing without changing supervisor behavior.

### Policy Engine

The policy engine decides whether a transition can run, requires approval, must escalate, or is denied. It must fail closed for destructive actions, ambiguous context, untrusted actor state, missing thread binding, or stale source-of-truth state.

### Discord Adapter

Discord remains the primary operator interface. All lifecycle-changing interactions must be thread-aware. If an interaction cannot be bound to exactly one persisted work item, it fails closed and posts a minimal diagnostic to the operator without executing work.

### GitHub Adapter

GitHub remains the source of truth for repository, issue, branch, pull-request, review, check, and merge state. Discord and local storage may cache or index GitHub state, but the supervisor must refresh GitHub state before source-of-truth decisions such as PR update, merge readiness, or review resolution.

### SonarCloud Adapter

SonarCloud remains the quality and compliance system. Ironloom must preserve bootstrap verification, project/key configuration, quality gate polling, issue normalization, and CI scan integration.

### Gate Runner

The gate runner executes repo validation commands with structured output, timeout, environment, working-directory safety, captured streams, and failure classification. For Ironloom's own repo, the default gate set is Cargo fmt, Clippy, tests, deny, audit, docs build, Docker build, Helm lint/template, and SonarCloud coverage export.

### Worktree Manager

The worktree manager owns local git worktree lifecycle. It must validate branch names, refuse unsafe paths, record allocation/release artifacts, and preserve captured git command output for audit.

### Observability And Audit Pipeline

Every operator action, policy decision, supervisor route, worker execution, artifact write, API submission, and user-visible response must carry a correlation ID. Audit records should be append-only and redaction-safe.

## Docs-Hosted Landing Page Architecture

The public landing page is a static VitePress page under `site/guide-docs`, published through GitHub Pages with the operator and developer documentation. It is not part of the supervisor runtime, does not read `.ironloom`, and does not hold Discord, GitHub, SonarCloud, or AI credentials. It may link users to documentation and support channels, but all operator actions remain in Discord, GitHub, and the runtime control plane.

The implementation should stay intentionally small:

- VitePress source under `site/guide-docs`.
- A first-page product landing page in `site/guide-docs/index.md`.
- Guides, developer docs, and API docs in sibling VitePress chapters.
- A GitHub Pages workflow that builds VitePress, writes the approved `CNAME`, and uploads the generated static site.
- No Rust web app package, WebAssembly target, separate web build, prerenderer, or static-hosting infrastructure in the first release.
- Public-safe content review for the landing page and guide pages before publication.

Docs and landing-page quality gates:

- `npm run docs:build`.
- GitHub Pages artifact upload from the generated VitePress output.
- Link and content review for public-safe copy, credentials, and operator-only details.
- Optional post-publish smoke checks for the root landing page and representative guide pages once Pages is live.

Initial public content should stay product-focused and static: overview, architecture, security/compliance posture, documentation path, and support/contact path. Do not add account sign-in, operator controls, issue submission, or dynamic forms in the first landing-page slice.

## First Vertical Slice

Target flow:

1. A Discord operator invokes a thread-bound command in an existing Discord thread.
2. `ironloom-discord` validates the interaction and resolves exactly one persisted thread binding.
3. `ironloom-discord` sends a typed supervisor input to `ironloom-runtime`.
4. `ironloom-supervisor` compiles the current process graph state and routes to a gate worker.
5. `ironloom-policy` confirms the gate action is allowed for the actor and thread scope.
6. `ironloom-workers` dispatches the gate worker.
7. `ironloom-gates` runs a safe initial gate command, such as repository metadata validation or `cargo fmt --check` once the Rust workspace exists.
8. `ironloom-artifacts` builds a gate result artifact.
9. `ironloom-storage` writes the artifact under `.ironloom`.
10. `ironloom-observability` records telemetry and audit records.
11. `ironloom-discord` posts a concise result back to the exact same Discord thread.

Acceptance criteria for the slice:

- A test proves ambiguous or missing thread binding refuses the action before any worker runs.
- A test proves the supervisor selects the gate worker through the process graph, not hard-coded Discord logic.
- A test proves the gate artifact is written and indexed by thread ID and work item ID.
- A test proves the Discord response targets the originating thread ID.
- A local integration harness can run the whole slice with fake Discord transport and fake gate command.
- A `just proof` recipe can build the runtime image, start the local container, submit setup values, and write a complete proof project under `.ironloom/local-dev/worktrees`.
- No OpenClaw package, manifest, tool definition, or runtime participates in the slice.

## Phased Migration Plan

### Phase 0: Inventory, Guardrails, And Migration Baseline

Purpose:

- Freeze the current TypeScript/OpenClaw behavior as a reference.
- Identify generated artifacts, scripts, workflows, package boundaries, and release paths that need Rust replacements.

File changes:

- Create `docs/specs/ironloom-rust-platform-migration.md`.
- Later implementation may add inventory notes under `docs/specs/` if the migration is split into subordinate specs.

Required work:

- Record the current package list and CI/CD workflows.
- Tag or otherwise record the pre-migration commit for rollback.
- Confirm no implementation PR title or branch name violates repo naming constraints.
- Decide whether to keep history in the same repository or transfer/rename the repository before migration.

Acceptance criteria:

- This planning document is committed.
- The current repository state is clean or intentionally documented.
- The team agrees on repository ownership, registry owner, and domain routing before destructive removal begins.

Rollback:

- Delete the planning document if the migration is abandoned.
- No runtime or source changes exist in this phase.

### Phase 1: Rust Workspace Foundation

Purpose:

- Add the Rust workspace without removing the existing TypeScript scaffold.
- Establish Rust quality gates before any behavior is ported.

File changes:

- Create `Cargo.toml`.
- Create `Cargo.lock`.
- Create `rust-toolchain.toml`.
- Create `deny.toml`.
- Create `clippy.toml`.
- Create `.cargo/config.toml` if needed for consistent CI flags.
- Create crate directories for all target crates under `crates/`.
- Create initial empty `schemas/` directories where contracts will be generated.
- Modify `AGENTS.md` and `.github/instructions/*.md` only after the team approves replacing TypeScript-specific rules.

Required work:

- Define workspace members.
- Configure workspace lints.
- Add minimal crate skeletons with `#![forbid(unsafe_code)]`.
- Add a Rust schema generation convention.
- Add `cargo fmt`, `cargo clippy`, `cargo test`, `cargo deny`, and `cargo audit` documentation.

Acceptance criteria:

- `cargo fmt --check` passes.
- `cargo clippy --workspace --all-targets --all-features -- -D warnings` passes.
- `cargo test --workspace --all-features` passes.
- `cargo deny check` passes.
- `cargo audit` passes.
- Existing npm CI still passes because TypeScript has not been removed yet.

Rollback:

- Remove root Cargo files and `crates/`.
- Existing TypeScript runtime remains untouched.

### Phase 2: Core Contracts, Artifacts, Storage, Policy, Queue, And Process Graph

Purpose:

- Build the internal Rust foundation that replaces `io-ts` contracts, generated JSON schemas, `.devplat` storage records, queue lifecycle state, policy decisions, and supervisor route definitions.

File changes:

- Implement `crates/ironloom-core`.
- Implement `crates/ironloom-artifacts`.
- Implement `crates/ironloom-storage`.
- Implement `crates/ironloom-policy`.
- Implement `crates/ironloom-queue`.
- Implement `crates/ironloom-process-graph`.
- Add generated JSON schemas under the owning crate `schemas/` directories.
- Add schema generation and committed-artifact verification workflow steps.

Required work:

- Define typed IDs and timestamps.
- Define artifact envelope versions.
- Define `.ironloom` storage layout.
- Define policy decision records.
- Define queue lifecycle transitions.
- Define process graph schema.
- Add round-trip tests for every public contract.
- Add storage tests proving atomic write and index behavior.
- Add fail-closed tests for missing or ambiguous policy inputs.

Acceptance criteria:

- All Rust gates pass.
- Generated schemas are deterministic and checked for committed drift.
- Storage tests prove only `ironloom-storage` reads or writes `.ironloom/` directly.
- Process graph validation rejects missing inputs, unknown nodes, invalid transitions, and unbounded retry loops.
- Policy tests prove destructive or ambiguous actions require approval or fail closed.

Rollback:

- Remove the new Rust foundation crates.
- No existing TypeScript runtime behavior is deleted in this phase.

### Phase 3: Supervisor, Worker Registry, Gates, Worktrees, And Observability

Purpose:

- Establish the Rust execution core before adding external adapters.

File changes:

- Implement `crates/ironloom-supervisor`.
- Implement `crates/ironloom-workers`.
- Implement `crates/ironloom-gates`.
- Implement `crates/ironloom-worktrees`.
- Implement `crates/ironloom-observability`.
- Add gate result schemas and supervisor decision schemas.
- Add local integration tests with fake worker and fake storage implementations.

Required work:

- Define supervisor input/output envelopes.
- Define worker request/response envelopes.
- Define gate execution contracts.
- Define worktree allocation/sync/release contracts.
- Define telemetry and audit record contracts.
- Add a gate worker that can run a safe command in a controlled repository path.
- Add process graph route tests proving worker dispatch is graph-driven.
- Ensure worker envelopes can become process/container RPC messages later.

Acceptance criteria:

- Supervisor can route a synthetic work item through a process graph to a fake worker.
- Gate worker returns structured success and failure artifacts.
- Worktree manager refuses unsafe branch names and unsafe paths.
- Observability records include correlation ID, actor, work item, process node, worker name, and artifact references.
- No Discord, GitHub, SonarCloud, or OpenClaw code is required for these tests.

Rollback:

- Disable Rust CI jobs for these crates and remove the phase's crates if needed.
- TypeScript/OpenClaw runtime still remains available.

### Phase 4: Discord, GitHub, SonarCloud, And Runtime Composition

Purpose:

- Rebuild the external control surfaces in Rust and prove the first vertical slice.

File changes:

- Implement `crates/ironloom-discord`.
- Implement `crates/ironloom-github`.
- Implement `crates/ironloom-sonarcloud`.
- Implement `crates/ironloom-config`.
- Implement `crates/ironloom-runtime`.
- Add runtime integration tests and fake transport harnesses.
- Add `docs/specs/` subordinate specs for Discord, GitHub, and SonarCloud only if the implementation plan needs separate review gates.

Required work:

- Discord adapter must resolve thread bindings and fail closed when ambiguous.
- GitHub adapter must read repository/PR/check state from GitHub as source of truth.
- SonarCloud adapter must normalize quality gate and issue state.
- Runtime must wire config, storage, queue, supervisor, workers, adapters, and observability.
- Runtime setup must capture the Discord application ID and generate a Discord authorization URL for the `bot` and `applications.commands` scopes.
- Implement the first vertical slice:
  Discord thread command -> supervisor route -> gate worker -> artifact written -> response posted back to same Discord thread.

Acceptance criteria:

- Full first vertical slice tests pass with fake Discord transport.
- Discord tests prove same-thread response behavior.
- GitHub tests prove source-of-truth reads are separated from cached storage.
- SonarCloud tests prove missing token/project configuration fails the relevant bootstrap path.
- Runtime startup refuses invalid config before accepting work.
- No OpenClaw API, manifest, package, or runtime is involved.

Rollback:

- Keep TypeScript/OpenClaw deployment as the active production path until this phase is accepted.
- Disable the Rust runtime deployment workflow if the slice regresses.

### Phase 5: CI/CD Replacement

Purpose:

- Replace Node/TypeScript validation with Rust validation while preserving strict repository enforcement, SonarCloud, Docker publishing, Helm publishing, and GitHub Pages documentation publishing.

File changes:

- Modify `.github/workflows/ci.yml`.
- Delete or replace `.github/workflows/typescript-matrix.yml`.
- Delete or replace `.github/workflows/openclaw-live-lab.yml`.
- Delete or replace `.github/workflows/openclaw-live-lab-janitor.yml`.
- Modify `.github/workflows/discord-ux-live-lab.yml` to target Ironloom.
- Modify `.github/workflows/docker-publish.yml`.
- Modify `.github/workflows/helm-publish.yml`.
- Modify `.github/workflows/docs-deploy.yml`.
- Modify `.github/workflows/release.yml` and `.github/workflows/publish-release.yml`.
- Modify `.github/actions/detect-release-impact`.
- Modify `.github/actions/publish-helm-chart`.
- Modify `sonar-project.properties`.
- Modify `.github/pull_request_template.md`.

Required work:

- Replace Node setup with Rust setup and Cargo cache.
- Replace lint/typecheck/test jobs with Cargo fmt, Clippy, tests, deny, audit, and optional nextest/machete.
- Replace TypeScript matrix with Rust compatibility validation. Candidate lanes are pinned stable, latest stable, and optionally beta. Confirm MSRV before adding an MSRV lane.
- Replace schema generation checks with Rust schema generation checks.
- Replace Vitest coverage with Rust LCOV coverage for SonarCloud.
- Keep SonarCloud quality gate wait behavior. The CI token must have enough
  SonarCloud project access to submit analysis and read the quality gate result.
- Keep Docker image publication to GHCR.
- Keep Helm chart publication to GHCR OCI.
- Keep GitHub Pages publication for the rewritten documentation and landing page.
- Replace Changesets-based release PR behavior with the selected Rust release/version process.

Acceptance criteria:

- Pull request CI has no TypeScript, ESLint, Vitest, Turbo, Husky, or OpenClaw runtime dependency. Node/npm remain only for the VitePress docs site.
- Main branch publishing still produces GHCR Docker images.
- Helm publish still pushes an OCI chart to GHCR.
- Docs deploy publishes the VitePress landing page and documentation to GitHub Pages.
- SonarCloud receives Rust source, test, coverage, and exclusion configuration.
- PR template validation references Rust gates and Ironloom operator impact.

Rollback:

- Revert workflow changes while keeping Rust code on branch.
- Do not delete the TypeScript workflows until Rust workflows are green on pull request and main.

### Phase 6: Docker And Helm Runtime Replacement

Purpose:

- Replace the OpenClaw runtime image and DevPlat Helm chart with direct Ironloom deployment artifacts.

File changes:

- Delete `docker/openclaw-runtime/`.
- Create `docker/ironloom-runtime/Dockerfile`.
- Create `docker/ironloom-runtime/entrypoint.sh`.
- Delete `deploy/helm/devplat/`.
- Create `deploy/helm/ironloom/`.
- Delete `deploy/artifacthub/devplat/`.
- Create `deploy/artifacthub/ironloom/`.
- Update Docker and Helm workflow references.

Required work:

- Use a multi-stage Rust build.
- Resolve the latest stable Alpine Linux version at implementation time and pin the numeric Alpine minor instead of using a floating `latest` tag.
- Run as a non-root user.
- Expose only the required health/readiness and optional interaction endpoints.
- Mount config and state under Ironloom paths.
- Publish image as `ghcr.io/<registry-owner>/ironloom`.
- Publish Helm chart as `ironloom`.
- Configure chart values for Discord, GitHub, SonarCloud, storage, worktrees, queue, policy, and observability.
- Include k3s-friendly defaults for single-replica deployment, PVC-backed local state, resource limits, probes, service account, network policy if supported, and optional ingress.

Acceptance criteria:

- `docker build` succeeds for `linux/amd64` and `linux/arm64/v8`.
- The image contains no Node runtime.
- Helm lint passes.
- Helm template renders an Ironloom Deployment, not an OpenClaw Deployment.
- Chart values schema validates default values.
- A k3s dry-run or local render proves expected ConfigMap, Secret references, PVC, ServiceAccount, Service, Deployment, and optional Ingress.

Rollback:

- Keep old Docker/Helm artifacts until the Ironloom image and chart are published and tested.
- Revert image/chart workflow references if GHCR publishing fails.

### Phase 7: Documentation, Landing Page, And Branding Rewrite

Purpose:

- Convert all public docs, the docs-hosted landing page, and repo instructions from DevPlat/OpenClaw/TypeScript to Ironloom/Rust/Veritas Labs.

File changes:

- Rewrite `PLATFORM.md`.
- Rewrite `AGENTS.md`.
- Rewrite `SECURITY.md` if contact, domains, or runtime assumptions change.
- Keep `site/guide-docs/` as the VitePress documentation surface.
- Rewrite guide pages for Ironloom.
- Add landing page content, page metadata, public-safe copy, LLM output, JSON-LD SEO, API docs, and GitHub Pages publishing configuration.
- Update `.github/instructions/*.md`.
- Update `.github/ISSUE_TEMPLATE/*.yml`.
- Update `.github/CODEOWNERS` if ownership changes.
- Update `.github/dependabot.yml` from npm to Cargo and GitHub Actions.
- Update repository metadata references in docs and workflows.

Required work:

- Replace product name `DevPlat` with `Ironloom`.
- Replace company/owner references where appropriate with Veritas Labs.
- Replace `devplat` domains and URLs with `ironloom.dev` or `veritaslabs.dev` as appropriate.
- Remove OpenClaw setup and live-lab docs.
- Add supervisor architecture docs.
- Add process graph docs.
- Add Discord operator docs.
- Add GitHub source-of-truth docs.
- Add SonarCloud quality/compliance docs.
- Add Docker and k3s Helm deployment docs.
- Add Rust developer guide.
- Add migration notes for operators moving from `.devplat` to `.ironloom`.
- Add the landing page copy, metadata, and support/documentation links needed for the approved public docs host.
- Keep `site/guide-docs` as the combined public landing, operator documentation, and developer documentation surface.
- Validate that public-facing docs pages do not expose credentials, private repository internals, or Discord/GitHub/SonarCloud control actions.

Acceptance criteria:

- Documentation builds with `npm run docs:build`.
- No public guide page describes OpenClaw as an active runtime.
- Docs explain the first vertical slice and production deployment model.
- Docs preserve the strict validation philosophy.
- Docs identify Discord as primary operator interface and GitHub as source of truth.
- The landing page explains Ironloom's product, architecture, security posture, and documentation path without becoming an operator control plane.

Rollback:

- Docs can be reverted independently if product copy, domains, or release naming decisions change.

### Phase 8: Remove TypeScript, Node, npm, OpenClaw, And Legacy Tooling

Purpose:

- Complete the runtime migration by deleting legacy implementation and tooling after Rust CI, Docker, Helm, docs, and vertical slice are accepted.

File changes:

- Delete root `package.json`.
- Delete `package-lock.json`.
- Delete `.nvmrc`.
- Delete `tsconfig.json`.
- Delete `tsconfig.schemas.json`.
- Delete `turbo.json`.
- Delete `eslint.config.mjs`.
- Delete `vitest.package.config.mts`.
- Delete `commitlint.config.cjs`.
- Delete `.changeset/`.
- Delete Node-specific scripts under `scripts/` after Rust replacements exist.
- Delete TypeScript `packages/`.
- Delete `tools/npm-overrides/` if present.
- Delete OpenClaw generated manifests and manifest checks.
- Remove npm, TypeScript, ESLint, Vitest, Turbo, Changesets, Husky, lint-staged, and Node runtime assumptions from all workflows and docs.

Required work:

- Verify no remaining workflow calls `npm`, `node`, `tsx`, `typescript`, `eslint`, `vitest`, `turbo`, `changeset`, or OpenClaw scripts.
- Verify no runtime image installs Node.
- Verify no docs page directs operators to OpenClaw.
- Verify release process no longer expects Changesets.
- Verify PR template no longer lists npm validation commands.

Acceptance criteria:

- `rg "OpenClaw|openclaw|DevPlat|devplat|npm|node|TypeScript|typescript|ESLint|Vitest|Turbo|Changesets|Husky"` returns only intentional historical migration references or compatibility notes.
- Rust CI is the only code validation path.
- Docker/Helm/docs publishing remains green.
- The first vertical slice still passes after deletion.

Rollback:

- This is the highest-risk phase. Take a pre-removal tag first.
- If deletion breaks release or deployment, revert this phase wholesale rather than mixing old Node scripts into the Rust runtime.

### Phase 9: Production Hardening And k3s Acceptance

Purpose:

- Prove Ironloom is deployable and operable as a standalone service.

File changes:

- Add or update k3s deployment runbooks.
- Add operational dashboards or log queries if selected.
- Add production-readiness tests and Helm smoke tests.

Required work:

- Deploy the Helm chart to a k3s test cluster.
- Verify Discord command intake.
- Verify same-thread response behavior.
- Verify GitHub source-of-truth reads.
- Verify SonarCloud quality gate polling.
- Verify artifact writes to PVC-backed storage.
- Verify queue restart recovery.
- Verify graceful shutdown and restart.
- Verify audit log completeness.

Acceptance criteria:

- A fresh k3s deployment can run the first vertical slice.
- Restarting the pod does not lose queued work or artifact indexes.
- Invalid Discord thread context fails closed.
- Missing GitHub or SonarCloud credentials fail startup or the specific bootstrap path with redacted diagnostics.
- GHCR image and Helm chart references match documentation.

Rollback:

- Roll back Helm release to the previous accepted chart version.
- Keep PVC data intact unless an explicit destructive cleanup is approved.

## CI/CD Migration Details

### Pull Request CI

Target jobs:

- `format`: `cargo fmt --check`
- `lint`: `cargo clippy --workspace --all-targets --all-features -- -D warnings`
- `test`: `cargo test --workspace --all-features` or `cargo nextest run --workspace --all-features`
- `coverage`: `cargo llvm-cov --workspace --all-features --lcov --output-path target/lcov.info`
- `security`: `cargo deny check` and `cargo audit`
- `schemas`: generate JSON schemas and fail if git diff is non-empty
- `docs`: build `site/guide-docs` and confirm the Pages artifact includes the landing page
- `docker`: build Ironloom image without pushing for PRs
- `helm`: lint and template `deploy/helm/ironloom`
- `sonar`: SonarCloud scan with quality gate wait, excluding generated artifacts and deployment files as appropriate

### Release And Publishing

Preserve:

- Docker publishing to GHCR.
- Helm chart publishing to GHCR OCI.
- GitHub Pages docs and landing-page publishing.
- SonarCloud gate enforcement.

Replace:

- Changesets release PRs with the selected Rust release process.
- npm package publishing with Docker/Helm release artifacts unless Veritas Labs chooses to publish Rust crates.
- Node metadata resolution with Cargo workspace version metadata.
- `devplat-openclaw-runtime` image tags with `ironloom` image tags.

### SonarCloud

Update `sonar-project.properties`:

- `sonar.projectKey` should change to the approved Veritas Labs/Ironloom key.
- `sonar.sources=crates`
- `sonar.tests=crates`
- Test inclusions should match Rust test layout.
- Coverage should point to Rust LCOV output.
- Clippy should be reported through a generated JSON report so the repository
  owns the exact lint command that CI enforces.
- Exclusions should include `target/**`, generated schema files if appropriate, deployment artifacts, docs output, and `.ironloom/**`.

## Docker And Helm Migration Details

Docker requirements:

- Multi-stage build.
- Rust build stage uses a pinned Rust toolchain.
- Runtime stage uses the latest stable Alpine Linux numeric release resolved at implementation time.
- Runtime image contains no Node, npm, or OpenClaw files.
- Non-root runtime user.
- Read-only root filesystem where practical.
- Explicit writable mounts for state, cache, and worktrees.
- Entrypoint defaults to serving the runtime and passes explicit runtime commands through for local proof and diagnostics.
- Health/readiness endpoints.
- OCI labels for title, description, source, revision, version, license, and vendor.

Helm requirements:

- Chart name: `ironloom`.
- App name: `ironloom`.
- Image default: `ghcr.io/<registry-owner>/ironloom`.
- No OpenClaw ports, env vars, config, or labels.
- Config values for Discord, GitHub, SonarCloud, storage, queue, policy, process graph, worktrees, and observability.
- Secret references for Discord application ID, Discord token/public key, GitHub app credentials/token, SonarCloud token, and optional AI routing credentials.
- PVC for `.ironloom` state.
- k3s-compatible default resources.
- Probes for health and readiness.
- Optional ingress only if webhook mode is enabled.

## Documentation Migration Details

Docs to preserve conceptually but rewrite:

- Introduction.
- User guide.
- Operator guide.
- Developer guide.
- Architecture.
- Platform lifecycle.
- Quality and performance policy.
- Discord workflows.
- GitHub setup.
- SonarCloud setup and integration.
- Docker usage.
- Helm and k3s deployment.
- Publishing and release.
- Examples.

Docs to remove or replace:

- OpenClaw setup.
- OpenClaw live-lab guide.
- OpenClaw manifest/tool-surface documentation.
- npm package reference.
- TypeScript compatibility documentation.

New docs required:

- Ironloom supervisor overview.
- Process graph model.
- Worker registry and future isolation model.
- Artifact store and `.ironloom` layout.
- Queue/state store.
- Rust quality gates.
- Rust release process.
- k3s operations.
- Initial setup, local encrypted configuration, Docker proof recipes, and environment-variable binding.
- Discord thread-binding rules.
- Discord application authorization and server installation.
- GitHub source-of-truth rules.
- SonarCloud compliance workflow.

## Docs-Hosted Landing Page Migration Details

The public landing page should be part of `site/guide-docs`, not a separate runtime application. This keeps the first release static and governed by the same GitHub Pages workflow as the operator and developer documentation.

Landing-page source layout:

- `site/guide-docs/.vitepress/config.mts` for VitePress configuration.
- `site/guide-docs/.vitepress/config.mts` for navigation, search, sitemap, LLM output, JSON-LD, and metadata configuration.
- `site/guide-docs/index.md` for the public landing page.
- Focused guide pages under `site/guide-docs/guides/`, developer pages under `site/guide-docs/developers/`, and API docs under `site/guide-docs/api/`.
- `docs-deploy.yml` for GitHub Pages publication and `CNAME` writing after the hostname is approved.

Landing-page deployment model:

- Pull requests build VitePress through CI.
- Main publishes the VitePress output to GitHub Pages.
- Production publishing writes `ironloom.dev` into `CNAME`.
- Post-publish smoke tests should fetch the landing page and representative guide pages once Pages is live.

Landing-page content model:

- Public copy lives in the VitePress introduction and supporting guide pages.
- The first release is English-only unless Veritas Labs approves a localization plan.
- Public content should emphasize product identity, architecture, security/compliance posture, deployment model, and links to docs/support.
- Operator-only procedures can remain in `site/guide-docs`, but pages linked from the landing page must avoid credentials, private-only repository details, and active control instructions.

Landing-page validation:

- `npm run docs:build` must pass locally and in CI.
- CI should keep docs publishing independent from runtime image and Helm publishing.
- Optional link checks and post-publish smoke checks may be added.

## Branding Rename Checklist

Repository and product:

- Rename DevPlat to Ironloom in user-facing docs.
- Rename package/crate prefixes to `ironloom-*`.
- Rename runtime binary to `ironloom`.
- Rename Docker image to `ironloom`.
- Rename Helm chart to `ironloom`.
- Rename Kubernetes labels from `devplat` to `ironloom`.
- Rename `.devplat` runtime storage path to `.ironloom`.
- Rename env vars from `DEVPLAT_*` to `IRONLOOM_*`.
- Replace OpenClaw references with Ironloom supervisor/runtime references.

Company and domains:

- Replace VannaDii ownership references with Veritas Labs where the repository and publication ownership actually moves.
- Use `veritaslabs.dev` for company pages, support, legal, and organization-level docs.
- Use `ironloom.dev` for the public landing page, guides, developer docs, LLM output, and API docs.
- Use repository-path GitHub Pages or `docs.ironloom.dev` only as a compatibility redirect if needed later.
- Add GitHub Pages `CNAME` only after DNS ownership and target domain are approved.

Publishing:

- Replace GHCR package names.
- Replace Artifact Hub metadata.
- Replace OCI labels.
- Replace release body text.
- Replace support and documentation URLs.

Policy:

- Update branch-name and PR-title rules without using registered tool names in those names.
- Keep conventional commit PR title requirements.
- Replace Changesets-entry requirements with the approved Rust release-note or release-impact requirement.

## Migration Risks

High risks:

- Deleting TypeScript/OpenClaw before Rust CI and the first vertical slice are proven would remove the only working enforcement and runtime path.
- Process graph scope can expand into a full workflow engine. Keep the first graph minimal and typed.
- AI routing can create non-determinism. Treat AI output only as a proposal and validate against a compiled graph.
- Discord thread binding mistakes can trigger work in the wrong context. Fail closed and test ambiguity heavily.
- GitHub cached state can drift. Refresh GitHub before source-of-truth decisions.
- SonarCloud Rust coverage and quality gate configuration may not match the current TypeScript setup. Prove coverage import early.
- Alpine/musl builds can expose native TLS, OpenSSL, git, or CA certificate issues. Build and run container smoke tests early.
- Removing Changesets requires a replacement release/version discipline before release workflows are deleted.
- Docs generator migration can accidentally break GitHub Pages URLs.
- Docs-hosted landing-page work can accidentally mix product marketing, operator documentation, and runtime control concerns unless public-safe content rules are enforced in `site/guide-docs`.
- GitHub Pages publishing can break domain cutover or certificate validation if DNS ownership is not approved before the `CNAME` is enabled.
- Repository rename or transfer can break GHCR image paths, Pages, SonarCloud project keys, GitHub App installation, Discord OAuth redirect URLs, and webhook endpoints.

Mitigations:

- Add Rust alongside TypeScript first.
- Keep phase boundaries reviewable and revertible.
- Prove fake-transport vertical slice before live Discord.
- Prove Docker and Helm before deleting old Docker and Helm.
- Take a pre-removal tag before Phase 8.
- Keep all destructive deletion in one final removal phase after green CI.

## Rollback Strategy

General rollback rules:

- Prefer reverting whole phases instead of mixing old and new architecture.
- Never roll back by reintroducing OpenClaw into Ironloom crates.
- Keep TypeScript/OpenClaw deployment active until Ironloom runtime, Docker image, Helm chart, docs, landing page, and CI are accepted.
- Preserve old deployment artifacts until the Ironloom chart is deployed successfully to k3s.
- Preserve `.devplat` data until `.ironloom` import or clean-start policy is approved.

Operational rollback:

- For CI-only failures, revert workflow changes and keep Rust code on branch.
- For container failures, revert Docker workflow/image references.
- For Helm failures, roll back the Helm release to the previous chart version and keep PVC data.
- For docs or landing-page failures, revert docs generator, Pages workflow, or content changes independently.
- For Phase 8 deletion failures, revert the entire deletion commit.

## Acceptance Criteria For Complete Migration

Repository:

- The root runtime workspace is Rust/Cargo, not npm.
- No TypeScript package remains as an application/runtime package.
- No OpenClaw package, generated manifest, runtime image, live-lab workflow, or documentation remains except historical migration notes.
- The target crate list exists and passes all required Rust gates.

Runtime:

- `ironloom-runtime` starts from validated config.
- The supervisor loop is the central route owner.
- Workers execute through the worker registry.
- Worker envelope design supports later process/container isolation.
- AI-assisted routing is validated before any side effect.

Control planes:

- Discord remains the primary operator interface.
- Discord lifecycle actions are thread-aware and fail closed when ambiguous.
- GitHub remains source of truth for repos, PRs, checks, and merge state.
- SonarCloud remains quality/compliance gate.

Delivery:

- Docker image builds from latest stable Alpine Linux pinned by numeric version.
- Docker image contains no Node runtime.
- Helm chart deploys Ironloom directly.
- k3s deployment can run the first vertical slice.
- GHCR Docker and Helm publication work.
- GitHub Pages publishes the Ironloom landing page and docs.
- Public docs output is static, public-safe, and separated from runtime/operator control surfaces.

Quality:

- `cargo fmt --check` passes.
- `cargo clippy --workspace --all-targets --all-features -- -D warnings` passes.
- `cargo test --workspace --all-features` passes.
- `cargo deny check` passes.
- `cargo audit` passes.
- Optional `cargo nextest` and `cargo machete` are wired if approved.
- SonarCloud quality gate passes with Rust coverage.

## Resolved Migration Decisions And External Acceptance

The implementation resolved the plan's original open questions as follows:

1. Repository ownership stays in place for the first Ironloom release at `VannaDii/ironloom`. A later transfer to a Veritas Labs organization is outside this migration.
2. GHCR ownership follows the GitHub repository owner in the publishing workflows. Current release references are `ghcr.io/vannadii/ironloom` for the runtime image and `oci://ghcr.io/vannadii/charts/ironloom` for the Helm chart.
3. SonarCloud remains in organization `vannadii` and the Ironloom project key is `vannadii_ironloom`. The old `vannadii_devplat` project is no longer the intended analysis target. CI verifies the Ironloom project before scanning, creates it when SonarCloud returns 404, and aligns the SonarCloud main branch with the GitHub default branch. The `SONAR_TOKEN` GitHub secret must belong to a SonarCloud principal that can create/read the project, manage the main branch, submit analysis, and read the project quality gate.
4. Ironloom does not publish Rust crates in the first release. `publish = false` remains set and Docker image plus Helm chart are the release artifacts.
5. GitHub Pages uses `https://ironloom.dev` for the docs-hosted landing page, guides, developer documentation, LLM output, JSON-LD SEO, and API docs.
6. `ironloom.dev` is the first-release public site, not an operator control plane. DNS ownership remains external to the repository, while the repo owns the `CNAME` and Pages workflow.
7. Existing `.devplat` runtime records are treated as pre-Ironloom state. They are not automatically imported; any future import requires an explicit operator-approved migration.
8. PVC-backed filesystem state remains the first-release storage backend. SQLite, Postgres, or object storage are deferred until scale requirements justify another backend.
9. AI-assisted work uses OpenAI authentication through either API key or ChatGPT OAuth session, provided by environment bindings or encrypted setup. Environment values take precedence, and no AI side effect runs before required runtime configuration validates.
10. Discord interaction webhooks with Ed25519 signature verification are the first-release deployment mode. Gateway operation is deferred.
11. First-release human approval policy remains fail-closed for ambiguous or destructive actions. Multi-approver policy is deferred until a concrete approval workflow is specified.
12. Changesets are replaced by GitHub release, Docker publish, and Helm publish workflows. No crate-release workflow is part of the first release.
13. `Ironloom` is the product name, not a registered tool name for branch-name or PR-title restrictions.
14. The supported Rust toolchain is latest stable as pinned by `rust-toolchain.toml`; there is no separate MSRV lane yet.
15. First-release workers run in process through the typed registry. Process/container isolation remains an envelope-compatible future extension.
16. The first-release docs site includes localized guide and API pages, and documentation must stay updated across affected locales when documented functionality changes.

External acceptance still requires live evidence after these changes land on `main`:

- The `vannadii_ironloom` SonarCloud project exists, or CI bootstraps it with `SONAR_TOKEN`, and the SonarCloud quality gate passes with Rust coverage and imported Clippy JSON.
- GHCR image and Helm chart publication workflows publish the Ironloom artifacts.
- GitHub Pages publishes `https://ironloom.dev` from the current VitePress site.
- `just external-probe` passes with real bound GitHub and SonarCloud credentials.
- A real Discord application posts signed interaction traffic to the deployed runtime URL and receives same-thread responses.
