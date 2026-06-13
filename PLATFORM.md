# Ironloom Platform Foundation

Ironloom is a Rust supervisor runtime by Veritas Labs for auditable autonomous engineering operations. Discord is the primary operator interface, GitHub is the source of truth for repository and pull-request state, SonarCloud is the quality and compliance system, and Kubernetes delivery targets k3s through a direct Ironloom Helm chart.

## Required Surfaces

- Rust workspace under `crates/*`.
- Deployable runtime binary in `crates/ironloom-runtime`.
- Public landing page, operator docs, and developer docs in `docs/site`.
- Docker image in `docker/ironloom-runtime`.
- Helm chart in `deploy/helm/ironloom`.
- Artifact Hub metadata in `deploy/artifacthub/ironloom`.
- GitHub Actions for Rust CI, Docker publishing, Helm publishing, docs publishing, release notes, Discord harness tests, and SonarCloud bootstrap checks.

## Required Crates

- `ironloom-core`: typed IDs, repository and branch primitives, shared errors.
- `ironloom-config`: runtime configuration validation.
- `ironloom-artifacts`: immutable artifact envelopes and schema contracts.
- `ironloom-storage`: `.ironloom/` filesystem state and indexes.
- `ironloom-policy`: fail-closed policy decisions.
- `ironloom-process-graph`: typed process graph validation and routing.
- `ironloom-queue`: durable work item lifecycle contracts.
- `ironloom-observability`: audit and telemetry records.
- `ironloom-worktrees`: local git worktree safety.
- `ironloom-gates`: gate execution contracts.
- `ironloom-workers`: worker request and response envelopes.
- `ironloom-supervisor`: process graph route selection and worker dispatch.
- `ironloom-discord`: thread-aware operator adapter.
- `ironloom-github`: GitHub source-of-truth projections.
- `ironloom-sonarcloud`: SonarCloud quality/compliance normalization.
- `ironloom-runtime`: service composition, health, and readiness.

## First Vertical Slice

The first accepted slice is:

1. A fake Discord command is bound to exactly one thread/work item.
2. The Discord adapter fails closed for missing or ambiguous bindings.
3. The supervisor selects the gate worker through the process graph.
4. Policy permits only a thread-bound non-destructive gate action.
5. The gate worker returns a structured result.
6. Storage writes an immutable artifact under `.ironloom` and indexes it by thread and work item.
7. The fake Discord transport replies to the originating thread.

## Quality Gates

Required:

- `cargo fmt --check`
- `cargo clippy --workspace --all-targets --all-features -- -D warnings`
- `cargo test --workspace --all-features`
- `cargo deny check`
- `cargo audit`
- `mdbook build docs/site`
- `helm lint deploy/helm/ironloom`
- `helm template ironloom deploy/helm/ironloom`

Expected publishing gates:

- Docker Buildx builds `docker/ironloom-runtime/Dockerfile`.
- Helm publishes `deploy/helm/ironloom` as an OCI chart.
- GitHub Pages publishes the docs-hosted public landing page.
- SonarCloud receives Rust LCOV coverage from `cargo llvm-cov`.

## Acceptance Criteria

- The root runtime workspace is Rust/Cargo.
- No legacy application/runtime package remains.
- No active legacy adapter package, generated manifest, runtime image, live-lab workflow, or operator guide remains.
- The target crate list exists and passes all required Rust gates.
- Discord lifecycle actions are thread-aware and fail closed when ambiguous.
- GitHub remains source of truth for repository, pull-request, check, and merge state.
- SonarCloud bootstrap validation fails closed when required project or token configuration is missing.
- Docker image contains no Node runtime and runs as a non-root user.
- Helm chart deploys Ironloom directly with PVC-backed `.ironloom` state.
- Docs build through the approved Node-free static documentation toolchain.
