---
applyTo: 'crates/**/*.rs'
---

# Rust Instructions

- Keep `#![forbid(unsafe_code)]` in authored crates and binaries.
- Use public crate entrypoints rather than reaching across module internals.
- Add documentation comments to every public type, trait, function, module, and constant.
- Prefer explicit error enums and typed domain values over stringly typed state.
- Add or update tests before behavior changes.
- Keep schema files under the owning crate's `schemas/` directory aligned with public contracts.
