# Shared factory contract candidate

Status: contract candidate for Ivy compatibility review, based on planning revision `3da9d8573d5c38bf3d55414b08cdc7808b5144d0`. This implements validated types, schemas, deterministic decode fixtures, initial migration constraints and adapter interfaces. It does not implement a running factory, authentication provider, native relay, model engine, scheduler or Flutter application. The legacy runtime remains active until replacement behavior lands. No inference, device discovery, Mac checks or backend qualification is performed here.

## File ownership and toolchain

Use Rust **1.96.0**, pinned in `rust-toolchain.toml` and available on both remote hosts. The initial exploratory build used 1.99.1; the candidate is checked using the common pin. The Docker builder uses Rust 1.96 on Alpine 3.24 to match this contract baseline. Root dependency pins are Axum 0.8.9, Tokio 1.54.1 and SQLx 0.9.1 with PostgreSQL/Tokio/Rustls only. SQLx optional SQLite/MySQL packages may appear in the lockfile; neither backend is enabled or adopted. Do not independently change root manifests, migrations or dependency pins in the client lane.

| Owner | Exact path | Contract |
| --- | --- | --- |
| Cinder | `crates/ironloom-core/src/validation.rs`, existing crate `src/factory.rs` modules and crate-local schemas | Immutable validated domain/wire records and typed identities |
| Cinder | `crates/ironloom-runtime/src/factory.rs` | HTTP/SSE encoding, service/authentication ports; runtime composition remains Cinder-owned |
| Cinder | `crates/ironloom-storage/migrations/` | SQLx forward-only migrations in the `ironloom` schema; OpenFGA owns a separate database and migration lifecycle |
| Cinder | `crates/ironloom-policy/authorization-model.fga` | Initial OpenFGA model; bootstrap administration does not imply private project content access |
| Ivy | `apps/operator/` | Proposed Flutter web application path, not scaffolded by this candidate |
| Ivy | `packages/ironloom_client/` | Proposed shared Dart connection, transport and validated wire models; same fixtures |
| Ivy | `crates/ironloom-native/src/` | Direct native relay/JSON-RPC implementation against the pinned reference; initial `factory.rs` records supplied here |
| Ivy | `crates/ironloom-models/src/{providers,sources,engines,devices}.rs` | Public adapter ports supplied here; implementations belong in these modules or their child modules |
| Cinder until explicit handoff | English/localized public API docs and root manifests/lockfile | One owner per file during parallel work |

`ironloom-models::factory` defines shared selection, source/access, device, engine, compatibility and residency data. Service policy owns reservations, LRU and dispatch. Adapters report capabilities/observations and perform authorized operations; they do not choose fallback engines/models/billing or execute generated tools. No MLX/Splash dependency or engine version is selected by these interfaces.

## Decode and validation

New factory wire models are aliases of `Validated<ModelData>`. `ModelData` is an unchecked construction draft; only the immutable validated alias may enter domain logic or application state. `Validated::new`, normal serde deserialization and `ironloom_core::validation::decode::<Model>` use the same `Validate` implementation. Nested aliases validate recursively. Cross-field errors contain `fields: [{field, code}]`; parsing failures use `invalid_structure` without echoing submitted data. Authentication input Debug output is redacted. Authentication and live resource authorization still run after validation.

Counters, timestamps, byte/token totals, event sequences and revisions are **canonical decimal strings**, including zero, bounded by unsigned 64-bit range. JSON numbers, leading zeros, signs, overflow and trailing input are rejected. Dart must parse without a JavaScript floating-point conversion. `fixtures/contracts/decode.json` is the shared valid/invalid decode-path corpus; Rust exercises it in `factory_decode.rs`, and Ivy must exercise the same corpus in Dart. JSON Schema describes structure; semantic validation remains required for nested/cross-field invariants and the exact counter maximum. Historical contracts retain their existing representation; existing typed string identities now also invoke their constructors during deserialization.

## Web and authentication API boundary

All paths below are relative to the serving deployment base; Flutter web derives that base from its serving URL. Future native clients explicitly configure a server connection. These are contract paths for the later backend implementation, not routes served by the legacy runtime today.

