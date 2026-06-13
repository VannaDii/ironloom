# Ironloom Helm Chart

This chart deploys the Ironloom Rust supervisor runtime directly. It stores runtime state under `.ironloom` on a PVC, reads Discord/GitHub/SonarCloud credentials from Kubernetes secrets, and exposes health and readiness probes on the runtime HTTP endpoint.

Set `networkPolicy.enabled=true` to render an opt-in ingress NetworkPolicy for clusters whose CNI enforces Kubernetes network policy.

```sh
helm lint deploy/helm/ironloom
helm template ironloom deploy/helm/ironloom
```
