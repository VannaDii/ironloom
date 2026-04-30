# DevPlat Agent Instructions

## Non-negotiable Rules

- Run `nvm use` before installs or development commands.
- Do not weaken TypeScript, ESLint, coverage, schema, Sonar, policy, or audit requirements.
- Do not use TypeScript type assertions or casts anywhere in authored code; banned forms include `as`, `as unknown`, angle-bracket casts, non-null assertions, and double assertions.
- Do not bypass schema generation or the generated OpenClaw manifest workflow.
- Use `PLATFORM.md` as the authoritative foundation-scope document for required packages, surfaces, workflows, and acceptance criteria.
- Branch names and pull request titles must not include any registered tool name.
- Treat `codex` as a reserved tool name and never use it in branch names or pull request titles.
- Pull request titles must use conventional commit format.
- Pull request bodies must follow `.github/pull_request_template.md` and fill every section with repo-specific content.
- Do not open or update a pull request until every changed executable source file is covered 100% by automated unit tests.
- Keep GitHub as the source of truth for specs, pull requests, reviews, and merge history.
- Keep Discord and OpenClaw control flows auditable.

## Boundaries

- `@vannadii/devplat-openclaw` is adapter-only.
- `@vannadii/devplat-discord` is the operator control plane, not a business-logic home.
- Discord is the operator control plane, not the source of truth for code state.
- Discord interactions must stay thread-aware and bound to the correct spec, slice, or pull request context.
- Only `@vannadii/devplat-storage` may read or write `.devplat/` paths directly.
- Do not put business logic inside decorators, `@vannadii/devplat-openclaw`, or `@vannadii/devplat-discord`.
- Do not colocate domain logic beside OpenClaw or Discord just because those packages initiate the workflow.
- Keep package boundaries strict and use public package entrypoints only.

## Delivery Contract

- Use the folder-per-unit layout.
- Keep `logic.ts` pure and test it directly.
- Keep `service.ts` as the class shell for orchestration, delegation, and side-effect boundaries.
- Keep relative `NodeNext` import and export specifiers explicit with emitted `.js` extensions.
- Every non-trivial unit needs sibling tests that reveal failure source and operational impact.
- Use structured test tables with `const cases = [...]`. Each case must declare `inputs`, a `mock` setup function, and an `assert` function, then run through a single implementation per suite.
- Public contract changes require aligned types, `io-ts` codecs, generated schemas, docs, and tests.
- Keep Discord and OpenClaw control-plane contracts aligned with auditable artifacts and generated schemas.
- Fail closed when a Discord action lacks an unambiguous thread binding.
- Preserve Linux-only compatibility validation against the latest stable TypeScript `5.x` and `6.x` releases while authoring against TypeScript `6.0.2`.
