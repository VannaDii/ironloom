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

## Recipe Shortcuts

- `just proof` builds the runtime image, starts the local container, submits setup values, and generates a complete proof app.
- `just gates` runs the common local gates for format, Clippy, tests, schemas, docs, and Helm.
- `just setup-url` prints the local setup URL and installer token for manual browser validation.

## Publishing Gates

- Docker Buildx builds `docker/ironloom-runtime/Dockerfile`.
- Helm publishes `deploy/helm/ironloom` as an OCI chart.
- GitHub Pages publishes the VitePress public site.
- SonarCloud receives Rust LCOV coverage from `cargo llvm-cov`.
