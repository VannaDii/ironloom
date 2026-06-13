# Ironloom

Ironloom is a Rust supervisor runtime for auditable autonomous engineering operations. It coordinates Discord operator commands, GitHub source-of-truth state, SonarCloud quality gates, worker execution, immutable artifacts, and k3s deployment through typed Rust crates.

## Workspace

- `crates/ironloom-runtime`: deployable binary and health/readiness server.
- `crates/ironloom-supervisor`: process graph route selection and worker dispatch.
- `crates/ironloom-discord`: thread-aware operator adapter.
- `crates/ironloom-github`: GitHub source-of-truth projections.
- `crates/ironloom-sonarcloud`: SonarCloud bootstrap and quality contracts.
- `crates/ironloom-storage`: `.ironloom` filesystem-backed state.
- `docs/site`: mdBook public landing page, operator docs, and developer docs.
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
mdbook build docs/site
helm lint deploy/helm/ironloom
helm template ironloom deploy/helm/ironloom
```

## Runtime

Run the local HTTP server with setup enabled:

```sh
IRONLOOM_BIND_ADDR=127.0.0.1:8080 \
IRONLOOM_PUBLIC_URL=https://ironloom.dev \
IRONLOOM_STATE_ROOT=/tmp/ironloom/.ironloom \
IRONLOOM_CONFIG_KEY="$(openssl rand -base64 32)" \
IRONLOOM_INSTALLER_TOKEN="$(openssl rand -base64 32)" \
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

## Deployment

Build the runtime image:

```sh
docker build -f docker/ironloom-runtime/Dockerfile -t ironloom:local .
```

Render the chart:

```sh
helm template ironloom deploy/helm/ironloom
```
