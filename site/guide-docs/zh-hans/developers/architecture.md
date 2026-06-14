# 架构

Ironloom 通过类型化流程图路由工作。监督器验证策略、选择工作器、在 `.ironloom` 下记录不可变工件，并把结果报告回发起操作的控制表面。

Discord、GitHub 和 SonarCloud 适配器保持在边缘。业务规则位于核心 crate、策略、流程图、工作器和监督器中。

## 运行时边界

```mermaid
flowchart TB
  runtime[ironloom-runtime]
  runtime --> config[ironloom-config]
  runtime --> supervisor[ironloom-supervisor]
  runtime --> storage[ironloom-storage]
  supervisor --> policy[ironloom-policy]
  supervisor --> graph[ironloom-process-graph]
  supervisor --> workers[ironloom-workers]
  workers --> gates[ironloom-gates]
  workers --> github[ironloom-github]
  workers --> sonar[ironloom-sonarcloud]
  storage --> artifacts[(.ironloom 状态)]
  discord[ironloom-discord] --> runtime
  core[ironloom-core] --> config
  core --> policy
  core --> graph
  core --> workers
```

## 边界规则

- `ironloom-runtime` 是可部署服务和组合边界。
- `ironloom-supervisor` 拥有流程路由和工作器调度决策。
- `ironloom-discord` 是操作员控制平面适配器。
- `ironloom-github` 通过可审计请求读取和写入 GitHub 事实源状态。
- `ironloom-sonarcloud` 拥有 SonarCloud 质量和合规归一化。
- `ironloom-storage` 拥有直接 `.ironloom/` 文件系统访问。

## 第一个垂直切片

1. 一个伪 Discord 命令被绑定到唯一线程和工作项。
2. Discord 适配器在缺失或含糊绑定时失败关闭。
3. 监督器通过流程图选择关卡工作器。
4. 策略只允许绑定线程的非破坏性关卡动作。
5. 关卡工作器返回结构化结果。
6. 存储在 `.ironloom` 下写入不可变工件，并按线程和工作项建立索引。
7. 伪 Discord 传输回复到发起线程。
