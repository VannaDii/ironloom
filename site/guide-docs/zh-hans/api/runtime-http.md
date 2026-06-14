# 运行时 HTTP API

Ironloom 在现有运行时 HTTP 端口上提供设置、健康和就绪接口。

## `GET /healthz`

当 HTTP 服务器存活时返回 `200 ok`。

## `GET /readyz`

只有当必需运行时配置能从环境值或加密本地设置解析出来时，才返回 `200 ok`。当设置仍未完成时返回 `503 setup required`。

## `GET /`

返回设置页面。

## `GET /setup`

返回设置页面。

如果 `IRONLOOM_CONFIG_KEY` 缺失或无效，页面只显示密钥说明，不显示设置输入字段。

如果 `IRONLOOM_INSTALLER_TOKEN` 缺失，页面显示安装令牌说明。

当设置前置条件存在时，页面渲染配置表单。由环境提供的字段会被锁定，密钥值不会显示。

## `POST /setup`

在提交的安装令牌与 `IRONLOOM_INSTALLER_TOKEN` 匹配后，接受设置表单值。

提交成功会将加密设置配置写入 `IRONLOOM_STATE_ROOT`，并返回 `200 setup saved`。

无效安装令牌返回 `403 setup rejected`。

## `POST /setup/openai/oauth/start`

返回配置页面使用的 OpenAI OAuth 设置说明。生成的 OAuth 会话引用可以通过设置表单保存，也可以通过 `IRONLOOM_OPENAI_OAUTH_SESSION` 绑定。
