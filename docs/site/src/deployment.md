# Deployment

The runtime image is `ghcr.io/vannadii/ironloom` unless the registry owner changes. The Helm chart deploys the `ironloom` binary with PVC-backed `.ironloom` state, secret references for Discord, GitHub, and SonarCloud credentials, and health/readiness probes.

Use the Helm chart under `deploy/helm/ironloom` for k3s deployments.

## Runtime Secrets

Create the runtime secrets in the target namespace before installing the chart.

```sh
kubectl create namespace ironloom
kubectl -n ironloom create secret generic ironloom-discord \
  --from-literal=token="${IRONLOOM_DISCORD_TOKEN}" \
  --from-literal=public-key="${IRONLOOM_DISCORD_PUBLIC_KEY}"
kubectl -n ironloom create secret generic ironloom-github \
  --from-literal=token="${IRONLOOM_GITHUB_TOKEN}"
kubectl -n ironloom create secret generic ironloom-sonarcloud \
  --from-literal=token="${IRONLOOM_SONARCLOUD_TOKEN}"
```

## k3s Dry Run

Run a server-side dry run before changing the cluster. This proves the current k3s API accepts the ServiceAccount, ConfigMap, PVC, Service, Deployment, and optional Ingress objects.

```sh
helm upgrade --install ironloom deploy/helm/ironloom \
  --namespace ironloom \
  --create-namespace \
  --dry-run=server
```

## Install Or Upgrade

Install from the local chart during validation, or from the published OCI chart after release publication.

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

## Smoke Checks

Verify the rollout, health endpoint, PVC-backed state, and first vertical slice harness.

```sh
kubectl -n ironloom rollout status deployment/ironloom
kubectl -n ironloom port-forward service/ironloom 8080:8080
curl -fsS http://127.0.0.1:8080/healthz
curl -fsS http://127.0.0.1:8080/readyz
cargo test -p ironloom-runtime --test vertical_slice
```

## Rollback

Keep the PVC unless an operator explicitly approves destructive cleanup.

```sh
helm -n ironloom history ironloom
helm -n ironloom rollback ironloom <revision>
kubectl -n ironloom rollout status deployment/ironloom
```

## Docs Publishing

`.github/workflows/docs-deploy.yml` publishes the mdBook public landing page and documentation to GitHub Pages on `main`.
