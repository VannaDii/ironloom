# Crate API

Ironloom 严格保持 crate 职责边界，使运行时编排与领域逻辑分离。

| Crate | 职责 |
| --- | --- |
| `ironloom-core` | 类型化 ID、仓库和分支原语、共享错误。 |
| `ironloom-config` | 运行时配置解析、设置关卡和环境优先级。 |
| `ironloom-artifacts` | 不可变工件信封和模式契约。 |
| `ironloom-storage` | `.ironloom/` 文件系统状态、索引和加密设置配置。 |
| `ironloom-policy` | 失败关闭的策略决策。 |
| `ironloom-process-graph` | 类型化流程图验证和路由。 |
| `ironloom-queue` | 持久工作项生命周期契约。 |
| `ironloom-observability` | 审计和遥测记录。 |
| `ironloom-worktrees` | 本地 git worktree 安全。 |
| `ironloom-gates` | 关卡执行契约。 |
| `ironloom-workers` | 工作器请求和响应信封。 |
| `ironloom-supervisor` | 流程图路由选择和工作器调度。 |
| `ironloom-discord` | 线程感知的操作员适配器。 |
| `ironloom-github` | GitHub 事实源投影。 |
| `ironloom-sonarcloud` | SonarCloud 质量和合规归一化。 |
| `ironloom-runtime` | 服务组合、健康、就绪和首次运行设置 HTTP 表面。 |
