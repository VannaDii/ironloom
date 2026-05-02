# Schema Instructions

## Source of Truth

- Export `io-ts` codecs as the contract and schema source of truth.
- Derive TypeScript types from codecs for codec-owned public records instead of duplicating interface shapes.
- Export public types beside their owning codec and delete `types.ts` files that only re-export codec-derived aliases.
- Keep package-local constants in `constants.ts`; promote constants used by multiple packages into `@vannadii/devplat-core`.
- Regenerate committed JSON Schemas whenever a public contract changes.
- Do not hand-edit generated schema files.

## Lifecycle Expectations

- If a public contract changes, update the corresponding tests, docs, and operator-facing explanations in the same change.
- Keep schema and manifest generation aligned with the research, spec, slicing, review, and release workflow surfaces that consume them.
- A passing build is not sufficient if committed schemas drift from generated output.
