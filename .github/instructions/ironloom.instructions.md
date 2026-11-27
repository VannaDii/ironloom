---
applyTo: '**/*'
---

# Ironloom Instructions

- Keep `PLATFORM.md` authoritative for platform scope, crate ownership, validation gates, and acceptance criteria.
- Keep business logic in Rust crates, not adapters, Docker, Helm, workflows, or docs code.
- Use typed IDs and fail-closed policy results for operator-visible workflows.
- All Rust/Dart wire models must implement the shared validation contract and pass validation after deserialization before use. Service-side validation is independent of Flutter; constructors and decoding must enforce the same domain invariants.
- Only `ironloom-storage` may read or write `.ironloom/` paths directly.
- Follow `docs/specs/ironloom-software-factory.md` for the planned factory direction; do not treat planned behavior as implemented or as authorization to implement.
- Primary build-out on Cinder/Ivy uses deterministic provider/engine fixtures, with no Ironloom inference or embedding runs. Integrate on the Mac before separately authorized real inference; do not confuse coding agents' own model use with testing Ironloom inference.
- Retire Discord control and thread binding; new operator actions require authenticated identity, assignment authority, and applicable approval.
- Python embedding and inference-engine porting each require Vanna's explicit approval before adoption.
- GitHub state must be refreshed before source-of-truth decisions.
- SonarCloud bootstrap configuration must be validated before quality gate polling.
- Public landing-page content must remain separate from runtime/operator controls.
