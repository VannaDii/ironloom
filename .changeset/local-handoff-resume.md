---
'@vannadii/devplat-openclaw': patch
---

Adds local handoff resume support to the headless maintenance runner. Operators
can now use `--handoff` to read and rewrite
`.devplat/state/next-maintenance-plan.json`, and `--tool-input <file>` to append
one validated next-tool input before the bounded continuation loop runs. The
release also documents the ignored local handoff flow for repeatable
repository-scoped maintenance and adds `npm run docker:openclaw:latest` for
running the latest published OpenClaw runtime image with local dashboard access.
Docker runtime publishing now emits a multi-platform manifest for `linux/amd64`
and `linux/arm64/v8`. Handoff mode also rejects conflicting `--plan` usage and
unknown external tool names before the lifecycle loop starts. The runtime image
build now compiles workspace output on the build platform and installs
production dependencies in the target-platform stage so arm64 publishing avoids
running the workspace build under QEMU. The latest-image npm command now
delegates Docker argument construction to a Node runner so macOS and Linux use
the same command path without inline shell expansion, with an image override for
validating published PR images before `latest` moves forward. Local Docker state
under `.devplat/` is ignored by repo-wide lint and formatting scans.
