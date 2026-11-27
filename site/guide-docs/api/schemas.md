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

## Factory contract candidate

New factory contracts live in crate-local `src/factory.rs` modules. `Validated<T>` uses the same nested/cross-field checks for constructors and decoding; structured errors never echo secrets. Counters and revisions use canonical decimal strings for browser precision. Rust and Dart share `fixtures/contracts/decode.json`. New `FactoryArtifact` records require no Discord thread; historical version-one records remain readable. These contracts and adapter ports do not yet implement the factory, login, native relay or inference. See the [shared contract specification](https://github.com/VannaDii/ironloom/blob/feat/shared-factory-contracts/docs/specs/ironloom-shared-contracts.md) for ownership, API paths, migration boundaries and qualification limits.
