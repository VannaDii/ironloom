# Publishing and Release

## Release Surfaces

DevPlat publishes through four primary surfaces:

- GitHub Packages for npm packages
- GHCR for the Docker runtime image
- GHCR OCI for the Helm chart
- GitHub Pages for documentation

## Versioning Flow

- use Changesets for release intent and package versioning
- let the `release.yml` workflow create or update the release pull request
- merge the release pull request into `main`
- let the publish workflows release packages, container artifacts, and charts from the merged state
- let every pull request CI run publish a PR-numbered dev Helm chart
- let merges to `main` publish a unique non-dev Helm chart version from the merged state
- let every non-release merge to `main` publish a full prerelease workspace snapshot plus aligned dev packages and Docker artifacts

## Publish Workflows

- `release.yml`: creates or updates the Changesets release pull request
- `publish-release.yml`: publishes stable package versions after the release pull request merges, backfills any workspace packages that have not been published yet, and publishes full dev package snapshots for non-release merges to `main`
- `docker-publish.yml`: publishes `devplat-openclaw-runtime` to GHCR with release tags for release merges and `dev` tags for non-release merges to `main`
- `helm-publish.yml`: manual entry point that calls the reusable Helm publish action
- `.github/actions/publish-helm-chart/action.yml`: packages and pushes the Helm chart to GHCR OCI, using PR-numbered dev versions for pull request CI runs and non-dev build-metadata versions for `main` merges
- `docs-deploy.yml`: builds and deploys the VitePress site through the Pages artifact flow

## Helm Publication Requirements

- keep `deploy/helm/devplat/values.schema.json` aligned with the chart values surface so `helm lint` and install-time validation fail fast on invalid inputs
- sign the packaged chart in `.github/actions/publish-helm-chart/action.yml` with `helm package --sign`
- publish the `.prov` provenance file alongside the chart archive so OCI pushes include the Helm provenance layer automatically
- keep the Helm signing secrets available to Actions:
  - `HELM_GPG_PRIVATE`
  - `HELM_GPG_PUBLIC`

## Required Validation

Before a release-facing change is considered ready:

- `npm run check:repo`
- `npm run test:coverage`
- `npm run build`
- `npm run docs:build`

Release pull requests should also describe package, Docker, Helm, and docs impact explicitly in the repository pull request template.

## Rollback

- revert the release pull request or follow-up patch on `main`
- publish a correcting package release if npm versions already moved
- publish a replacement Docker image or Helm chart if runtime artifacts already moved
- redeploy docs from the corrected `main` state through the Pages workflow

Keep rollback notes concrete in the pull request so operators know which surfaces moved and which did not.
