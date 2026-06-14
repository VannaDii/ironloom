# Introduction

Ironloom is a Rust supervisor runtime by Veritas Labs for auditable engineering operations.

It coordinates Discord operator actions, GitHub source-of-truth state, SonarCloud quality gates, worker execution, immutable artifacts, and k3s deployment through a direct Rust runtime.

## Platform Shape

- Discord is the primary operator interface.
- GitHub remains the source of truth for repository, pull-request, check, and merge state.
- SonarCloud remains the quality and compliance gate.
- Kubernetes delivery targets k3s through the Ironloom Helm chart.
- Runtime state is stored under `.ironloom` with auditable artifacts and indexes.

## Documentation Map

- [Guides](/guides/getting-started) cover setup, deployment, and operator workflows.
- [Developer docs](/developers/architecture) explain crate boundaries and validation gates.
- [API docs](/api/) reference configuration, HTTP routes, storage, schemas, and crates.
- [LLM output](/llms.txt) exposes the site content in model-readable form.

Operator controls stay in Discord, GitHub, and the runtime control plane. This static site does not hold runtime credentials or execute lifecycle actions.
