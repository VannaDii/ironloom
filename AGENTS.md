# Ironloom Agent Instructions

## Non-Negotiable Rules

- Work directly on the checked-out branch only when the user explicitly asks for it.
- Do not weaken Rust formatting, Clippy, test, schema, SonarCloud, policy, audit, Docker, Helm, or docs validation requirements.
- Branch names and pull request titles must not include any registered tool name.
- Pull request titles must use conventional commit format.
- Pull request bodies must follow `.github/pull_request_template.md` and fill every section with repo-specific content.
- Keep GitHub as the source of truth for specs, pull requests, reviews, and merge history.
- Keep Discord operator flows thread-aware and auditable.
- Use `PLATFORM.md` as the authoritative foundation-scope document.

## Boundaries

- `ironloom-runtime` is the deployable service and composition boundary.
- `ironloom-supervisor` owns process routing and worker dispatch decisions.
- `ironloom-discord` is the operator control-plane adapter, not a business-logic home.
- `ironloom-github` reads and writes GitHub source-of-truth state through auditable requests.
- `ironloom-sonarcloud` owns SonarCloud quality and compliance normalization.
- Only `ironloom-storage` may read or write `.ironloom/` paths directly.
- Do not put business logic inside Discord, GitHub, SonarCloud, Docker, Helm, or docs code.
- Keep package boundaries strict and use public crate entrypoints only.

## Delivery Contract

- Keep domain logic pure and test it directly.
- Keep service/runtime code as orchestration, delegation, and side-effect boundaries.
- Add Rust documentation comments to every authored public constant, function, type, trait, and module.
- Every non-trivial unit needs sibling tests that reveal failure source and operational impact.
- Public contract changes require aligned Rust types, committed schema files, docs, and tests.
- Keep constants in the owning crate. If more than one crate needs the same constant, define it once in `ironloom-core`.
- Do not inline repeated literals or magic numbers in authored Rust code.
- Treat regular expressions as named constants and cover every pattern with matching and non-matching tests.
- Use shared typed domain values for IDs, branch names, repository slugs, thread IDs, work item IDs, artifact IDs, and correlation IDs.
- Fail closed when a Discord action lacks an unambiguous thread binding.
- Refresh GitHub state before source-of-truth decisions.
- Validate SonarCloud bootstrap configuration before polling quality gates.

## Required Local Gates

```sh
cargo fmt --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace --all-features
cargo run -p ironloom-schemas -- --check
cargo deny check
cargo audit
npm run docs:build
helm lint deploy/helm/ironloom
helm template ironloom deploy/helm/ironloom
```

## Pull Request Feedback

- Resolving PR feedback means reviewing every item, researching the issue and edge cases, implementing the smallest complete fix, and verifying it with targeted tests and relevant repo gates.
- Reply directly on each review thread with a brief concrete note describing how it was addressed.
- Do not resolve review threads after replying; leave thread resolution to the author.
