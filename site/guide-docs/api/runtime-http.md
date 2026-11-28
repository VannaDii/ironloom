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
| GET | `/readyz` | Selected database reachable; separate from execution setup, root path |

Required infrastructure: `IRONLOOM_DATABASE_URL`, `IRONLOOM_OPENFGA_URL`, `IRONLOOM_CONFIG_KEY` (base64, 32 bytes), `IRONLOOM_PUBLIC_URL`, and both download byte ceilings. `IRONLOOM_INSTALLER_TOKEN` is read only by explicit initialization. Optional `IRONLOOM_OPENFGA_TOKEN` protects the authorization endpoint. Optional `IRONLOOM_OIDC_CONNECTIONS` is a JSON array of `{id, issuer, client_id, client_secret, redirects}`; redirect IDs map to exact allowlisted callback URLs. No identity is inferred from email.

Role execution, model/source wiring and operator assets are still under implementation in the service lane. These auth routes are implemented; they are not a completed factory.
