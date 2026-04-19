# Contributing

## Runtime Baseline

DevPlat develops on Node.js `v24.14.1` from `.nvmrc`, with `packageManager` pinned to `npm@11.12.1`.

Before doing any work:

```bash
nvm use
npm ci
```

Compatibility validation runs on Linux only against the latest stable TypeScript `5.x` and `6.x` releases. Primary authoring targets TypeScript `6.0.3`.

Use [`PLATFORM.md`](./PLATFORM.md) as the authoritative foundation-scope document for required packages, workflows, delivery surfaces, and acceptance criteria. This guide focuses on how changes are implemented and reviewed.

## Workflow Contract

1. Create a focused branch with a single lifecycle goal.
2. Keep changes inside package boundaries and preserve the platform-core versus adapter split.
3. Update tests, docs, schemas, manifests, and release notes in the same change when behavior or public contracts move.
4. Treat GitHub as the source of truth for specs, implementation PRs, reviews, approvals, and merge history.
5. Treat Discord and OpenClaw as operator control surfaces with auditable artifacts, never as hidden state stores.
6. Keep Discord interactions thread-aware and fail closed when the thread context is missing or ambiguous.
7. Keep branch names and pull request titles descriptive of intent and never reuse any registered tool name.
8. Treat `codex` as a reserved tool name and never use it in branch names or pull request titles.
9. Keep pull request titles in conventional commit format.
10. Do not open or update a pull request until every changed executable source file is covered 100% by automated unit tests.

## Package Contract

- Keep package changes aligned with the responsibilities defined in `PLATFORM.md`.
- New or normalized packages must include `package.json`, `tsconfig.json`, `src/index.ts`, repo-standard scripts, strict exports, and correct internal dependencies.
- Add or refresh a package `README.md` when package normalization or publishability changes are in scope.
- Use package entrypoints only. No cross-package relative imports.
- Keep adapter packages focused on transport and control-plane concerns, not platform business logic.

## Validation

Run the canonical local gate before pushing:

```bash
npm run check:pre-push
```

That gate covers:

- generated schemas and the OpenClaw manifest
- repo structure, dependency graph, instruction drift, naming rules, and policy boundaries
- lint, typecheck, changed-file coverage, full coverage, build, and docs build

## Review and Release

- Use conventional commits. The repo enforces them through Husky and Commitlint.
- Pull request titles must also use conventional commit format.
- Add a changeset for any publishable package change or release-facing behavior change.
- Pull requests must describe behavior change, risk, schema and artifact impact, operator impact, performance impact, release impact, rollback notes, and exact validation performed.
- Pull request bodies must use `.github/pull_request_template.md` and populate every section rather than replacing it with an ad hoc summary.
- Pull request titles must describe the change outcome and must not repeat any registered tool name.
- Treat `codex` as a reserved tool name here too; it must not appear in branch names or pull request titles.
- Do not open or update a pull request until `npm run check:changed-coverage` confirms 100% automated unit-test coverage for every changed executable source file.
- Do not hide significant behavior changes behind formatting-only commits.
- Keep release surfaces aligned across GitHub Packages, GHCR Docker, GHCR Helm, and GitHub Pages when a change affects them.

## Merge Readiness

A change is not complete until it satisfies all of the following:

- strict TypeScript, ESLint, coverage, schema, and Sonar expectations still pass
- every changed executable source file has 100% automated unit-test coverage
- GitHub, Discord, OpenClaw, and operator-facing behavior stays auditable
- Discord workflows remain thread-aware and bound to the correct work item context
- public contracts stay aligned across TypeScript types, codecs, generated schemas, and docs
- lifecycle changes from research through release remain consistent with the platform model and `PLATFORM.md`

## Security

Do not file public issues for vulnerabilities. Follow [`SECURITY.md`](SECURITY.md).
