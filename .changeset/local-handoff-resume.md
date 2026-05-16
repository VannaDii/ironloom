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
unknown external tool names before the lifecycle loop starts.
