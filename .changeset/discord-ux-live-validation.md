---
'@vannadii/devplat-discord': patch
'@vannadii/devplat-openclaw': patch
---

Add supported live Discord UX validation for interaction changes.

The repository now has a dedicated Discord UX live-lab workflow and script that
can be required as a stable pull-request status while internally skipping PRs
that do not touch Discord, OpenClaw, runtime, Helm, manifest, schema, live-lab,
or workflow paths. Relevant PRs must provide the sandbox Discord application,
bot token, and guild configuration before the live gate can pass.

The live UX probe registers the real sandbox guild command contracts, creates a
short-lived implementation thread under the shared test category, persists a
realistic Discord thread-session binding, routes slash-command-shaped and
fetched-button-shaped Gateway interactions through the Discord control plane,
replays the fetched button through the HTTP interaction webhook path, and then
fetches the posted Discord messages back through REST to verify operator-visible
content, allowed mentions, component rows, unique component custom ids, message
ids, same-thread routing, and the immediate component acknowledgement that real
Discord button clicks require.

The existing OpenClaw live lab now shares the Discord live-lab harness for REST
requests, channel setup, command registration, message receipts, simulated
interaction transport, thread creation, package entrypoint resolution, and
Gateway-bound session persistence, keeping the OpenClaw and Discord UX probes
aligned.

Discord interaction webhooks now return the documented immediate deferred
acknowledgement for routed slash commands and message components before durable
control-plane persistence, thread posting, and follow-up work continue in the
background. This keeps real Discord button clicks from timing out while
preserving thread-bound operator audit records.

The Discord UX live lab also has an explicit `--operator-hold-ms` manual-click
window. When set, it starts the real private Discord Gateway runtime against the
same temporary live state root before posting button-bearing messages, keeps that
worker open for the requested hold duration, and writes
`discord-ux-gateway-runtime-report.json` with READY, handled interaction,
response status, thread status, and runtime error diagnostics. This lets
maintainers validate actual Discord client button clicks against the same
thread-session binding used by automated route replay. Manual workflow-dispatch
runs now default that hold window to 150000 ms so the posted controls have a live
receiver by default; PR-triggered runs keep the zero-hold automated-gate behavior
unless a caller explicitly opts into a hold window.
Gateway startup timeout handling disposes the partially opened session before
rethrowing, and the runtime report is written after the hold window so reported
clicks reflect the final manual-validation state.

The OpenClaw live lab also tolerates GitHub's workflow indexing delay after
creating a fresh sandbox repository, retrying transient workflow dispatch 422s
long enough for the seeded `workflow_dispatch` canary to become available.

Operator documentation now includes the exact registered Discord slash-command
reference plus a Mermaid command flow that shows how OpenClaw tools and Discord
commands carry a change from research and spec creation through PR acceptance.
