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

To run the latest published Docker runtime with the dashboard published on the
host loopback interface, use:

```bash
npm run docker:openclaw:latest
```

Then open `http://127.0.0.1:18789/` and use the configured
`OPENCLAW_GATEWAY_TOKEN`, or `devplat-local` when no token is set. Published
runtime manifests include `linux/amd64` and `linux/arm64/v8`; set
`DEVPLAT_DOCKER_PLATFORM` only when you need to force a platform for an older
tag. The npm command uses a Node runner for Docker argument construction so the
same command works under npm on macOS and Linux. Set
`DEVPLAT_OPENCLAW_RUNTIME_IMAGE` to validate a published PR image before
`latest` has been updated. Docker publishes the host port only on `127.0.0.1`;
the gateway binds inside the container so that loopback-only host publish can
forward traffic.

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
The headless `continue_lifecycle` tool is the non-Discord entrypoint for
software-building loops. Callers provide the repository key, objective, actor,
timestamp, and known lifecycle artifact signals; the supervisor returns the next
platform tool, route owner, artifact gaps, input requirements, and any human
approval blocker.

For local repository maintenance:

```bash
npm run maintenance:headless -- --plan ./maintenance-plan.json --write-plan ./.devplat/state/next-maintenance-plan.json
```

This wraps that pattern in a bounded loop: it calls `continue_lifecycle`,
invokes the next supplied tool input, records the returned artifact signal,
writes a resumable handoff plan when requested, and stops at missing input or
human approval instead of guessing.

After the first handoff exists:

```bash
npm run maintenance:headless -- --handoff --tool-input ./.devplat/state/next-tool-input.json
```

This reads the default ignored handoff path, appends one validated tool input,
and rewrites the same handoff file for the next local run.

Required foundation-phase tool coverage includes:

- research initiation and structured research artifacts
- spec creation, approval, and explicit spec revision updates
- slice generation and readiness evaluation
- queue claim and lifecycle updates
- worktree allocation, sync, and release
- command execution with execution-owned cwd, timeout, truncation, retry-attempt, and retryable-exit-code options
- gate execution
- artifact validation
- review and remediation triggering
- supervisor step control
- headless lifecycle continuation for agent-driven software-building work
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
