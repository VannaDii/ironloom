# Ironloom

Ironloom is a Rust supervisor runtime for auditable autonomous engineering operations. It coordinates Discord operator commands, GitHub source-of-truth state, SonarCloud quality gates, worker execution, immutable artifacts, and k3s deployment through typed Rust crates.

## Workspace

- `crates/ironloom-runtime`: deployable binary and health/readiness server.
- `crates/ironloom-supervisor`: process graph route selection and registry-backed worker dispatch.
- `crates/ironloom-discord`: thread-aware operator adapter and signed interaction intake.
- `crates/ironloom-github`: GitHub source-of-truth API reads, HTTP transport, and repository projections.
- `crates/ironloom-sonarcloud`: SonarCloud bootstrap, HTTP transport, quality gate polling, and issue normalization contracts.
- `crates/ironloom-storage`: `.ironloom` filesystem-backed state, artifact indexes, encrypted setup config, and thread bindings.
- `site/guide-docs`: VitePress public landing page, guides, developer docs, LLM output, and API docs.
- `docker/ironloom-runtime`: runtime image.
- `deploy/helm/ironloom`: k3s-friendly Helm chart.

## Validation

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

Or use the local gate shortcut:

```sh
just gates
```

## Runtime

Run the local HTTP server with setup enabled:

```sh
IRONLOOM_BIND_ADDR=127.0.0.1:8080 \
IRONLOOM_PUBLIC_URL=https://ironloom.dev \
IRONLOOM_STATE_ROOT=/tmp/ironloom/.ironloom \
IRONLOOM_CONFIG_KEY="$(openssl rand -base64 32)" \
IRONLOOM_INSTALLER_TOKEN="$(openssl rand -base64 32)" \
IRONLOOM_DISCORD_APPLICATION_ID=123456789012345678 \
IRONLOOM_DISCORD_TOKEN=local-discord-token \
IRONLOOM_DISCORD_PUBLIC_KEY=local-discord-public-key \
IRONLOOM_GITHUB_TOKEN=local-github-token \
IRONLOOM_SONARCLOUD_TOKEN=local-sonar-token \
IRONLOOM_SONARCLOUD_ORGANIZATION=local-sonar-org \
IRONLOOM_SONARCLOUD_PROJECT_KEY=local-sonar-project \
IRONLOOM_OPENAI_API_KEY=local-openai-key \
cargo run -p ironloom-runtime --bin ironloom -- serve
```

Health endpoints:

- `GET /healthz`
- `GET /readyz`

If required runtime credentials are missing, `GET /readyz` returns `503` and `GET /setup` serves the setup page on the same HTTP port. Environment variables take precedence over encrypted local setup values under `IRONLOOM_STATE_ROOT`. OpenAI authentication can use `IRONLOOM_OPENAI_API_KEY` or `IRONLOOM_OPENAI_OAUTH_SESSION`.

## Local Docker Proof

Use the bundled recipes to build the runtime image, start Ironloom on the existing HTTP port, submit local setup values, and generate a complete static proof project:

```sh
just proof
```

The recipe writes the generated setup key and installer token to `.ironloom/local-dev/setup.env`, stores encrypted setup state under `.ironloom/local-dev/state`, and writes the generated proof app under `.ironloom/local-dev/worktrees/ironloom-proof-app`. Run `just setup-url` to print the setup URL and installer token for manual setup testing. Run `just docker-stop` when you are done inspecting the local container.

## Local k3s Acceptance

Use the disposable k3s acceptance recipe before publishing or promoting chart changes:

```sh
just k3s-acceptance
```

The recipe builds `ironloom:local`, starts a Docker-backed k3s cluster, installs the Helm chart with setup and runtime secrets, verifies signed Discord ping and command handling through `/discord/interactions`, and restarts the deployment to prove the PVC-backed artifact index persists. It forwards the runtime on `127.0.0.1:18081` by default; set `IRONLOOM_K3S_HTTP_PORT` to override the local port.

## Live External Probe

After binding real GitHub and SonarCloud credentials, run the external probe to verify source-of-truth repository reads, SonarCloud quality gate polling, and issue normalization:

```sh
IRONLOOM_GITHUB_REPOSITORY=VannaDii/ironloom just external-probe
```

The command uses the same `IRONLOOM_*` runtime environment values as the service and prints a redacted JSON summary.

## Deployment

Build the runtime image:

```sh
docker build -f docker/ironloom-runtime/Dockerfile -t ironloom:local .
```

Render the chart:

```sh
helm template ironloom deploy/helm/ironloom
```
