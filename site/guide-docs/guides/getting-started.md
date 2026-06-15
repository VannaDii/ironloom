# Getting Started

This guide starts the Ironloom runtime locally, verifies the existing HTTP port, and shows the first-run setup gate.

## Requirements

- Rust toolchain from `rust-toolchain.toml`
- Cargo
- Docker
- `just`
- A shell with access to `openssl`

## Run The Docker Proof

```sh
just proof
```

The recipe builds the runtime image, starts Ironloom at `http://127.0.0.1:8080`, submits local setup values to the setup endpoint, and writes a complete static proof app to `.ironloom/local-dev/worktrees/ironloom-proof-app`.

Use `just setup-url` to print the local setup URL and installer token when you want to perform setup manually through the browser. Use `just docker-stop` to stop the local runtime container.

## Start The Runtime

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

## Check Health And Readiness

```sh
curl -fsS http://127.0.0.1:8080/healthz
curl -fsS http://127.0.0.1:8080/readyz
```

`/healthz` reports whether the HTTP server is alive. `/readyz` returns `503` until required runtime configuration resolves from environment variables or encrypted local setup.

## Open Setup

Visit `http://127.0.0.1:8080/setup`.

If `IRONLOOM_CONFIG_KEY` is missing or invalid, the page shows only instructions for adding it. Once the config key and installer token are available, the page accepts missing runtime inputs and saves them encrypted under `IRONLOOM_STATE_ROOT`.
