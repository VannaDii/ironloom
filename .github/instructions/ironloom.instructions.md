---
applyTo: '**/*'
---

# Ironloom Instructions

- Keep `PLATFORM.md` authoritative for platform scope, crate ownership, validation gates, and acceptance criteria.
- Keep business logic in Rust crates, not adapters, Docker, Helm, workflows, or docs code.
- Use typed IDs and fail-closed policy results for operator-visible workflows.
- Only `ironloom-storage` may read or write `.ironloom/` paths directly.
- Discord actions must resolve exactly one persisted thread/work-item binding before workers run.
- GitHub state must be refreshed before source-of-truth decisions.
- SonarCloud bootstrap configuration must be validated before quality gate polling.
- Public landing-page content must remain separate from runtime/operator controls.
