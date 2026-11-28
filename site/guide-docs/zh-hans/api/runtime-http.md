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
