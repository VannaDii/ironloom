# 配置 API

运行时配置的解析顺序是环境值优先，其次才是加密的设置值。

## 设置环境

| 变量 | 必需 | 描述 |
| --- | --- | --- |
| `IRONLOOM_CONFIG_KEY` | 是 | Base64 编码的 32 字节密钥材料。在显示设置输入之前必需。 |
| `IRONLOOM_INSTALLER_TOKEN` | 是 | 操作员生成的令牌，用于提交设置变更。 |
| `IRONLOOM_STATE_ROOT` | 是 | `.ironloom` 数据和加密设置存储的状态根目录。 |

## 运行时环境

| 变量 | 就绪所需 | 描述 |
| --- | --- | --- |
| `IRONLOOM_PUBLIC_URL` | 是 | 公共运行时 URL。 |
| `IRONLOOM_DISCORD_TOKEN` | 是 | Discord 令牌或密钥引用。 |
| `IRONLOOM_DISCORD_PUBLIC_KEY` | 是 | Discord 公钥或密钥引用。 |
| `IRONLOOM_GITHUB_TOKEN` | 是 | GitHub 令牌或密钥引用。 |
| `IRONLOOM_SONARCLOUD_TOKEN` | 是 | SonarCloud 令牌或密钥引用。 |
| `IRONLOOM_SONARCLOUD_ORGANIZATION` | 是 | SonarCloud 组织。 |
| `IRONLOOM_SONARCLOUD_PROJECT_KEY` | 是 | SonarCloud 项目键。 |
| `IRONLOOM_OPENAI_API_KEY` | 需要一种 OpenAI 方法 | OpenAI API 密钥。 |
| `IRONLOOM_OPENAI_OAUTH_SESSION` | 需要一种 OpenAI 方法 | OpenAI OAuth 会话引用。 |

## 解析顺序

1. 环境变量。
2. `${IRONLOOM_STATE_ROOT}/setup/config.enc.json` 中的加密设置文件。
3. 缺少运行时字段错误。

必需值为空时会失败关闭。
