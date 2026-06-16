# Crate API

Ironloom 严格保持 crate 职责边界，使运行时编排与领域逻辑分离。

| Crate | 职责 |
| --- | --- |
| `ironloom-core` | 类型化 ID、仓库和分支原语、共享错误。 |
| `ironloom-config` | 运行时配置解析、设置关卡和环境优先级。 |
| `ironloom-artifacts` | 不可变工件信封和模式契约。 |
| `ironloom-storage` | `.ironloom/` 文件系统状态、工件索引、加密设置配置和持久化线程绑定。 |
| `ironloom-policy` | 失败关闭的策略决策。 |
| `ironloom-process-graph` | 类型化流程图验证和路由。 |
| `ironloom-queue` | 持久工作项生命周期契约。 |
| `ironloom-observability` | 审计和遥测记录。 |
| `ironloom-worktrees` | 本地 git worktree 安全。 |
| `ironloom-gates` | 关卡契约，以及带超时、工作目录、环境控制和捕获流的 allow-list 命令执行。 |
| `ironloom-workers` | 工作器请求/响应信封和进程内工作器注册表。 |
| `ironloom-supervisor` | 流程图路由选择和基于注册表的工作器调度。 |
| `ironloom-discord` | 带签名 HTTP 交互验证的线程感知操作员适配器。 |
| `ironloom-github` | GitHub 事实源 API 请求、HTTP transport，以及仓库、拉取请求和 check-run 投影。 |
| `ironloom-sonarcloud` | SonarCloud bootstrap、HTTP transport、质量门轮询和问题归一化。 |
| `ironloom-runtime` | 服务组合、健康、就绪和首次运行设置 HTTP 表面。 |
