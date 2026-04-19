# Introduction

DevPlat is a strict native-ESM TypeScript monorepo for an autonomous software-delivery platform. It keeps business logic in platform packages, exposes capabilities through an adapter-only OpenClaw package, uses Discord as the primary operator control plane, and preserves GitHub as the system of record for specs, pull requests, reviews, and merge history.

## Platform Goals

- research a capability or product area
- open and approve spec pull requests
- slice approved work into implementation units
- create and maintain implementation pull requests
- run gates, review, and remediation loops automatically
- publish aligned packages, images, charts, and docs

## Runtime Baseline

- Node `24.14.1`
- `packageManager` `npm@11.12.1`
- TypeScript `6.0.3`
- Native ESM with `module` and `moduleResolution` set to `NodeNext`

Compatibility validation runs on Linux only against the latest stable TypeScript `5.x` and `6.x` releases. Primary authoring targets TypeScript `6.0.3`.
