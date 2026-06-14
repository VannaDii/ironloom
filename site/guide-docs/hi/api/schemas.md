# Schema API

Committed JSON schemas crate-local `schemas/` directories में रहते हैं।

## Schema Drift

Schemas verify करें:

```sh
cargo run -p ironloom-schemas -- --check
```

Public contract changes के बाद schema files regenerate करें:

```sh
cargo run -p ironloom-schemas
```

## Runtime Config Schemas

- `crates/ironloom-config/schemas/runtime-config.schema.json`
- `crates/ironloom-config/schemas/stored-setup-config.schema.json`

ये resolved runtime configuration और encrypted setup payload shape का वर्णन करते हैं।
