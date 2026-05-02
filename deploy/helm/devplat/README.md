# DevPlat Helm Chart

This chart deploys the DevPlat OpenClaw gateway runtime on Kubernetes.

## What It Deploys

- one `Deployment` running the `devplat-openclaw-runtime` container
- optional outbound Discord Gateway interaction processing when
  `DISCORD_GATEWAY_ENABLED=true`
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
- `env`: pass Discord Gateway, Discord REST, GitHub, Sonar, and storage runtime
  variables into the container
- `persistence.enabled`: persist runtime state under `/var/lib/devplat`
- `ingress.enabled`: expose the OpenClaw gateway service through an ingress;
  Discord operator interactions do not require ingress when Gateway mode is
  enabled

## Source

- Repository: https://github.com/VannaDii/devplat
- Docs: https://github.com/VannaDii/devplat/tree/main/site/guide-docs
- Support: https://github.com/VannaDii/devplat/issues
