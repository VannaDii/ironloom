# OpenClaw Setup

## Local Development

```bash
nvm use
npm ci
npm run prepare:generated
npm run build
```

The OpenClaw adapter lives in `packages/openclaw`. It is intentionally adapter-only: it reads generated schemas, decodes tool input with platform codecs, and delegates lifecycle behavior to platform services. Domain logic and public contract ownership stay in platform packages even when OpenClaw is the only current caller.

## Running the Gateway

```bash
npm run build
./node_modules/.bin/openclaw gateway run
```

The runtime expects OpenClaw configuration through environment variables, mounted config, or explicit CLI arguments.

## Platform Context

- GitHub remains the system of record for specs, pull requests, reviews, and merges.
- Discord remains the primary operator control plane.
- OpenClaw exposes the platform into that control plane without taking ownership of platform state.
- OpenClaw tool handlers should validate, delegate, and format results rather than accumulate business logic near the entrypoint.
- `PLATFORM.md` defines the required foundation-phase tool surface; the adapter must expose that surface without re-owning the behavior.

## Tool Surface

The adapter exposes research, specs, slicing, runtime config, artifacts, GitHub, Discord, SonarCloud, task queue, storage, worktrees, execution, policy, telemetry, and supervisor capabilities.
The policy surface returns lifecycle evaluations with explicit action category,
risk, escalation target, audit reason, privilege, and next-action metadata so
OpenClaw callers do not need to infer merge, command, rebase, publish, autofix,
or destructive cleanup handling.

Required foundation-phase tool coverage includes:

- research initiation and structured research artifacts
- spec creation, approval, and explicit spec revision updates
- slice generation and readiness evaluation
- queue claim and lifecycle updates
- worktree allocation, sync, and release
- gate execution
- artifact validation
- review and remediation triggering
- supervisor step control
- pull request update, merge, and dependent rebase execution semantics

Keep required tool names documented in `packages/openclaw/README.md`, keep the manifest deterministic, and keep Discord-related tools thread-aware.
`handle_discord_control` accepts both normalized Discord control requests and
operator interaction callback payloads, then delegates to the Discord package so
OpenClaw can drive the same fail-closed slash/button path used by the live lab.
Hermetic deep tests exercise that callback-shaped input with loopback Discord
receipts; live-lab runs exercise the real Discord response transport.

## Related Guides

- [Live Test Lab](./live-test-lab.md)
- [Operator Guide](./operator-guide.md)
