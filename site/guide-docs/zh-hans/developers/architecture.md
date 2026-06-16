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
- `ironloom-supervisor` 拥有流程路由和工作器注册表调度决策。
- `ironloom-discord` 是操作员控制平面适配器，并在处理前验证签名的 Discord HTTP 交互。
- `ironloom-github` 在监督器决策前通过可审计 API 请求读取 GitHub 事实源状态。
- `ironloom-sonarcloud` 拥有 SonarCloud bootstrap 验证、质量门轮询和问题归一化。
- `ironloom-storage` 拥有直接 `.ironloom/` 文件系统访问。

## 第一个垂直切片

1. 运行时 HTTP 端口接受签名的 Discord 命令 interaction。
2. 运行时把 Discord 线程解析到唯一持久化工作项，并在缺失或含糊绑定时失败关闭。
3. 监督器通过流程图选择关卡工作器，并通过工作器注册表调度。
4. 策略只允许绑定线程的非破坏性关卡动作。
5. 关卡工作器以受控环境、超时和捕获流运行 allow-list 命令，然后返回结构化结果。
6. 存储在 `.ironloom` 下写入不可变工件，并按线程和工作项建立索引。
7. 运行时向发起 interaction 返回 Discord channel message response。
