# Quality Gates

Ironloom preserves strict validation through Cargo formatting, Clippy, tests, dependency policy, vulnerability audit, schemas, documentation build, Docker build, Helm render, and SonarCloud analysis.

## Local Gates

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

## Publishing Gates

- Docker Buildx builds `docker/ironloom-runtime/Dockerfile`.
- Helm publishes `deploy/helm/ironloom` as an OCI chart.
- GitHub Pages publishes the VitePress public site.
- SonarCloud receives Rust LCOV coverage from `cargo llvm-cov`.
