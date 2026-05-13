---
'@vannadii/devplat-discord': patch
'@vannadii/devplat-openclaw': patch
---

Add a local Discord action stack runner for debugging operator interactions.

The new `dev:local-stack` npm script starts the OpenClaw runtime and private
Discord Gateway sidecar from the local workspace, exposes Node inspector ports
for both processes, creates a disposable Discord sandbox category/thread, and
posts a single startup message containing one button for every Discord control
action. The runner persists the thread binding into the mounted DevPlat state
before posting controls, keeps the stack online until shutdown, and removes the
Docker container, locally built image, temporary report directory, and created
Discord channels when the command exits.
