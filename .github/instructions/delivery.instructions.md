---
applyTo: '.github/**,docker/**,deploy/**,docs/**,site/**'
---

# Delivery Instructions

- CI and publishing workflows must use Cargo, VitePress, Docker, Helm, and SonarCloud.
- Do not add legacy app stack, package publishing, or legacy runtime steps.
- Docker images must run as a non-root user and use numeric Alpine tags.
- Native macOS and Linux are also required deployment targets. Keep platform-specific GPU/inference and execution support separate from shared domain logic; do not silently substitute a different container base when qualification fails.
- The target storage design requires infrastructure-configured persistent roots for models, the local database (unused with PostgreSQL), and complete projects/Git folders. Keep database/service identity outside project storage; durable assignment worktrees must not use temporary volumes.
- Helm charts must deploy Ironloom directly with persistent state and health/readiness probes. Service readiness must allow a functioning setup/web UI to receive traffic while execution readiness separately blocks incomplete assignments.
- Docs builds must stay static and must not expose operator credentials or runtime controls.
