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

New factory contracts live in crate-local `src/factory.rs` modules. `Validated<T>` uses the same nested/cross-field checks for constructors and decoding; structured errors never echo secrets. Counters and revisions use canonical decimal strings for browser precision. Rust and Dart share `fixtures/contracts/decode.json`. New `FactoryArtifact` records require no Discord thread; no old-format support is provided. These contracts and adapter ports do not yet implement the factory, login, native relay or inference. See the [shared contract specification](https://github.com/VannaDii/ironloom/blob/feat/shared-factory-contracts/docs/specs/ironloom-shared-contracts.md) for ownership, API paths, fresh-schema initialization boundaries and qualification limits.

The revised candidate adds snapshot-bound history and a bounded replay-to-live subscription port, multiple-choice and free-text answers, role-bearing inference messages with tool schemas/results, and distinct native server/environment identities plus relay persistence keys. These are validated interfaces; the corresponding backend and adapter implementations are still pending.

The same revision defines authorized setup/team/model/device query and mutation ports, lesson review/edit/scope/delete/promote operations, paginated source search, and explicit optional engine draft/cache/resource/recovery records. Unknown capability or memory data stays unknown; failures and cancellation requests do not confirm termination or free reservations. Backend and adapter implementations remain pending.

Ironloom is unreleased: fresh-schema initialization only, with no old-version compatibility, conversion/backfills, upgrade files or migration history. Obsolete foundation paths are retired during initial build-out.

`FactoryService::create_conversation` persists an empty authorized conversation before native turn/start, with durable command identity and a zero-cursor snapshot. It submits no input or inference; user input remains nonblank.

Shared service and native enrollment contracts now live in `ironloom-service::factory`; runtime and native adapters depend on this common crate, without old import re-exports. Snapshots include the active assignment for reconnect controls. Project, credential, native-connection and source/download API records are explicit; model profiles save generation controls through configuration.

`POST /api/v1/models/assessments` returns typed engine/version/backend and canonical device placement assessments, with requirement assumptions, memory fit and actual qualification separate. Missing information stays unknown; assessment never loads or runs a model.

`GET /api/v1/models/inventory` exposes authorized provenance, transfer completion, independent checksum/manifest verification and current file availability. Complete bytes remain unverified until the trusted installation pipeline confirms integrity; missing files retain metadata and block use.

Installation configuration commands persist before any project exists. Empty conversations atomically retain their snapshot and retry receipt with cursor zero and no dispatch event. `DownloadProgress.repository_id` binds authorized resume/cancel operations to the original repository.

Infrastructure download ceilings are required: `IRONLOOM_DOWNLOAD_MAX_FILE_BYTES` and `IRONLOOM_DOWNLOAD_MAX_TRANSFER_BYTES`. Both must be positive decimal byte counts; optional publisher sizes never override them. Helm supplies explicit editable values.

Editable instruction templates use `GET/POST /api/v1/instructions`; changes explicitly preserve active copies or select authorized assignments for updates and acknowledgment. Budget commands carry `{conversation_id, budget}` to target the correct durable stream.

A `ServiceEvent` contains exactly one worker event or conversation snapshot update. Snapshot cursor/project must match the outer event, so non-worker state updates need no invented execution identity.

The shipped standard team starts disabled, with editable instructions and no inferred model. Pure readiness rules preserve project inheritance and allow configured remote-only operation without a GPU. Durable instruction/configuration handlers are still being implemented.

Worker delegation is assignment/resource scoped, and record CAS preserves project/assignment ownership. Readiness checks PostgreSQL and the actual OpenFGA binding independently from team/model setup. Memory-fit estimates require all five demand components and checked addition; missing/overflowed totals remain unknown.


History paging now requires an explicit forward/backward direction, accepts an optional turn filter, and keeps each page oldest first at the requested event watermark. Session discovery requires `order=created_at` for native clients or `order=human_interaction` for dashboards. Empty, disabled or disjoint local device placements block execution readiness. Configuration/instruction and conversation catalog/snapshot/history HTTP routes use the shared authenticated backend; full runtime composition remains in progress.


`CommandReceipt.cursor` is absent for event-free resource mutations. Shared lesson management must not require access to its private source conversation or reveal that cursor. Conversation commands retain real stream cursors. Configuration rejects duplicate role IDs; no extra entry-role setup requirement is added.

Linux file grants distinguish exact `write_files` from `write_directories` subtrees. Exact create/edit/remove/move uses native filesystem tools; commands receive only explicit directory mounts. Writable trees reject hard-link aliases and seccomp blocks new hard links. Durable path ownership remains until confirmed stop/reconciliation, including after lease expiry. Full runtime gateway composition is still in progress.