| Method/path | Request / result | Required semantics |
| --- | --- | --- |
| `POST /api/v1/auth/local` | `LoginRequest` / `AuthenticatedSession` | Server password verification, opaque connection-scoped session; login grants no administrator role |
| `POST /api/v1/auth/oidc/start` | `OidcStart` / redirect URL | Configured issuer, allowlisted callback, state, nonce and PKCE |
| `POST /api/v1/auth/oidc/callback` | `OidcCallback` / `AuthenticatedSession` | Validate issuer/audience/state/nonce; map issuer+subject, not unverified email |
| `POST /api/v1/auth/bootstrap` | authenticated session + `BootstrapRedeem` / `BootstrapState` | Consume initial token and fix sole administrator atomically; recover OpenFGA initialization only for that account |
| `POST /api/v1/auth/logout` | authenticated session | End this connection session, independently from provider credentials |
| `POST /api/v1/commands` | authenticated session + `Command` / `CommandReceipt` | Actor-scoped durable command ID + canonical payload hash; changed payload/stale revision conflicts, replay does not dispatch |
| `GET /api/v1/events` | authenticated conversation + optional `Last-Event-ID` / `ServiceEvent` SSE | Replay after cursor, then subscribe; disconnect never resubmits commands or cancels work |
| `GET /api/v1/sessions` | `SessionQuery` / authorized `SessionSummary` page | Archive/provider/source filters and stable bounded pagination; check every returned resource |

The cookie/token transport, session persistence and password/OIDC implementations are backend build-out work, not claimed by the port definitions. State-changing cookie-authenticated operations require CSRF/origin enforcement. Never accept worker-supplied identity as authenticated identity. `PlanApproval.approved_by` must match the authenticated approver, and the backend checks the stored plan ID/revision/content hash and current permission; the DTO itself is not approval authority.

SSE event name is `ironloom.event`; data is serialized `ServiceEvent`. Its ID is URL-safe, unpadded base64 of the scoped `ReplayCursor` JSON. Decode through `decode_cursor`, then authorize its conversation. An expired cursor yields `CursorExpired`, requiring explicit snapshot/resync; an unavailable store yields `Unavailable`. Cursors are replay positions, never grants. PostgreSQL stores full-range counter sequences as `numeric(20,0)` rather than a signed bigint or floating point.

`FactoryStore::commit_command` defines the actor/key/hash, receipt, initial event and dispatch outbox transaction. Duplicate keys return existing outcome or conflict, with no new dispatch. Outbox consumers still need renewable claims/fences and reconciliation; a transaction/outbox does not promise exactly-once external mutations or inference. The initial migration establishes singleton bootstrap, authenticated identity, node/project/conversation, command/event and outbox constraints. Full domain persistence and its implementations follow in later storage-owned migrations. Connection/key failures never initialize a replacement installation or database.

Administrator access to a private project requires an explicit recorded self-grant before viewing. Project creator ownership and view/operate/approve/manage presets remain distinct. Credential use/replacement/sharing/deletion are separate grants. The tool gateway checks the authenticated operator and worker delegation, current grants using higher consistency, exact resources and approved scope before native isolation. `Denied`, `Unavailable` and `ApprovalRequired` never dispatch. Enrollment requires administrator authority and a signed/authenticated node registration bound to the installation and physical host; `key_access_ref` references infrastructure-controlled protected key access for that enrolled node, never plaintext shared keys in client responses. The key-resolution backend is not implemented here. Coordinated upgrades use one protocol revision; no mixed-version rollout is implied.

## Execution, learning and resources

Plan approval binds a revision and content hash; steering binds an expected active turn; answers bind pending question/turn/item/revision and a persisted allowed choice. The backend must reject replaced/resolved/stale requests. Copied instructions track applied and acknowledged revisions; the explicit preserve/update choice is separate from immediate lesson notifications. Already-running inference cannot acknowledge a later instruction revision.

Lesson setup has no default: missing handling mode or delivery confirmation prevents execution readiness. Each lesson records its origin/source, scope and revision independently of cleanup. Every mode applies locally immediately, subject to explicit per-lesson restrictions. Share/manage/view grants are distinct; sharing content grants no access to its private source. Revision/change/restriction/deletion invalidates retrieved worker context at the next decision boundary. Remembered answers retain wording, human identity, timestamp, scope and supersession; similarity or a lesson never substitutes for approval.

