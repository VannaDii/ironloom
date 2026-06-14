# Controles de calidad

Ironloom conserva validación estricta mediante formateo de Cargo, Clippy, pruebas, política de dependencias, auditoría de vulnerabilidades, esquemas, build de documentación, build de Docker, render de Helm y análisis de SonarCloud.

## Controles locales

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

## Controles de publicación

- Docker Buildx construye `docker/ironloom-runtime/Dockerfile`.
- Helm publica `deploy/helm/ironloom` como chart OCI.
- GitHub Pages publica el sitio público VitePress.
- SonarCloud recibe cobertura Rust LCOV desde `cargo llvm-cov`.
