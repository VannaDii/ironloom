# Release Instructions

## Release Surfaces

- Publish npm packages through GitHub Packages.
- Publish the runtime image through GHCR Docker.
- Publish the chart through GHCR OCI Helm.
- Publish the documentation site through GitHub Pages.
- Keep public DevPlat packages in a single Changesets fixed release group.
- Tag stable releases with `vN`, `vN.N`, and `vN.N.N` release-line tags.

## Publication Guardrails

- Keep release surfaces aligned with GitHub state, generated artifacts, and validated build outputs.
- Do not publish a release surface from stale docs, stale schemas, or stale manifests.
- Keep release-facing artifact names and metadata attributable to the commit and workflow that produced them.
- Treat `vN.N.N` tags as immutable release points; only move `vN` and `vN.N` tags to the latest release in that line.

## Manual Dispatch

- Manual dispatch is allowed only when the GitHub reference, package list, and release intent are explicit.
- Manual dispatch must not bypass validation, provenance, or audit expectations.
- Do not introduce a special docs branch or side-channel release process.

## Rollback

- Pull request bodies must use `.github/pull_request_template.md` so release impact and rollback notes stay consistent across changes.
- Pull requests must state rollback notes when they affect packages, images, charts, docs, or operator workflows.
- Keep rollback paths compatible with GitHub history and existing release automation.