`ExecutionState` is shared by scheduler/adapters. Waiting for a human/resource and pause are resumable. Cancellation requested is distinct from terminated; stream EOF/disconnect is never completion. Workers emit start/delta/tool-ready/wait/usage/completion/failure/termination events with assignment/worker/turn/item IDs. Partial tool arguments cannot execute; complete calls still enter the gateway. Output consumption and monitoring remain independent of viewer speed. Budget edits change subsequent dispatch, include in-flight reservations and uncertain usage, and do not revise plan approval or disable generation limits. Account usage is not API-key billing.

One assignment has one shared worktree on its owning node. Relative path drafts reject obvious traversal, while actual filesystem/symlink and descendant enforcement remains native execution work. Validation binds exact content plus a mutation fence after active edits drain. Relevant edits invalidate results; cleanup waits for worker release and preservation of needed changes.

Physical host and node identity differ. Reconciled GPU identity/parent partitions share one capacity authority across container aliases; unresolved identity blocks admission. Reserve memory/concurrency before loads and include cache/draft/overhead demand. Lease loss stops admissions; expiry alone never proves old execution stopped. Local selections include engine/version/backend/configuration, checkpoint/revision/quantization and placement. Active inference protects residency; an idle worker or tool wait does not. Cancellation is request-scoped, not resident-model-wide. Compatibility, estimated fit and actual hardware qualification remain separate.

New `FactoryArtifact` records have project/assignment/correlation identity and no Discord thread binding. Historical `ArtifactEnvelope` version one and checksums remain readable; its runtime, routes and indexes are retired only when replacements land.

## Native compatibility mapping and remaining work

The inspected upstream revision is `e2e7dabd4587c7b0fbf934e6a93b6cec8245751d`. [Its websocket transport](https://github.com/openai/codex/blob/e2e7dabd4587c7b0fbf934e6a93b6cec8245751d/codex-rs/app-server-transport/src/transport/remote_control/websocket.rs) declares relay protocol version `3`, installation identity and opaque subscription cursor headers, stream sequence acknowledgments and bounded resend buffers. [Its envelope protocol](https://github.com/openai/codex/blob/e2e7dabd4587c7b0fbf934e6a93b6cec8245751d/codex-rs/app-server-transport/src/transport/remote_control/protocol.rs) carries client/stream/sequence and optional chunk acknowledgment. [The controller](https://github.com/openai/codex/blob/e2e7dabd4587c7b0fbf934e6a93b6cec8245751d/codex-rs/app-server-transport/src/transport/remote_control/controller.rs) retires stale authentication sessions. These files were read through GitHub; no native client or LMCP call was made.

| Native concern | Common mapping |
| --- | --- |
| Installation/environment/account enrollment | `NativeEnrollment`; authorized operator, persisted enabled preference, authentication generation; stale refresh cannot replace current credentials |
| Relay replay/chunk resend | `RelayCursor`: client/stream + acknowledged sequence/segment + opaque subscription cursor; separate from durable `ReplayCursor` |
| Authorized discovery/history | `SessionQuery` / `SessionSummary`, conversation/turn/item identities and archive/provider/source filters |
| Input, steering, questions and approvals | Persisted `Command`; expected active turn and item-bound request choice; exact plan revision/scope |
| Interrupt and reconnect | Cancel request accepted before confirmed termination; replay restores state without re-execution; EOF never means success |
| Provider and control OAuth | Protected server registration import and server refresh; distinct eligible inference credentials and billing |

These are source-checked mappings and deterministic model fixtures, not native protocol/client qualification. Ivy must implement bounded assembly/resends and validate actual deterministic sessions, approval, cancellation and reconnect against this revision before declaring compatibility. Upstream numeric relay fields stay upstream-compatible; the browser-safe common records do not redefine the upstream wire.

Minimum OS/platform versions and concrete MLX/Splash routes still require Vanna's decisions. No Python embedding or engine porting is adopted. Linux/Alpine GPU execution remains unqualified. Stop after publishing this candidate for Ivy's review; do not combine checkouts or validate on the Mac.
