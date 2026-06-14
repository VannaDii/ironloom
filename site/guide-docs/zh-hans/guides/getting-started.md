# 快速开始

本指南会在本地启动 Ironloom 运行时，验证现有 HTTP 端口，并展示首次运行设置关卡。

## 要求

- 来自 `rust-toolchain.toml` 的 Rust 工具链
- Cargo
- 可访问 `openssl` 的 shell

## 启动运行时

```sh
IRONLOOM_BIND_ADDR=127.0.0.1:8080 \
IRONLOOM_PUBLIC_URL=https://ironloom.dev \
IRONLOOM_STATE_ROOT=/tmp/ironloom/.ironloom \
IRONLOOM_CONFIG_KEY="$(openssl rand -base64 32)" \
IRONLOOM_INSTALLER_TOKEN="$(openssl rand -base64 32)" \
IRONLOOM_DISCORD_TOKEN=local-discord-token \
IRONLOOM_DISCORD_PUBLIC_KEY=local-discord-public-key \
IRONLOOM_GITHUB_TOKEN=local-github-token \
IRONLOOM_SONARCLOUD_TOKEN=local-sonar-token \
IRONLOOM_SONARCLOUD_ORGANIZATION=local-sonar-org \
IRONLOOM_SONARCLOUD_PROJECT_KEY=local-sonar-project \
IRONLOOM_OPENAI_API_KEY=local-openai-key \
cargo run -p ironloom-runtime --bin ironloom -- serve
```

## 检查健康和就绪

```sh
curl -fsS http://127.0.0.1:8080/healthz
curl -fsS http://127.0.0.1:8080/readyz
```

`/healthz` 报告 HTTP 服务器是否存活。`/readyz` 会返回 `503`，直到必需运行时配置能从环境变量或加密本地设置解析出来。

## 打开设置

访问 `http://127.0.0.1:8080/setup`。

如果 `IRONLOOM_CONFIG_KEY` 缺失或无效，页面只显示添加它的说明。配置密钥和安装令牌可用后，页面会接受缺失的运行时输入，并将其加密保存到 `IRONLOOM_STATE_ROOT` 下。
