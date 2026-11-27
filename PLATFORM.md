# Ironloom Platform Foundation

Ironloom's target is a Rust software factory and persistent background harness service by Veritas Labs. Humans refine ideas, answer questions, approve plans, and configure a role-based digital team. The service owns a streaming web UX and must support native ChatGPT/Codex remote-host control. Discord control and thread binding are retired from the target design.

**Status:** This is the agreed direction, not the current implementation. The [Software Factory Plan](docs/specs/ironloom-software-factory.md) records requirements, migration stages, and unresolved decisions. Implementation remains pending approval. The [Rust migration plan](docs/specs/ironloom-rust-platform-migration.md) is historical.

## Required Product Scope

- Concept refinement and repeated questions until no material questions remain or the human says enough; versioned plans require human approval before execution.
- Configurable roles and a standard team covering product management, planning, implementation, testing, review, and documentation. Humans must select a model and applicable reasoning effort for every enabled role, including orchestration.
- Role instructions guide workflow decisions; the service enforces authority, required gates, and execution consistency. Ask the operator whenever instructions leave a gap, conflict, or uncertainty, while allowing independent authorized work to continue.
- Remember operator questions and answers with their source and scope. For similar questions, remind/propose the previous choice without treating similarity as authorization. Respect clear standing instructions and later corrections; do not silently promote a local answer into a global rule.
- Copy instructions into each workflow-run/assignment's storage. Instruction edits ask whether to update active work: No preserves existing copies; Yes updates them and notifies affected workflows/workers to reload.
- Local orchestration and OpenAI/Anthropic coding support, with capable local models usable for coding roles. No silent model, credential, or billing fallback.
- OpenAI OAuth usable for remote control only or additionally for eligible inference; API keys are optional when OAuth covers inference. Anthropic BYOK and local inference remain separate choices.
- Native remote-host control of Ironloom-owned sessions, not a plugin substitute. Vanna's connected VM services establish that the Codex Desktop remote-host mechanism works; the first integration task is mapping Ironloom to that mechanism and verifying its own client/relay compatibility.
- Authenticated, durable, streaming web chat and configuration; background work survives browser disconnection. Incomplete setup defaults to a small resumable setup screen without restricting access to other available pages. Completed setup defaults to a project dashboard ordered by most recent human interaction. Service health/readiness remains separate from assignment execution readiness.
- Support multiple human accounts with local login and OpenID Connect. The first authenticated user to redeem the initial setup token becomes the sole initial administrator; atomically consume the token, persist bootstrap completion, and never mint replacement administrator tokens. The established administrator assigns other users' permissions. OpenFGA is the selected fine-grained authorization service. Enforce tools through an Airlock-style gateway, live resource-permission checks, and native process/filesystem isolation; this does not select a WorkOS dependency.
- Build the operator UI in Flutter/Dart for web first. Derive the web API base from the serving address/path; future desktop/mobile clients require a server address. Keep public VitePress docs and Rust domain logic separate.
- Persist work on graceful shutdown and make a best effort on catchable termination signals. Forced termination may lose recent progress and require repeated inference; reconcile uncertain external mutations before retrying. Startup distinguishes missing configuration from storage, corruption, and decryption failures and presents completion/correction guidance without resetting identity.
- Stream command output and inference where supported, with bounded buffering and configurable runaway/repetition monitoring. Keep generation controls independent of optional monetary budgets.
- Model discovery/download access through Hugging Face, ModelScope, Kaggle Models, and official Alibaba/Qwen, Mistral, and DeepSeek catalogs/distributions. Preserve publisher/host distinctions and access/license requirements.
- Service-owned GPU discovery, selection, optional role/model GPU bindings, compatibility estimates, embedded inference, and LRU model residency. Active inference protects a loaded model; an idle worker or one waiting on tools does not.
- Engine/version/backend capabilities drive model discovery and installation filters during primary build-out. Allow complementary engines behind a common interface if selected, with shared memory/LRU coordination and explicit engine choice per model profile. Model settings remain operator configuration.
- Prefer Rust inference. Python embedding and engine porting each require Vanna's explicit approval; neither is an automatic fallback.
- PostgreSQL-only organizational/execution and authorization storage. Use the configured connection string or manage PostgreSQL locally when none is configured; connection failures must not initialize a replacement database. Infrastructure configures separate persistent roots for models, managed PostgreSQL data (unused with an external server), and projects/Git. Stable project IDs, names, and service identity remain available independently of project folders.
- Multiple service instances share one installation, including users, projects, runs, authorization, and the one-time administrator bootstrap. Track node-specific workspace/GPU ownership and coordinate dispatch without duplicate execution. Shared metadata does not imply shared local files. Managed PostgreSQL port exposure is explicit, and client shutdown must preserve a database still serving other instances.
- Configurable project storage with assignment worktrees and sibling role artifacts. Roles may write concurrently in the same worktree within enforced path boundaries; all worker commands go through Ironloom tools and enforced execution permissions.
- Coordinated Git mutations, content-specific tests/review, durable ownership, and cleanup that preserves needed work and shared models. Pause assignment source edits during final validation/commit; relevant subsequent edits invalidate affected results. Cancellation and timeout clean up owned descendant processes.
- The planner sets merge order with implementors. Each implementor owns its merge, conflict resolution, final integrated testing, and repairs before declaring the merge complete; runtime coordination and existing gates enforce safe execution.
- Setup must explicitly confirm the proposed branch/PR delivery mode or the human's alternative; a displayed default is not permission. Merge/deploy require approval under the proposed mode unless explicitly configured otherwise.
- OpenTelemetry context across operations: project ID/name, worker ID/role/name, model mode/ID/provider/provenance, execution IDs, timing, outcomes/errors, and usage. Durable budget accounting requires no extra inference and must not wait for telemetry collectors.
- Budget limits are optional and editable throughout active work. Usage tracking continues without limits; changes govern subsequent dispatch while accounting for in-flight work and uncertain usage.
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
- Linux/Alpine GPU backends may ship explicitly unqualified until tested on the corresponding hardware. Mac inference and simulated GPU behavior cannot qualify them; show this separately from estimated model fit.
- Persist complete project folders and shared model storage across pod replacement, and keep database/service identity outside project storage. Do not use temporary worktree volumes for durable assignments.

