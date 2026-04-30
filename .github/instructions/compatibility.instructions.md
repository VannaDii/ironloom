# Compatibility Instructions

## Runtime Baseline

- Develop on Node.js `v24.14.1` from `.nvmrc`.
- Keep `packageManager` pinned to `npm@11.12.1`.
- Keep source packages on native ESM with `NodeNext` module settings.

## TypeScript Policy

- Primary authoring targets TypeScript `6.0.3`.
- Keep strict TypeScript settings enabled across the repository.
- Do not use TypeScript type assertions or casts anywhere in authored code; banned forms include `as`, `as unknown`, angle-bracket casts, non-null assertions, and double assertions.
- Do not weaken typing rules, emitted-specifier rules, or package-boundary checks to accommodate convenience changes.

## Compatibility Matrix

- Compatibility validation runs on Linux only against the latest stable TypeScript `5.x` and `6.x` releases.
- The compatibility matrix validates support; it does not replace the TypeScript `6.0.3` authoring baseline.

## Explicit Non-goals

- Do not broaden runtime support beyond Linux for the compatibility matrix.
- Do not optimize for Windows or macOS runtime support in this stage of the project.
