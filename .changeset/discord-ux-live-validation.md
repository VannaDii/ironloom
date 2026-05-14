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
and then fetches the posted Discord messages back through REST to verify
operator-visible content, allowed mentions, component rows, unique component
custom ids, message ids, and same-thread routing.

The existing OpenClaw live lab now shares the Discord live-lab harness for REST
requests, channel setup, command registration, message receipts, simulated
interaction transport, thread creation, package entrypoint resolution, and
Gateway-bound session persistence, keeping the OpenClaw and Discord UX probes
aligned.
