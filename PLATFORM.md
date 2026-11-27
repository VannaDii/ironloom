# Ironloom Platform Foundation

Ironloom's target is a Rust software factory and persistent background harness service by Veritas Labs. Humans refine ideas, answer questions, approve plans, and configure a role-based digital team. The service owns a streaming web UX and must support native ChatGPT/Codex remote-host control. Discord control and thread binding are retired from the target design.

**Status:** This is the agreed direction, not the current implementation. The [Software Factory Plan](docs/specs/ironloom-software-factory.md) records requirements, migration stages, and unresolved decisions. Implementation remains pending approval. The [Rust migration plan](docs/specs/ironloom-rust-platform-migration.md) is historical.

## Required Product Scope

- Concept refinement and repeated questions until no material questions remain or the human says enough; versioned plans require human approval before execution.
- Configurable roles and a standard team covering product management, planning, implementation, testing, review, and documentation. Humans must select a model and applicable reasoning effort for every enabled role, including orchestration.
- Local orchestration and OpenAI/Anthropic coding support, with capable local models usable for coding roles. No silent model, credential, or billing fallback.
- OpenAI OAuth usable for remote control only or additionally for eligible inference; API keys are optional when OAuth covers inference. Anthropic BYOK and local inference remain separate choices.
- Native remote-host control of Ironloom-owned sessions, not a plugin substitute. Client/relay compatibility remains unverified and is the first feasibility task.
- Authenticated, durable, streaming web chat and configuration; background work survives browser disconnection. Incomplete setup defaults to a small resumable setup screen without restricting access to other available pages. Completed setup defaults to a project dashboard ordered by most recent human interaction. Service health/readiness remains separate from assignment execution readiness.
- Model discovery/download access through Hugging Face, ModelScope, Kaggle Models, and official Alibaba/Qwen, Mistral, and DeepSeek catalogs/distributions. Preserve publisher/host distinctions and access/license requirements.
- Service-owned GPU discovery, selection, optional role/model GPU bindings, compatibility estimates, embedded inference, and LRU model residency. Active inference protects a loaded model; an idle worker or one waiting on tools does not.
- Prefer Rust inference. Python embedding and engine porting each require Vanna's explicit approval; neither is an automatic fallback.
- Configurable SQLite or PostgreSQL organizational/execution storage. Infrastructure configures separate persistent roots for models, the local database (unused with PostgreSQL), and projects/Git. Stable project IDs, names, and service identity remain available independently of project folders.
- Configurable project storage with assignment worktrees and sibling role artifacts. Roles may write concurrently in the same worktree within enforced path boundaries; all worker commands go through Ironloom tools and enforced execution permissions.
- Coordinated Git mutations, content-specific tests/review, durable ownership, and cleanup that preserves needed work and shared models. Pause assignment source edits during final validation/commit; relevant subsequent edits invalidate affected results. Cancellation and timeout clean up owned descendant processes.
- OpenTelemetry context across operations: project ID/name, worker ID/role/name, model mode/ID/provider/provenance, execution IDs, timing, outcomes/errors, and usage. Durable budget accounting requires no extra inference and must not wait for telemetry collectors.
- GitHub remains the source of truth for published specs, repository state, pull requests, reviews, checks, and merges. SonarCloud remains the quality/compliance integration.

## Runtime and Package Boundaries

- Keep the Rust workspace under `crates/*`; `ironloom-runtime` remains the deployable service and composition boundary.
- `ironloom-core` owns shared typed identities and domain values; `ironloom-config` owns configuration and setup completeness.
- `ironloom-supervisor` owns routing and dispatch; `ironloom-process-graph`, `ironloom-queue`, `ironloom-policy`, and `ironloom-workers` own their existing domain boundaries as durable execution is added.
- `ironloom-storage` owns persistence abstractions, managed artifacts, and direct `.ironloom/` access. `ironloom-artifacts` owns domain record/schema contracts; `ironloom-worktrees` owns Git workspace lifecycle.
- `ironloom-gates`, `ironloom-github`, `ironloom-sonarcloud`, and `ironloom-observability` retain their validation, source-of-truth, normalization, and telemetry ownership.
- Separate web/native protocol transport and model/inference adapters from business logic. Exact new crate boundaries remain an implementation-plan decision.
- Remove `ironloom-discord` and its configuration, schemas, workflows, deployment fields, and active documentation as replacement behavior lands. Preserve needed historical domain records.
- Keep the public landing page and VitePress guides/API docs in `site/guide-docs`, separate from the service-hosted operator UX. Update English and every affected localized tree with behavior changes.
- Support native macOS and native Linux as well as Alpine-targeted containers. Retain the non-root runtime image in `docker/ironloom-runtime`, direct k3s Helm chart in `deploy/helm/ironloom`, Artifact Hub metadata, and GitHub Actions publishing. Isolate platform-specific GPU/inference and execution mechanisms from shared domain logic; qualify their hardware/backend coverage explicitly.
- Persist complete project folders and shared model storage across pod replacement, and keep database/service identity outside project storage. Do not use temporary worktree volumes for durable assignments.

## First Complete Factory Slice

After native-host feasibility and required configuration are resolved:

1. A human refines an idea through chat and approves a specific plan revision.
2. The supervisor creates an assignment and worktree, using human-configured roles/models.
3. Tester, implementor, reviewer, and documentation roles collaborate with focused context and enforced write boundaries.
4. Existing required gates and review evaluate the exact delivered content; relevant later edits invalidate affected results.
5. Results and usage are persisted and streamed to the operator with OTel correlation.
6. Delivery follows configured owner authority; worktree cleanup waits for worker release and preservation of required changes.

This is a target slice, not an accepted implementation result. Native remote-client compatibility, detailed hardware/backend coverage for the required platforms, engine selection, and first-release operator topology remain open in the detailed plan.

## Quality Gates

Preserve all existing requirements:

```sh
cargo fmt --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace --all-features
cargo run -p ironloom-schemas -- --check
cargo deny check
cargo audit
just scripts-test
npm run docs:build
helm lint deploy/helm/ironloom
helm template ironloom deploy/helm/ironloom
```

Docker Buildx builds the runtime image; Helm publishes an OCI chart; GitHub Pages publishes the static site at `https://ironloom.dev`; SonarCloud receives Rust LCOV coverage. Bootstrap validation, policy enforcement, schema alignment, security audit, and publishing checks are not relaxed by this change in direction.

Use focused regression tests and existing checks. Do not create substantiating artifacts, independent auditors, or bespoke evidence generators. Required domain records and functional fixtures remain valid product data.
