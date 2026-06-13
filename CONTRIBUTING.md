# Contributing

## Runtime Baseline

Ironloom develops on stable Rust with Cargo. Install the Rust toolchain described by `rust-toolchain.toml`, plus `cargo-deny`, `cargo-audit`, `mdbook`, `trunk`, Docker, and Helm for full local validation.

Use [`PLATFORM.md`](./PLATFORM.md) as the authoritative foundation-scope document for required crates, workflows, delivery surfaces, and acceptance criteria.

## Workflow Contract

1. Create a focused branch with a single lifecycle goal unless the maintainer asks for direct main-branch work.
2. Keep changes inside crate boundaries.
3. Update tests, docs, schemas, Docker, Helm, and release-facing metadata in the same change when behavior or public contracts move.
4. Treat GitHub as the source of truth for specs, implementation pull requests, reviews, approvals, and merge history.
5. Keep Discord interactions thread-aware and fail closed when thread context is missing or ambiguous.
6. Keep pull request titles in conventional commit format and free of registered tool names.

## Validation

Run the canonical local gates before publishing changes:

```bash
cargo fmt --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace --all-features
cargo deny check
cargo audit
mdbook build docs/site
cd website && NO_COLOR=false trunk build --release
cd .. && cargo run -p ironloom-website-prerender -- --dist website/dist --validate
helm lint deploy/helm/ironloom
helm template ironloom deploy/helm/ironloom
```

## Review and Release

- Pull request bodies must use `.github/pull_request_template.md` and populate every section.
- Do not hide significant behavior changes behind formatting-only commits.
- Keep release surfaces aligned across GHCR Docker, GHCR Helm, GitHub Releases, GitHub Pages docs, and the public website.

## Security

Do not file public issues for vulnerabilities. Follow [`SECURITY.md`](SECURITY.md).
