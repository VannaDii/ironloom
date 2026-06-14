# 操作员工作流

会改变生命周期的 Discord 动作必须绑定到唯一持久化工作项和线程。在任何工作器运行之前，缺失或含糊的线程上下文都会失败关闭。

## 命令序列

```mermaid
sequenceDiagram
  participant Operator as Discord 操作员
  participant Discord as ironloom-discord
  participant Runtime as ironloom-runtime
  participant Supervisor as ironloom-supervisor
  participant GitHub as ironloom-github
  participant Worker as ironloom-workers
  participant Storage as ironloom-storage

  Operator->>Discord: 提交线程命令
  Discord->>Runtime: 发送已绑定请求
  Runtime->>Supervisor: 解析路由
  Supervisor->>GitHub: 刷新事实源状态
  GitHub-->>Supervisor: 当前仓库状态
  Supervisor->>Supervisor: 应用策略和流程图
  alt 线程绑定缺失或含糊
    Supervisor-->>Discord: 拒绝动作
    Discord-->>Operator: 说明绑定失败
  else 线程绑定明确
    Supervisor->>Worker: 调度工作
    Worker-->>Supervisor: 返回结构化结果
    Supervisor->>Storage: 写入不可变工件
    Storage-->>Supervisor: 工件索引已更新
    Supervisor-->>Discord: 返回已审计结果
    Discord-->>Operator: 回复到发起线程
  end
```

## 线程绑定

Ironloom 将 Discord 线程视为操作员上下文。命令必须解析到单个工作项，策略或工作器调度才能运行。

## GitHub 状态

在拉取请求、分支、检查、审查或合并决策前，应刷新 GitHub 状态。缓存状态可以支持显示和索引，但它不是事实源。

## 工件

监督器将不可变工件存储在 `.ironloom` 下，并按线程和工作项建立索引。面向操作员的响应应指回发起线程。
