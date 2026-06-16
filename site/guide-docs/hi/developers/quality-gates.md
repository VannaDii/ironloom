# Quality Gates

Ironloom Cargo formatting, Clippy, tests, dependency policy, vulnerability audit, schemas, documentation build, Docker build, Helm render और SonarCloud analysis के माध्यम से strict validation बनाए रखता है।

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

- `just proof` runtime image build करता है, local container start करता है, setup values submit करता है, और complete proof app generate करता है।
- `just k3s-acceptance` disposable k3s container start करता है, Helm chart install करता है, signed Discord intake verify करता है, और prove करता है कि PVC-backed artifact index pod restart के बाद भी बना रहता है।
- `just external-probe` real bound runtime credentials का उपयोग करके GitHub source-of-truth repository state read करता है और SonarCloud quality तथा issue state poll करता है।
- `just gates` format, Clippy, tests, schemas, docs, और Helm के common local gates चलाता है।
- `just setup-url` manual browser validation के लिए local setup URL और installer token print करता है।

## Publishing Gates

- Docker Buildx `docker/ironloom-runtime/Dockerfile` build करता है।
- Helm `deploy/helm/ironloom` को OCI chart के रूप में publish करता है।
- GitHub Pages VitePress public site publish करता है।
- SonarCloud को `cargo llvm-cov` से Rust LCOV coverage और CI द्वारा enforce किए गए उसी lint command से generated Clippy JSON report मिलती है।
- `SONAR_TOKEN` secret analysis submit करने और `vannadii_ironloom` quality gate read करने में सक्षम होना चाहिए; analyze-only token reports upload कर सकता है, लेकिन hard gate wait पूरा नहीं कर सकता।
