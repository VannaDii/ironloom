[![CI](https://github.com/VannaDii/devplat/actions/workflows/ci.yml/badge.svg)](https://github.com/VannaDii/devplat/actions/workflows/ci.yml) [![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=vannadii_devplat&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=vannadii_devplat) [![Coverage](https://sonarcloud.io/api/project_badges/measure?project=vannadii_devplat&metric=coverage)](https://sonarcloud.io/summary/new_code?id=vannadii_devplat) [![Bugs](https://sonarcloud.io/api/project_badges/measure?project=vannadii_devplat&metric=bugs)](https://sonarcloud.io/summary/new_code?id=vannadii_devplat) [![Artifact Hub](https://img.shields.io/endpoint?url=https://artifacthub.io/badge/repository/devplat)](https://artifacthub.io/packages/search?repo=devplat)

# Development Platform

DevPlat is a Discord-first autonomous software-delivery platform built as a strict native-ESM TypeScript monorepo. Platform packages own domain logic, orchestration, contracts, and persistence; `@vannadii/devplat-openclaw` exposes that platform into OpenClaw; Discord operates as the primary human control plane; GitHub remains the system of record for specs, pull requests, reviews, and merge history.

## Platform Model

- research -> spec PR -> human approval -> slicing -> implementation PRs
- automated gates, review, and remediation loops
- operator control through OpenClaw + Discord with auditable artifacts
- publication through GitHub Packages npm packages, GHCR Docker, GHCR OCI Helm, and GitHub Pages

## Runtime Baseline

- Node.js `v24.14.1` from `.nvmrc`
- `packageManager` `npm@11.12.1`
- TypeScript `6.0.3` as the authoring baseline

Always activate the pinned runtime before development:

```bash
nvm use
npm ci
```

Compatibility validation runs on Linux only against the latest stable TypeScript `5.x` and `6.x` releases. Primary authoring targets TypeScript `6.0.3`.

## Baseline Commands

```bash
npm run check:repo
npm run check:pre-push
npm run test:coverage
npm run test:openclaw:deep
npm run docs:build
```

## Instruction Surfaces

- [`PLATFORM.md`](./PLATFORM.md): foundation-scope objective, package responsibilities, delivery surfaces, and acceptance criteria
- [`CONTRIBUTING.md`](./CONTRIBUTING.md): human workflow, review, and release contract
- [`AGENTS.md`](./AGENTS.md): terse coding-agent operating rules
- [`.github/copilot-instructions.md`](./.github/copilot-instructions.md): AI pair-programming rules
- [`.github/instructions/`](./.github/instructions): platform, architecture, performance, compatibility, release, testing, schema, review, and operator policies
- [`site/guide-docs/guides/platform-lifecycle.md`](./site/guide-docs/guides/platform-lifecycle.md): end-to-end platform flow
- [`site/guide-docs/guides/quality-performance-policy.md`](./site/guide-docs/guides/quality-performance-policy.md): complete-change and performance expectations
- [`site/guide-docs/guides/live-test-lab.md`](./site/guide-docs/guides/live-test-lab.md): dispatchable live end-to-end test lane and setup references

## Distribution Surfaces

- `docker/openclaw-runtime`: GHCR runtime image
- `deploy/helm/devplat`: GHCR OCI Helm chart
- `site/guide-docs`: GitHub Pages documentation site
