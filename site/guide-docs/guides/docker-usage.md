# Docker Usage

## Run Published Latest

```bash
npm run docker:openclaw:latest
```

The command pulls `ghcr.io/vannadii/devplat-openclaw-runtime:latest` before each
run, publishes the OpenClaw dashboard on loopback at
`http://127.0.0.1:18789/`, and uses `devplat-local` as the default gateway token.
It prints the active gateway token, tokenized dashboard URL, tokenized chat URL,
and WebSocket URL before the container logs start. Custom gateway tokens are
hidden in the standalone token line unless
`DEVPLAT_OPENCLAW_PRINT_GATEWAY_TOKEN=1` is set. Set
`OPENCLAW_GATEWAY_TOKEN` before running the command to use a different token.
Treat tokenized URLs as credentials; do not share terminal output in tickets,
logs, or public channels.
Published runtime manifests include `linux/amd64` and `linux/arm64/v8`; set
`DEVPLAT_DOCKER_PLATFORM` only when you need to force a platform for an older
tag. Runtime state is mounted at
`.devplat/docker-state`, which stays ignored by Git. The npm command delegates
to a Node runner so macOS uses the same Docker argument handling as Linux instead
of relying on inline shell expansion. The gateway binds inside the container so
Docker can forward traffic, while the host publish remains restricted to
`127.0.0.1`. Set `DEVPLAT_OPENCLAW_RUNTIME_IMAGE` when you need to validate a
published PR image before `latest` has been updated.

## Build Locally

```bash
docker build \
  --build-arg NODE_VERSION="$(tr -d 'v' < .nvmrc)" \
  -f docker/openclaw-runtime/Dockerfile \
  -t devplat-openclaw-runtime:local .
```

## Run Locally

```bash
docker run --rm -p 18789:18789 devplat-openclaw-runtime:local
```

The image is based on Alpine `3.23`, installs Node matching the repo baseline, builds the workspace, and starts the OpenClaw gateway entrypoint.
