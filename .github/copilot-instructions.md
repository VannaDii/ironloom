# Ironloom Copilot Instructions

## Operating Rules

- Treat this repository as compliance-first Rust platform infrastructure.
- Preserve strict Cargo formatting, Clippy, tests, schemas, policy, SonarCloud, dependency audit, Docker, Helm, docs, and GitHub Pages validation.
- Use `PLATFORM.md` as the authoritative foundation-scope document for required crates, workflows, delivery surfaces, and acceptance criteria.
- Follow `docs/specs/ironloom-software-factory.md` for agreed product direction and unresolved decisions. Planning does not authorize implementation, Python embedding, or inference-engine porting.
- Keep branch names and pull request titles free of registered tool names.
- Keep pull request titles in conventional commit form.
- Keep pull request bodies aligned with `.github/pull_request_template.md`.

## Architectural Boundaries

- Keep business logic in Rust crates.
- Keep web/native remote-host, GitHub, and SonarCloud adapters free of business logic. Discord control and thread binding are being retired.
- Keep GitHub as the source of truth for published specs, pull requests, GitHub reviews/approvals, and merges. The planned factory database owns human plan approvals and execution state.
- Fail closed when operator identity, assignment authority, or required approval is missing; do not introduce Discord binding into new contracts.
- Only `ironloom-storage` may access `.ironloom/` directly.

## Completion Standard

- Add tests before behavior changes.
- Keep public contracts aligned across Rust types, committed schemas, docs, and tests.
- Update docs, issue/PR templates, and release-facing artifacts when lifecycle, operator, or distribution behavior changes.
