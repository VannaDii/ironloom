# Schema API

Committed JSON schemas live under crate-local `schemas/` directories.

## Schema Drift

Verify schemas with:

```sh
cargo run -p ironloom-schemas -- --check
```

Regenerate schema files after public contract changes with:

```sh
cargo run -p ironloom-schemas
```

## Runtime Config Schemas

- `crates/ironloom-config/schemas/runtime-config.schema.json`
- `crates/ironloom-config/schemas/stored-setup-config.schema.json`

These describe resolved runtime configuration and encrypted setup payload shape.
