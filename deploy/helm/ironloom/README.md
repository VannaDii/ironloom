# Ironloom Helm Chart

This chart deploys the Ironloom Rust supervisor runtime directly. It stores runtime state under `.ironloom` on a PVC, reads setup and runtime credentials from Kubernetes secrets when present, and exposes health, readiness, and first-run setup on the runtime HTTP endpoint.

`IRONLOOM_CONFIG_KEY` and `IRONLOOM_INSTALLER_TOKEN` are expected from the `setup.existingSecret` secret. Other runtime credentials are optional secret bindings so the pod can start and show the setup page before all credentials exist. The Discord application ID can be supplied as `discord.applicationId` or through `discord.applicationIdKey` in `discord.existingSecret`; use `--set-string discord.applicationId=...` when setting it from the Helm CLI. Environment values take precedence over encrypted local setup values. OpenAI authentication can be bound through `openai.apiKeyKey` or `openai.oauthSessionKey`.

Set `networkPolicy.enabled=true` to render an opt-in ingress NetworkPolicy for clusters whose CNI enforces Kubernetes network policy.

```sh
helm lint deploy/helm/ironloom
helm template ironloom deploy/helm/ironloom
```