## First Complete Factory Slice

After Ironloom's native-host integration and required configuration are qualified:

1. A human refines an idea through chat and approves a specific plan revision.
2. The supervisor creates an assignment and worktree, using human-configured roles/models.
3. Tester, implementor, reviewer, and documentation roles collaborate with focused context and enforced write boundaries.
4. Existing required gates and review evaluate the exact delivered content; relevant later edits invalidate affected results.
5. Results and usage are persisted and streamed to the operator with OTel correlation.
6. Delivery follows configured owner authority; worktree cleanup waits for worker release and preservation of required changes.

This is a target slice, not an accepted implementation result. Resource grants and authorization packaging, shared implementation contracts, native transport/persistence integration, platform/backend coverage, and inference-engine selection remain open in the detailed plan.

## Implementation Phases

Agree shared contracts before dividing work. Primary build-out runs on Cinder and Ivy with deterministic model/provider/engine fixtures and no Ironloom inference, including no hosted generation or embeddings. Proposed ownership: Cinder owns durable service/execution and shared composition; Ivy owns operator UX and external/model adapters. Exact new paths and interfaces must be agreed before concurrent edits. Coding agents may use their own configured models to perform development.

Combine both lanes on the Mac and validate the integrated service without inference first. Real inference and related fixes follow on the Mac only after that phase is authorized and the human configures the models. Planning does not dispatch work or authorize inference. Keep all existing quality gates and Python/engine-porting approval requirements.

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
