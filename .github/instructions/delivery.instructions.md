---
applyTo: '.github/**,docker/**,deploy/**,docs/**,site/**'
---

# Delivery Instructions

- CI and publishing workflows must use Cargo, VitePress, Docker, Helm, and SonarCloud.
- Do not add legacy app stack, package publishing, or legacy runtime steps.
- Docker images must run as a non-root user and use numeric Alpine tags.
- Native macOS and Linux are also required deployment targets. Keep platform-specific GPU/inference and execution support separate from shared domain logic; do not silently substitute a different container base when qualification fails.
- The target storage design requires infrastructure-configured persistent roots for models, managed PostgreSQL data (unused with an externally managed server), and complete projects/Git folders. Keep database/service identity outside project storage; durable assignment worktrees must not use temporary volumes.
- Target PostgreSQL exclusively, including OpenFGA storage. Use configured PostgreSQL or manage it locally when no connection string is supplied. Multiple service instances share one installation; preserve node ownership, coordinated dispatch, and the shared database lifecycle. Never use SQLite or initialize a fresh database on connection failure.
- Publish the Helm chart with PostgreSQL 18 and OpenFGA services included, with persistence, secrets wiring, and initialization/migrations, plus an external PostgreSQL option. Native installs manage these services as separate processes. Helm charts must deploy Ironloom directly with persistent state and health/readiness probes. Service readiness must allow a functioning setup/web UI to receive traffic while execution readiness separately blocks incomplete assignments.
- Docs builds must stay static and must not expose operator credentials or runtime controls.
- The planned operator client is Flutter/Dart, served by Ironloom for web with native desktop/mobile clients later. Keep its build/assets and future client connection settings separate from the public VitePress site; preserve existing gates when adding Flutter validation during implementation.
