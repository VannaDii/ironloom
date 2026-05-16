# Docker Usage

## Run Published Latest

```bash
npm run docker:openclaw:latest
```

The command pulls `ghcr.io/vannadii/devplat-openclaw-runtime:latest` before each
run, exposes the OpenClaw dashboard at `http://127.0.0.1:18789/`, and uses
`devplat-local` as the default gateway token. Set `OPENCLAW_GATEWAY_TOKEN` before
running the command to use a different token. Published runtime manifests include
`linux/amd64` and `linux/arm64/v8`; set `DEVPLAT_DOCKER_PLATFORM` only when you
need to force a platform for an older tag. Runtime state is mounted at
`.devplat/docker-state`, which stays ignored by Git.

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
