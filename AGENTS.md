# DevPlat Agent Instructions

## Non-negotiable Rules

- Run `nvm use` before installs or development commands.
- Do not weaken TypeScript, ESLint, coverage, schema, Sonar, policy, or audit requirements.
- Do not use TypeScript type assertions or casts anywhere in authored code; banned forms include `as`, `as unknown`, angle-bracket casts, non-null assertions, and double assertions.
- Do not bypass schema generation or the generated OpenClaw manifest workflow.
- Use `PLATFORM.md` as the authoritative foundation-scope document for required packages, surfaces, workflows, and acceptance criteria.
- Branch names and pull request titles must not include any registered tool name.
- Pull request titles must use conventional commit format.
- Pull request bodies must follow `.github/pull_request_template.md` and fill every section with repo-specific content.
- Every pull request containing any code change must include a detailed Changesets entry before it is opened or updated; keep that changeset accurate as the branch evolves.
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
- Add JSDoc to every authored constant, codec, function, class, public type, and internal helper unless the symbol is a trivial re-export.
- Every non-trivial unit needs sibling tests that reveal failure source and operational impact.
- Use structured test tables with `const cases = [...]`. Each case must declare `inputs`, a `mock` setup function, and an `assert` function, then run through a single `it.each(cases)('$name', ...)` implementation per suite.
- Public contract changes require aligned codec-owned types, `io-ts` codecs, generated schemas, docs, and tests.
- Export public types near their source codec definitions; delete `types.ts` files when they only re-export or alias codec-owned types.
- Keep constants in the owning package's `constants.ts`. If more than one package needs the same constant, define it once in `@vannadii/devplat-core` and import it from there.
- Do not inline repeated literals or magic numbers in authored code. Define meaningful constants for versions, artifact kinds, action names, statuses, storage scopes, index names, and other shared vocabulary.
- Treat regular expressions as constants: define named regex patterns in `constants.ts`, and cover every pattern with comprehensive tests for matching and non-matching edge cases.
- Use shared codecs for domain-specific strings such as ISO timestamps and Git branch names instead of plain `t.string`.
- Keep Discord and OpenClaw control-plane contracts aligned with auditable artifacts and generated schemas.
- Fail closed when a Discord action lacks an unambiguous thread binding.
- Preserve Linux-only compatibility validation against the latest stable TypeScript `5.x` and `6.x` releases while authoring against TypeScript `6.0.2`.

## Pull Request Feedback

- Resolving PR feedback means reviewing every item, researching the issue and edge cases, implementing the smallest complete fix, and verifying it with targeted tests and the relevant repo gates.
- Reply directly on each review thread with a warm, very brief, concrete note describing how it was addressed.
- Do not resolve review threads after replying; leave thread resolution to the author.
