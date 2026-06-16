# 部署

除非注册表所有者发生变化，否则运行时镜像是 `ghcr.io/vannadii/ironloom`。Helm chart 部署 `ironloom` 二进制，并使用 PVC 支持的 `.ironloom` 状态、设置时加密的本地配置、Discord、GitHub、SonarCloud 和 OpenAI 凭据的可选密钥引用，以及健康和就绪探针。

使用 `deploy/helm/ironloom` 下的 Helm chart 进行 k3s 部署。

## 部署流程

```mermaid
flowchart LR
  operator[操作员] --> secret[创建设置和运行时密钥]
  secret --> helm[helm upgrade --install]
  helm --> deployment[ironloom Deployment]
  deployment --> pvc[(PVC 支持的 .ironloom 状态)]
  deployment --> probes[健康和就绪探针]
  probes --> health[/GET /healthz/]
  probes --> ready[/GET /readyz/]
  deployment --> setup[/运行时端口上的设置页面/]
  setup --> encrypted[加密本地设置]
  encrypted --> pvc
  ready --> service[服务就绪]
  service --> rollback[Helm 历史和回滚保留 PVC]
```

## 运行时密钥

安装 chart 前，请在目标命名空间中创建设置密钥。`IRONLOOM_CONFIG_KEY` 必须是 Base64 编码的 32 字节密钥材料。`IRONLOOM_INSTALLER_TOKEN` 授权首次运行设置表单提交。

```sh
kubectl create namespace ironloom
kubectl -n ironloom create secret generic ironloom-setup \
  --from-literal=config-key="$(openssl rand -base64 32)" \
  --from-literal=installer-token="$(openssl rand -base64 32)"
```

运行时凭据可以通过 Kubernetes secrets、设置页面或两者同时提供。环境绑定的密钥优先于加密本地设置值。

```sh
kubectl -n ironloom create secret generic ironloom-discord \
  --from-literal=application-id="${IRONLOOM_DISCORD_APPLICATION_ID}" \
  --from-literal=token="${IRONLOOM_DISCORD_TOKEN}" \
  --from-literal=public-key="${IRONLOOM_DISCORD_PUBLIC_KEY}"
kubectl -n ironloom create secret generic ironloom-github \
  --from-literal=token="${IRONLOOM_GITHUB_TOKEN}"
kubectl -n ironloom create secret generic ironloom-sonarcloud \
  --from-literal=token="${IRONLOOM_SONARCLOUD_TOKEN}"
kubectl -n ironloom create secret generic ironloom-openai \
  --from-literal=api-key="${IRONLOOM_OPENAI_API_KEY}"
```

对于 Discord 授权，请通过 `application-id` 密钥键或 Helm 值 `--set-string discord.applicationId=...` 提供 `IRONLOOM_DISCORD_APPLICATION_ID`。对于 OpenAI 身份验证，请提供 `IRONLOOM_OPENAI_API_KEY` 或 `IRONLOOM_OPENAI_OAUTH_SESSION`。设置页面也支持两种模式。

## k3s 预演

更改集群前运行服务器端预演。

```sh
helm upgrade --install ironloom deploy/helm/ironloom \
  --namespace ironloom \
  --create-namespace \
  --dry-run=server
```

## 本地 k3s 验收

发布或提升 chart 变更前，运行一次性本地验收配方。

```sh
just k3s-acceptance
```

该配方会构建 `ironloom:local`，启动由 Docker 支持的一次性 k3s 集群，创建 setup 和 runtime secrets，安装 Helm chart，通过 `/discord/interactions` 验证签名的 Discord ping 和命令处理，并重启 Deployment 以证明 PVC 支持的 thread 工件索引会保留。运行时默认转发到 `127.0.0.1:18081`；该端口不可用时请设置 `IRONLOOM_K3S_HTTP_PORT`。本地镜像构建默认使用 host networking；如需使用 Docker 默认构建网络，请设置 `IRONLOOM_DOCKER_BUILD_NETWORK=default`。

## 实时 Discord Endpoint 验收

绑定真实 Discord 应用 ID、bot token 和 public key 后，运行 Discord endpoint 验证证明。

```sh
just discord-endpoint-acceptance
```

该配方会启动本地 runtime，通过 `ngrok` 发布它，更新应用的 Interactions Endpoint URL，等待 Discord 发送签名验证 `PING`，确认 Discord 已保存该 URL，并恢复之前的 endpoint。设置 `IRONLOOM_DISCORD_ACCEPTANCE_ENDPOINT_URL` 可验证已经部署的公开 `/discord/interactions` endpoint，而不启动 Docker 和 `ngrok`。

## 实时外部探测

绑定真实运行时凭据后，运行外部探测以验证 GitHub 事实源读取和 SonarCloud 质量门轮询。

```sh
IRONLOOM_GITHUB_REPOSITORY=VannaDii/ironloom just external-probe
```

该命令使用与服务相同的 `IRONLOOM_*` 运行时环境值，并打印脱敏 JSON 摘要，其中包含 GitHub 仓库投影、SonarCloud 质量门状态和未解决问题数量。设置 `IRONLOOM_GITHUB_PULL_REQUEST_NUMBER` 和 `IRONLOOM_GITHUB_CHECK_REF` 可在摘要中包含实时拉取请求合并状态和 check-run 读取结果。

## 安装或升级

验证期间从本地 chart 安装，发布完成后也可以从已发布的 OCI chart 安装。

```sh
helm upgrade --install ironloom deploy/helm/ironloom \
  --namespace ironloom \
  --create-namespace \
  --set image.repository=ghcr.io/vannadii/ironloom \
  --set image.tag=0.1.0
```

```sh
helm upgrade --install ironloom oci://ghcr.io/vannadii/charts/ironloom \
  --namespace ironloom \
  --create-namespace \
  --version 0.1.0
```

## 冒烟检查

```sh
kubectl -n ironloom rollout status deployment/ironloom
kubectl -n ironloom port-forward service/ironloom 8080:8080
curl -fsS http://127.0.0.1:8080/healthz
curl -fsS http://127.0.0.1:8080/readyz
cargo test -p ironloom-runtime --test vertical_slice
```

## 回滚

除非操作员明确批准破坏性清理，否则保留 PVC。

```sh
helm -n ironloom history ironloom
helm -n ironloom rollback ironloom <revision>
kubectl -n ironloom rollout status deployment/ironloom
```

## 站点发布

`.github/workflows/docs-deploy.yml` 会在 `main` 上将 VitePress 站点发布到 GitHub Pages 的 `https://ironloom.dev`。
