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
just scripts-test
npm run docs:build
helm lint deploy/helm/ironloom
helm template ironloom deploy/helm/ironloom
```

## 配方快捷命令

- `just proof` 构建运行时镜像、启动本地容器、提交 setup 值，并生成完整的证明应用。
- `just k3s-acceptance` 启动一次性 k3s 容器、安装 Helm chart、验证签名 Discord 输入，并证明 PVC 支持的工件索引在 pod 重启后仍保留。
- `just discord-endpoint-acceptance` 使用真实 Discord 应用，通过 Discord 的签名验证 `PING` 验证公开的 Interactions Endpoint URL。
- `just external-probe` 使用真实绑定的运行时凭据读取 GitHub 事实源仓库状态，并轮询 SonarCloud 质量和问题状态。
- `just gates` 运行常用本地关卡：格式化、Clippy、测试、schema、SonarCloud bootstrap 脚本行为、docs、Helm、依赖策略和漏洞审计。
- `just setup-url` 打印本地 setup URL 和安装令牌，用于浏览器手动验证。

## 发布关卡

- Docker Buildx 构建 `docker/ironloom-runtime/Dockerfile`。
- Helm 将 `deploy/helm/ironloom` 作为 OCI chart 发布。
- GitHub Pages 发布 VitePress 公共站点。
- SonarCloud 接收来自 `cargo llvm-cov` 的 Rust LCOV 覆盖率，以及由 CI 强制执行的同一 lint 命令生成的 Clippy JSON 报告。
- SonarCloud 会分析文档站点文件，但将它们排除在覆盖率计算之外，使 Rust LCOV 仍然作为质量门信号。
- SonarCloud 扫描之后，CI 会等待 scanner 的计算引擎任务完成，并在 workflow 日志中打印经过认证的质量门状态和每个条件。
- CI 会在扫描前验证 SonarCloud 项目 `vannadii_ironloom`，在 SonarCloud 返回 404 时创建它，并将 SonarCloud 主分支与 GitHub 默认分支对齐。如果已经存在同名的非主分支，CI 会先删除该分支，再重命名 SonarCloud 主分支并验证结果。
- 如果 SonarCloud 因项目没有关联质量门而返回 `NONE`，CI 会使用经过认证的项目度量来执行组织默认质量门，并在度量缺失或违反条件时失败关闭。
- 当 SonarCloud 返回 `NONE` 时，运行时外部探测也使用相同的组织默认质量门 fallback，因此实时探测会报告 passed 或 failed，而不是让质量门保持 pending。
- `SONAR_TOKEN` 密钥必须能够创建/读取项目、管理主分支、提交分析、读取质量门、读取组织质量门并读取项目度量；它不需要修改质量门的权限。
