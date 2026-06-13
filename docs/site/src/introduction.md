# Ironloom

Ironloom is a Rust supervisor runtime by Veritas Labs for auditable autonomous engineering operations.

It coordinates Discord operator actions, GitHub source-of-truth state, SonarCloud quality gates, worker execution, immutable artifacts, and k3s deployment through a direct Rust runtime.

## Platform Shape

- Discord is the primary operator interface.
- GitHub remains the source of truth for repository, pull-request, check, and merge state.
- SonarCloud remains the quality and compliance gate.
- Kubernetes delivery targets k3s through the Ironloom Helm chart.
- Runtime state is stored under `.ironloom` with auditable artifacts and indexes.

## Documentation

- [Architecture](architecture.md) explains the supervisor, process graph, adapters, storage, and deployment boundaries.
- [Operator Guide](operator-guide.md) covers thread-bound operator workflows and fail-closed behavior.
- [Developer Guide](developer-guide.md) lists the Rust workspace validation flow and schema generation commands.
- [Deployment](deployment.md) covers Docker, Helm, k3s dry runs, smoke checks, rollback, and GitHub Pages publishing.
- [Quality Gates](quality-gates.md) summarizes the required validation posture.

Operator controls stay in Discord, GitHub, and the runtime control plane. This documentation site is static and does not hold runtime credentials or execute lifecycle actions.
