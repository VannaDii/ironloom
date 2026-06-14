# 简介

Ironloom 是 Veritas Labs 提供的 Rust 监督运行时，用于可审计的工程运营。

它通过直接的 Rust 运行时协调 Discord 操作员动作、GitHub 事实源状态、SonarCloud 质量关卡、工作器执行、不可变工件和 k3s 部署。

## 系统流程

```mermaid
flowchart LR
  operator[Discord 操作员] --> discord[ironloom-discord]
  discord --> runtime[ironloom-runtime]
  runtime --> supervisor[ironloom-supervisor]
  supervisor --> policy[ironloom-policy]
  supervisor --> graph[ironloom-process-graph]
  graph --> workers[ironloom-workers]
  workers --> github[GitHub 事实源]
  workers --> sonar[SonarCloud 关卡]
  workers --> storage[ironloom-storage]
  storage --> artifacts[(.ironloom 工件)]
  supervisor --> discord
  runtime --> k3s[k3s 部署]
```

## 平台形态

- Discord 是主要的操作员界面。
- GitHub 仍然是仓库、拉取请求、检查和合并状态的事实源。
- SonarCloud 仍然是质量与合规关卡。
- Kubernetes 交付通过 Ironloom Helm chart 面向 k3s。
- 运行时状态存储在 `.ironloom` 下，并带有可审计的工件和索引。

## 文档地图

- [指南](/zh-hans/guides/getting-started) 覆盖设置、部署和操作员工作流。
- [开发者文档](/zh-hans/developers/architecture) 说明 crate 边界和验证关卡。
- [API 文档](/zh-hans/api/) 参考配置、HTTP 路由、存储、模式和 crate。
- [LLM 输出](/llms.txt) 以模型可读格式暴露站点内容。

操作员控制保留在 Discord、GitHub 和运行时控制平面中。这个静态站点不保存运行时凭据，也不执行生命周期动作。
