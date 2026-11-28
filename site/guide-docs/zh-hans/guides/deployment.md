# 部署

当前服务打开已配置的现有 PostgreSQL 安装和 OpenFGA 端点。故障时不会创建替代数据库。随附数据库服务和本地托管生命周期仍在实现中；本次连接配置并未完成整个部署计划。

启动 Deployment 前，准备选定的全新 PostgreSQL 数据库和当前 OpenFGA 服务，使用 `IRONLOOM_DATABASE_URL` 和 `IRONLOOM_INSTALLER_TOKEN` 运行一次 `ironloom initialize`。它仅创建全新的 Ironloom 模式并拒绝已有模式。正常重启使用 `ironloom serve` 打开同一安装。初始授权恢复仅限已记录的同一管理员，不会替换账户，也不会在完成后恢复被明确撤销的授权。

```mermaid
flowchart LR
  DB[(Fresh PostgreSQL)] --> Init[ironloom initialize]
  Init --> Service[ironloom serve]
  FGA[Configured OpenFGA] --> Service
  Service --> Account[Register and authenticate]
  Account --> Bootstrap[One-time bootstrap]
  Bootstrap --> Ready[Recover same-user initial grants]
```

Chart 从 `database.existingSecret` / `database.urlKey` 读取 `IRONLOOM_DATABASE_URL`（默认为 `ironloom-database` / `database-url`）。将 `openfga.url` 设置为实际获准端点，可通过 `openfga.existingSecret` / `openfga.tokenKey` 提供服务令牌。默认端点名称需要配置，目前尚未随附 OpenFGA 部署。连接保持私有，远程连接必须保护传输。

通过现有配置 Secret 提供 `IRONLOOM_CONFIG_KEY`，值为 base64 编码的 32 字节密钥。安装令牌在首次认证引导时消耗，不是可重复使用的管理员密码。普通账户通过认证注册路由创建。配置包含部署基础路径的 `runtime.publicUrl`，以及明确的正数 `download.maxFileBytes` / `download.maxTransferBytes`。

渲染 Chart 不会部署服务或验证推理。项目、模型和数据库的持久化根目录及所有者保持独立。不要通过删除 PVC 或重置安装来绕过连接或认证失败。


服务现在在公开部署路径下提供配置、指令、会话状态、历史和可重放 SSE。SSE 要求 `Last-Event-ID`；缓冲区溢出时发送 `ironloom.error` 并要求重新同步。断开连接或关闭传输不会取消执行。请配置稳定的 `IRONLOOM_NODE_ID` 和独立的绝对路径 `IRONLOOM_PROJECTS_ROOT` / `IRONLOOM_MODELS_ROOT`；Helm 提供独立持久卷。适配器、沙箱、托管依赖和完整执行仍在开发中。


Linux 命令隔离使用独立辅助进程、bubblewrap 命名空间、通过文件描述符固定的写入路径和 seccomp。隔离失败时绝不执行命令。原生 Linux 功能测试覆盖文件系统隔离、符号链接拒绝和后代进程清理。容器包含 bubblewrap/Git，使用 UID/GID 1000。完整工作流、Alpine 执行验证及 Mac/GPU 工作仍未完成。


调度租约绑定所属节点、确切服务实例和单调递增的所有权令牌。租约过期不会自动续租或重试；未停止的进程和未确认的外部变更会阻止显式恢复。沙箱辅助进程从启动阶段保护父进程终止。原生测试通过，但此主机默认 Docker 策略禁止创建命名空间，因此容器工作进程拒绝执行，尚未获得验证。完整调度工作流仍在开发中。

Linux 文件权限区分精确文件 `write_files` 与目录子树 `write_directories`。精确文件的创建、编辑、删除和移动通过原生文件工具完成；命令仅获得明确授权的目录挂载。可写目录拒绝硬链接，seccomp 禁止创建新硬链接。持久化路径所有权会保留至确认终止或完成协调，即使租约已经过期。完整运行时网关集成仍在进行。
