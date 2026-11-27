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

The revised candidate adds snapshot-bound history and a bounded replay-to-live subscription port, multiple-choice and free-text answers, role-bearing inference messages with tool schemas/results, and distinct native server/environment identities plus relay persistence keys. These are validated interfaces; the corresponding backend and adapter implementations are still pending.

The same revision defines authorized setup/team/model/device query and mutation ports, lesson review/edit/scope/delete/promote operations, paginated source search, and explicit optional engine draft/cache/resource/recovery records. Unknown capability or memory data stays unknown; failures and cancellation requests do not confirm termination or free reservations. Backend and adapter implementations remain pending.
