---
applyTo: '.github/**,docker/**,deploy/**,docs/**,site/**'
---

# Delivery Instructions

- CI and publishing workflows must use Cargo, VitePress, Docker, Helm, and SonarCloud.
- Do not add legacy app stack, package publishing, or legacy runtime steps.
- Docker images must run as a non-root user and use numeric Alpine tags.
- Helm charts must deploy Ironloom directly with `.ironloom` PVC-backed state and health/readiness probes.
- Docs builds must stay static and must not expose operator credentials or runtime controls.
