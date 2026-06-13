# Ironloom Copilot Instructions

## Operating Rules

- Treat this repository as compliance-first Rust platform infrastructure.
- Preserve strict Cargo formatting, Clippy, tests, schemas, policy, SonarCloud, dependency audit, Docker, Helm, docs, and GitHub Pages validation.
- Use `PLATFORM.md` as the authoritative foundation-scope document for required crates, workflows, delivery surfaces, and acceptance criteria.
- Keep branch names and pull request titles free of registered tool names.
- Keep pull request titles in conventional commit form.
- Keep pull request bodies aligned with `.github/pull_request_template.md`.

## Architectural Boundaries

- Keep business logic in Rust crates.
- Keep `ironloom-discord`, `ironloom-github`, and `ironloom-sonarcloud` focused on adapter boundaries.
- Keep GitHub as the source of truth for specs, pull requests, approvals, reviews, and merges.
- Keep Discord thread-aware and auditable.
- Fail closed when a Discord interaction cannot be resolved to a single bound thread context.
- Only `ironloom-storage` may access `.ironloom/` directly.

## Completion Standard

- Add tests before behavior changes.
- Keep public contracts aligned across Rust types, committed schemas, docs, and tests.
- Update docs, issue/PR templates, and release-facing artifacts when lifecycle, operator, or distribution behavior changes.
