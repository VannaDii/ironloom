# بوابات الجودة

يحافظ Ironloom على تحقق صارم من خلال تنسيق Cargo وClippy والاختبارات وسياسة الاعتماد وتدقيق الثغرات والمخططات وبناء الوثائق وبناء Docker وتصوير Helm وتحليل SonarCloud.

## البوابات المحلية

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

## بوابات النشر

- يبني Docker Buildx ملف `docker/ironloom-runtime/Dockerfile`.
- ينشر Helm `deploy/helm/ironloom` كـ OCI chart.
- ينشر GitHub Pages موقع VitePress العام.
- يتلقى SonarCloud تغطية Rust LCOV من `cargo llvm-cov`.
