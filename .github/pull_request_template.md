### Behavioral Change

- _Describe the behavior change, intent, and operator value._

### Risk

- _Describe the main risks, or "N/A"._

### Schema and Artifact Impact

- _List every schema, artifact, or contract change, or "None"._

### GitHub / Discord / SonarCloud / Operator Impact

- _Describe workflow, approval, audit, or control-plane impact, or "N/A"._

### Performance Impact

- _Describe latency, throughput, scan-cost, or benchmark impact, or "N/A"._

### Release Impact

- _Describe Docker, Helm, docs, GitHub Pages, or release-note impact, or "N/A"._

### Rollback Notes

- _Describe how to back out the change safely, or "N/A"._

## Validation Performed

- _List the exact commands and checks you ran._

### Validation Checklist

- [ ] `cargo fmt --check`
- [ ] `cargo clippy --workspace --all-targets --all-features -- -D warnings`
- [ ] `cargo test --workspace --all-features`
- [ ] `cargo deny check`
- [ ] `cargo audit`
- [ ] `npm run docs:build`
- [ ] `helm lint deploy/helm/ironloom`
- [ ] `helm template ironloom deploy/helm/ironloom`
