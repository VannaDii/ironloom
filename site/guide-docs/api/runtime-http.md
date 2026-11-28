# Runtime HTTP API

The authenticated service uses Tokio/Axum and the configured deployment base path. `ironloom serve` opens the selected existing PostgreSQL installation. `ironloom initialize` explicitly creates a fresh schema and one-time bootstrap token state; it rejects an existing schema. Neither storage errors nor restarts initialize replacement data.

Service login is separate from provider credentials. Login responses contain `AuthenticatedSession` JSON, set an HttpOnly `ironloom_session` cookie, and provide CSRF proof through `ironloom_csrf` and the `x-ironloom-csrf` response header. Authenticated mutations require that proof in the request header. Cookies use the deployment path, SameSite=Lax, and Secure on HTTPS. Cross-origin requests fail closed. OIDC callbacks additionally require the browser-bound one-time flow cookie.

| Method | Path | Contract / transport |
| --- | --- | --- |
| POST | `/api/v1/auth/register` | `LoginRequest`; initial `x-ironloom-setup-token`, later current administrator + CSRF |
| POST | `/api/v1/auth/local` | `LoginRequest` → `AuthenticatedSession` + cookies |
| GET | `/api/v1/auth/session` | Current `AuthenticatedSession`; no-store |
| POST | `/api/v1/auth/oidc/start` | `OidcStart` → authorization URL JSON + HttpOnly flow cookie |
| POST | `/api/v1/auth/oidc/callback` | `OidcCallback` → `AuthenticatedSession` + cookies |
| POST | `/api/v1/auth/bootstrap` | `BootstrapRedeem` → fixed `BootstrapState`; CSRF |
| POST | `/api/v1/auth/logout` | Revoke current session and clear cookies; CSRF |
| GET | `/healthz` | Process liveness, root path |
| GET | `/readyz` | Selected PostgreSQL and OpenFGA binding reachable; separate from execution setup, root path |

Required infrastructure: `IRONLOOM_DATABASE_URL`, `IRONLOOM_OPENFGA_URL`, `IRONLOOM_CONFIG_KEY` (base64, 32 bytes), `IRONLOOM_PUBLIC_URL`, and both download byte ceilings. `IRONLOOM_INSTALLER_TOKEN` is read only by explicit initialization. Optional `IRONLOOM_OPENFGA_TOKEN` protects the authorization endpoint. Optional `IRONLOOM_OIDC_CONNECTIONS` is a JSON array of `{id, issuer, client_id, client_secret, redirects}`; redirect IDs map to exact allowlisted callback URLs. No identity is inferred from email.

Role execution, model/source wiring and operator assets are still under implementation in the service lane. These auth routes are implemented; they are not a completed factory.


History paging now requires an explicit forward/backward direction, accepts an optional turn filter, and keeps each page oldest first at the requested event watermark. Session discovery requires `order=created_at` for native clients or `order=human_interaction` for dashboards. Empty, disabled or disjoint local device placements block execution readiness. Configuration/instruction and conversation catalog/snapshot/history HTTP routes use the shared authenticated backend; full runtime composition remains in progress.


The service now mounts configuration, instructions, conversation state/history and replayable SSE beneath the public deployment path. SSE requires `Last-Event-ID`; reader overflow emits `ironloom.error` and requires resynchronization. Disconnects and transport shutdown do not cancel execution. Set the stable `IRONLOOM_NODE_ID` and separate absolute `IRONLOOM_PROJECTS_ROOT` / `IRONLOOM_MODELS_ROOT`; Helm provides separate persistent claims. Adapter/sandbox registration, bundled dependency lifecycle and complete execution remain in progress.


Linux command containment now uses a dedicated helper, bubblewrap namespaces, explicit descriptor-bound writable paths and seccomp. Host paths and Git/service metadata are not writable; enforcement failures never run the command. Native Linux functional tests cover isolation, symlink rejection and descendant cleanup. The container installs bubblewrap/Git with UID/GID 1000. Full fenced workflow wiring, Alpine execution qualification and Mac/GPU work remain separate and unfinished.


Dispatch claims now bind the owning node, exact service instance and monotonic fence. Expired leases cannot renew or retry automatically; unresolved owned processes or external mutations block explicit recovery. The sandbox helper guards parent death before startup. Native tests pass, while this host’s default Docker policy denies namespace creation; container workers fail closed and remain unqualified. Full scheduler/workflow wiring is still in progress.


Lesson HTTP reads and edit/scope/delete commands now enforce current manage/share grants independently from source access. Deletion removes lesson content; authorized retries retain only a content-free identity marker. Current-state outbox recovery repairs interrupted grant publication without restoring older visibility. Workflow command execution remains in progress.

`GET /api/v1/projects?limit=100` returns live-authorized project metadata in human-interaction order, with an opaque `after` cursor. Unavailable mounts and remote owner nodes remain visible with `storage: unavailable`; catalog reads never create replacement directories. Git accessibility is checked without running hooks or inference. Project creation/source provisioning is still being implemented.
