# 运行时 HTTP API

认证服务使用 Tokio/Axum 和配置的部署基础路径。`ironloom serve` 打开所选的现有 PostgreSQL 安装。`ironloom initialize` 明确创建全新模式及一次性引导令牌状态，拒绝已有模式。存储故障或重启不会创建替代数据。

服务登录与推理提供者凭据分离。登录返回 `AuthenticatedSession`，设置 HttpOnly 的 `ironloom_session`，并通过 `ironloom_csrf` Cookie 和 `x-ironloom-csrf` 响应头提供 CSRF 证明。修改请求必须携带此请求头。Cookie 使用部署路径、SameSite=Lax，HTTPS 时启用 Secure。跨源请求被拒绝。OIDC 回调还需要绑定浏览器的一次性流程 Cookie。

| Method | Path | Contract / transport |
| --- | --- | --- |
| POST | `/api/v1/auth/register` | `LoginRequest`; initial `x-ironloom-setup-token`, later current administrator + CSRF |
| POST | `/api/v1/auth/local` | `LoginRequest` → `AuthenticatedSession` + cookies |
| GET | `/api/v1/auth/session` | Current `AuthenticatedSession`; no-store |
| POST | `/api/v1/auth/oidc/start` | `OidcStart` → authorization URL JSON + HttpOnly flow cookie |
| POST | `/api/v1/auth/oidc/callback` | `OidcCallback` → `AuthenticatedSession` + cookies |
| POST | `/api/v1/auth/bootstrap` | `BootstrapRedeem` → fixed `BootstrapState`; CSRF |
| POST | `/api/v1/auth/logout` | Revoke current session and clear cookies; CSRF |
| GET | `/healthz` | Process liveness, root path |
| GET | `/readyz` | Selected PostgreSQL and OpenFGA binding reachable; separate from execution setup, root path |

必需配置：`IRONLOOM_DATABASE_URL`、`IRONLOOM_OPENFGA_URL`、`IRONLOOM_CONFIG_KEY`（base64，32 字节）、`IRONLOOM_PUBLIC_URL` 和两项下载字节上限。仅明确初始化读取 `IRONLOOM_INSTALLER_TOKEN`。可选项包括 `IRONLOOM_OPENFGA_TOKEN` 及 `IRONLOOM_OIDC_CONNECTIONS`；后者为包含 `{id, issuer, client_id, client_secret, redirects}` 的 JSON 数组，回调地址必须与允许列表精确匹配。电子邮箱不作为身份依据。

角色执行、模型及源适配器连接、操作界面资源仍在实现中。这里的认证路由已实现，但整个软件工厂尚未完成。


历史分页必须明确指定前向或后向，可按轮次筛选；每页按时间正序返回，并绑定请求的事件水位。原生会话列表使用 `order=created_at`，仪表盘使用 `order=human_interaction`。本地设备绑定为空、被禁用或与角色限制无交集时，执行就绪状态为否。配置、指令和会话列表、快照及历史 HTTP 路由使用共享认证后端；完整运行时组合仍在开发中。


服务现在在公开部署路径下提供配置、指令、会话状态、历史和可重放 SSE。SSE 要求 `Last-Event-ID`；缓冲区溢出时发送 `ironloom.error` 并要求重新同步。断开连接或关闭传输不会取消执行。请配置稳定的 `IRONLOOM_NODE_ID` 和独立的绝对路径 `IRONLOOM_PROJECTS_ROOT` / `IRONLOOM_MODELS_ROOT`；Helm 提供独立持久卷。适配器、沙箱、托管依赖和完整执行仍在开发中。


Linux 命令隔离使用独立辅助进程、bubblewrap 命名空间、通过文件描述符固定的写入路径和 seccomp。隔离失败时绝不执行命令。原生 Linux 功能测试覆盖文件系统隔离、符号链接拒绝和后代进程清理。容器包含 bubblewrap/Git，使用 UID/GID 1000。完整工作流、Alpine 执行验证及 Mac/GPU 工作仍未完成。


调度租约绑定所属节点、确切服务实例和单调递增的所有权令牌。租约过期不会自动续租或重试；未停止的进程和未确认的外部变更会阻止显式恢复。沙箱辅助进程从启动阶段保护父进程终止。原生测试通过，但此主机默认 Docker 策略禁止创建命名空间，因此容器工作进程拒绝执行，尚未获得验证。完整调度工作流仍在开发中。


经验的 HTTP 读取、编辑、范围调整和删除命令按当前管理及共享权限检查，不要求访问私有来源。删除会移除内容，只保留供授权重试使用的无内容标识记录。后台恢复使用当前状态，不会恢复较旧的共享范围。工作流命令执行仍在开发中。
