---
'@vannadii/devplat-discord': patch
---

Send Discord operator interaction acknowledgements before persistence and audit writes so Gateway-delivered slash commands and button clicks can satisfy Discord's prompt response window even when the local state store or telemetry path is slower. The control plane still evaluates policy before rendering the accepted or blocked payload, then persists state, telemetry, and audit records and posts the bound-thread status message after the interaction callback has been acknowledged. Interaction-originated requests are normalized once, so persisted traces contain one Discord route marker for the action. If Discord rejects the initial acknowledgement, the acknowledgement transport throws, or a route-refusal acknowledgement is rejected, the action fails closed, records an audit event with the acknowledgement failure reason, skips lifecycle state changes, and reports `responsePostError`. If the post-acknowledgement thread status message throws or returns a non-2xx receipt, the control result now preserves the interaction acknowledgement receipt and durable action result while reporting `threadPostError` for operator and live-lab diagnostics. Live-lab runs now keep the private runtime online for 150000 ms by default after posting operator controls so manual Discord interactions have a bounded response window.

The OpenClaw deep-test runtime now also passes `DEVPLAT_WORKTREE_ROOT=devplat-state/worktrees` through the container environment and verifies allocation, sync, and release scenario records against that trimmed configured root. This keeps hermetic OpenClaw validation aligned with the runtime worktree layout used by live operator control flows.

Live-lab status messages now use the same compact status anchors for failure and success states, label commit SHAs as `Sha`, and render workflow URLs as explicit angle-bracket links while keeping Discord URL previews suppressed. This keeps project-management status messages readable without letting GitHub unfurls dominate the operator channel.

The live-lab Sonar project-key sanitizer now uses a named regex constant with explicit safe and unsafe character coverage, keeping local test-lab helpers aligned with the repository regex-governance rule.

The OpenClaw deep-test artifact redaction helper now also uses a named regex constant and covers hyphenated, underscored, and nested secret-key variants so runtime artifact snapshots continue redacting sensitive values consistently.
