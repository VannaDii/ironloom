# Helm and k3s Deployment

## Package

```bash
helm lint deploy/helm/devplat
helm package deploy/helm/devplat --destination .artifacts/helm
```

## Install on k3s

```bash
helm upgrade --install devplat deploy/helm/devplat \
  --namespace devplat \
  --create-namespace \
  --set image.repository=ghcr.io/vannadii/devplat-openclaw-runtime \
  --set image.tag=latest \
  --set discordGateway.enabled=true
```

## Values Coverage

- Configurable image repository, tag, and pull policy
- Typed `discordGateway.enabled`, `discordGateway.url`, and
  `discordGateway.intents` values for starting the private outbound Discord
  Gateway worker without requiring a public Discord webhook host
- ConfigMap-backed config injection
- Secret and ConfigMap environment references
- Optional PVC for OpenClaw state
- Optional Ingress for non-Discord HTTP surfaces; Discord interaction routing
  stays on the private outbound Gateway worker
