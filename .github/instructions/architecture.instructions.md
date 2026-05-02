# Architecture Instructions

## Platform Shape

- DevPlat is a platform core plus adapters, not one giant OpenClaw plugin.
- Platform packages own domain logic, orchestration, contracts, and persistence.
- `@vannadii/devplat-openclaw` remains adapter-only.
- `@vannadii/devplat-discord` is the primary human control surface.
- Docker and Helm are delivery surfaces, not business-logic hosts.

## Boundaries

- Keep package boundaries explicit and stable.
- Use public package entrypoints only. Do not deep-import another package's `src`.
- `@vannadii/devplat-storage` is the only package allowed to touch `.devplat/` directly.
- Keep business logic in platform packages, with pure `logic.ts` and thin `service.ts` shells.
- Standard decorators are allowed only for registration, routing, capability tags, and transport metadata.
- Decorated methods must delegate immediately into pure logic or services.
- Do not colocate domain logic with OpenClaw or Discord entrypoints merely because those packages initiate the workflow.

## Lifecycle Expectations

- Preserve the end-to-end flow from research to spec PR, human approval, slicing, implementation PRs, gates, review, remediation, and release.
- Keep GitHub as the system of record for specs, pull requests, reviews, and merge history.
- Keep privileged decisions observable and policy-mediated.
- Keep Discord and OpenClaw contracts aligned with artifacts, codecs, and generated schemas owned by platform packages.
- Prefer additive contract evolution over breaking changes to artifact and tool surfaces.
- Keep relative ESM specifiers explicit with `.js` in TypeScript source because the repo compiles under `NodeNext`.
- Document every authored constant, helper, codec, function, class, and public type with JSDoc unless it is only a trivial re-export.
