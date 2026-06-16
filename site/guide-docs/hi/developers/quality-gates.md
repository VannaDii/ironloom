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
just scripts-test
npm run docs:build
helm lint deploy/helm/ironloom
helm template ironloom deploy/helm/ironloom
```

## Recipe Shortcuts

- `just proof` runtime image build करता है, local container start करता है, setup values submit करता है, और complete proof app generate करता है।
- `just k3s-acceptance` disposable k3s container start करता है, Helm chart install करता है, signed Discord intake verify करता है, और prove करता है कि PVC-backed artifact index pod restart के बाद भी बना रहता है।
- `just external-probe` real bound runtime credentials का उपयोग करके GitHub source-of-truth repository state read करता है और SonarCloud quality तथा issue state poll करता है।
- `just gates` format, Clippy, tests, schemas, SonarCloud bootstrap script behavior, docs, Helm, dependency policy, और vulnerability audit के common local gates चलाता है।
- `just setup-url` manual browser validation के लिए local setup URL और installer token print करता है।

## Publishing Gates

- Docker Buildx `docker/ironloom-runtime/Dockerfile` build करता है।
- Helm `deploy/helm/ironloom` को OCI chart के रूप में publish करता है।
- GitHub Pages VitePress public site publish करता है।
- SonarCloud को `cargo llvm-cov` से Rust LCOV coverage और CI द्वारा enforce किए गए उसी lint command से generated Clippy JSON report मिलती है।
- SonarCloud docs-site files analyze करता है, लेकिन उन्हें coverage accounting से exclude करता है ताकि Rust LCOV quality gate signal बना रहे।
- SonarCloud gate fail होने पर CI workflow log में authenticated gate status और हर condition print करता है।
- CI scan से पहले `vannadii_ironloom` SonarCloud project verify करता है, SonarCloud 404 लौटाए तो उसे create करता है, SonarCloud main branch को GitHub default branch से align करता है, और project को organization default quality gate से associate करता है। अगर target नाम वाली stale non-main branch पहले से मौजूद हो, तो CI SonarCloud main branch rename करने से पहले उस branch को delete करता है और result verify करता है।
- `SONAR_TOKEN` secret project create/read करने, default quality gate associate करने, analysis submit करने, और quality gate read करने में सक्षम होना चाहिए; analyze-only token reports upload कर सकता है, लेकिन bootstrap या hard gate wait पूरा नहीं कर सकता।
