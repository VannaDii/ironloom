# 质量关卡

Ironloom 通过 Cargo 格式化、Clippy、测试、依赖策略、漏洞审计、模式、文档构建、Docker 构建、Helm 渲染和 SonarCloud 分析保持严格验证。

## 本地关卡

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

## 发布关卡

- Docker Buildx 构建 `docker/ironloom-runtime/Dockerfile`。
- Helm 将 `deploy/helm/ironloom` 作为 OCI chart 发布。
- GitHub Pages 发布 VitePress 公共站点。
- SonarCloud 接收来自 `cargo llvm-cov` 的 Rust LCOV 覆盖率。
