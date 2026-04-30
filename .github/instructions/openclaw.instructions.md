# OpenClaw Instructions

## Adapter Contract

- OpenClaw is the transport adapter, not the business logic layer.
- Tool handlers should validate input, delegate, and format structured results.
- Tool handlers must not absorb domain logic merely because the tool entrypoint is already in `packages/openclaw`.
- Keep plugin config and tool schemas generated from real types.
- Do not move storage, queue, gate, supervisor, or release logic into the adapter layer.
- Keep OpenClaw-adjacent domain behavior in platform packages even when OpenClaw is the only current caller.
- Use `PLATFORM.md` as the source for the required foundation-phase adapter surface, then keep the implementation guidance here focused on delegation, validation, and auditability.

## Required Tool Surface

- Keep the minimum adapter surface covering research, specs, slicing, queue state, worktrees, gates, artifact validation, review, remediation, supervisor control, GitHub coordination, and thread-aware Discord control.
- Keep required tool names registered, documented, and generated from the same source-of-truth codecs and schemas.
- When a required capability evolves, update the OpenClaw tool surface, manifest, docs, and tests in the same change.

## State and Control

- OpenClaw exposes the platform into operator workflows; it does not become the source of truth for code state.
- Keep tool behavior deterministic and thread-aware where Discord context is involved.
- Fail closed when a privileged or context-sensitive action does not resolve to a single valid platform record.
- Do not bypass policy or observability when exposing privileged actions.
- Keep OpenClaw-facing contracts aligned across TypeScript types, codecs, generated schemas, and auditable artifacts.

## Delivery Context

- OpenClaw must support the full platform lifecycle from research through release without owning the lifecycle state itself.
- Docker and Helm publish the OpenClaw runtime, but release correctness still depends on platform, GitHub, and artifact state.
