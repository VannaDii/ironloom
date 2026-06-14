# Migration Notes

Runtime state moves from `.devplat` to `.ironloom`. Existing `.devplat` records should be archived or imported only after an explicit operator decision.

The legacy OpenClaw runtime is not part of Ironloom. Historical migration references may remain in the migration plan, but active runbooks and workflows target the Rust supervisor runtime.

The public documentation surface now lives in VitePress under `site/guide-docs` and publishes to `https://ironloom.dev`.
