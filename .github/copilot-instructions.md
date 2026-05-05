# DevPlat Copilot Instructions

## Operating Rules

- Treat this repository as compliance-first platform infrastructure.
- Run `nvm use` before install, test, lint, typecheck, build, or release guidance.
- Preserve strict TypeScript, ESLint, coverage, schema, policy, Sonar, and audit requirements.
- Do not use TypeScript type assertions or casts anywhere in authored code; banned forms include `as`, `as unknown`, angle-bracket casts, non-null assertions, and double assertions.
- Use `PLATFORM.md` as the authoritative foundation-scope document for required packages, workflows, delivery surfaces, and acceptance criteria.
- Keep branch names and pull request titles free of registered tool names.
- Keep pull request titles in conventional commit form.
- Keep pull request bodies aligned with `.github/pull_request_template.md` and populate every section with the actual change details.
- Every pull request containing any code change must include a detailed Changesets entry before it is opened or updated; keep that changeset accurate as the branch evolves.
- Prefer explicit, traceable behavior over hidden convenience.

## Architectural Boundaries

- Keep platform packages responsible for domain logic, orchestration, contracts, and persistence.
- Keep `@vannadii/devplat-openclaw` adapter-only and `@vannadii/devplat-discord` focused on operator control.
- Never place business logic inside decorators, `@vannadii/devplat-openclaw`, or `@vannadii/devplat-discord`.
- Do not colocate domain logic next to OpenClaw or Discord entrypoints just because the workflow starts there.
- Keep GitHub as the source of truth for specs, pull requests, approvals, reviews, and merges.
- Keep Discord and OpenClaw thread-aware, auditable, and subordinate to GitHub state.
- Fail closed when a Discord interaction cannot be resolved to a single bound thread context.
- Only `@vannadii/devplat-storage` may access `.devplat/` directly.

## Completion Standard

- Use folder-per-unit structure with `constants.ts` when constants exist, `codec.ts`, `logic.ts`, `logic.test.ts`, `service.ts`, and `service.test.ts`. Keep `types.ts` only when it contains non-codec-derived helper types.
- Keep `logic.ts` pure. Keep orchestration, IO, and framework glue in `service.ts`.
- Use structured `const cases = [...]` test tables. Each case must declare `inputs`, a `mock` setup function, and an `assert` function, then run through a single `it.each(cases)('$name', ...)` implementation per suite. The table variable must be named `cases`; alternate table names in `it.each(<name>)` calls are not allowed.
- Keep constants in package-local `constants.ts` files. Promote constants used by more than one package into `@vannadii/devplat-core`.
- Treat regular expressions as constants and test every pattern with matching and non-matching edge cases.
- Add JSDoc to authored constants, helpers, codecs, functions, classes, and public types unless the symbol is only a trivial re-export.
- Use explicit relative `.js` specifiers in `NodeNext` TypeScript source.
- Keep runtime contracts aligned across TypeScript types, `io-ts` codecs, generated schemas, docs, and tests.
- Keep Discord and OpenClaw control-plane contracts aligned with generated schemas, auditable artifacts, and the platform packages that own the behavior.
- Update docs, issue/PR templates, and release-facing artifacts when lifecycle, operator, or distribution behavior changes.
- Preserve Linux-only compatibility validation against the latest stable TypeScript `5.x` and `6.x` releases while authoring against TypeScript `6.0.2`.

## Pull Request Feedback

- Review every comment, verify the affected code path and edge cases, and implement the smallest complete fix.
- Add or update focused tests before running broader validation.
- Reply directly on each review thread with a brief concrete note describing the fix.
- Do not resolve review threads after replying; leave resolution to the PR author.
