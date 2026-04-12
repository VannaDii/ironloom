# DevPlat Helm Chart

This chart deploys the DevPlat OpenClaw gateway runtime on Kubernetes.

## What It Deploys

- one `Deployment` running the `devplat-openclaw-runtime` container
- a `Service` exposing the OpenClaw gateway port
- an optional `ServiceAccount`
- optional config, secret, persistence, and ingress wiring

## Install

```bash
helm install devplat oci://ghcr.io/vannadii/charts/devplat \
  --version <chart-version>
```

## Common Overrides

- `image.repository`: runtime image repository
- `image.tag`: runtime image tag
- `service.port`: service port exposed by the chart
- `config.enabled`: mount an OpenClaw configuration file
- `persistence.enabled`: persist runtime state under `/var/lib/devplat`
- `ingress.enabled`: expose the service through an ingress

## Source

- Repository: https://github.com/VannaDii/devplat
- Docs: https://github.com/VannaDii/devplat/tree/main/site/guide-docs
- Support: https://github.com/VannaDii/devplat/issues
