[![CI](https://github.com/VannaDii/devplat/actions/workflows/ci.yml/badge.svg)](https://github.com/VannaDii/devplat/actions/workflows/ci.yml) [![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=vannadii_devplat&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=vannadii_devplat) [![Coverage](https://sonarcloud.io/api/project_badges/measure?project=vannadii_devplat&metric=coverage)](https://sonarcloud.io/summary/new_code?id=vannadii_devplat) [![Bugs](https://sonarcloud.io/api/project_badges/measure?project=vannadii_devplat&metric=bugs)](https://sonarcloud.io/summary/new_code?id=vannadii_devplat) [![Artifact Hub](https://img.shields.io/endpoint?url=https://artifacthub.io/badge/repository/devplat)](https://artifacthub.io/packages/search?repo=devplat)

# Development Platform

DevPlat is a Discord-first autonomous software-delivery platform built as a strict native-ESM TypeScript monorepo. Platform packages own domain logic, orchestration, contracts, and persistence; `@vannadii/devplat-openclaw` exposes that platform into OpenClaw; Discord operates as the primary human control plane; GitHub remains the system of record for specs, pull requests, reviews, and merge history.

## Platform Model

- research -> spec PR -> human approval -> slicing -> implementation PRs
- automated gates, review, and remediation loops
- operator control through OpenClaw + Discord with auditable artifacts
- publication through GitHub Packages npm packages, GHCR Docker, GHCR OCI Helm, and GitHub Pages

```mermaid
flowchart TD
  Operator[Discord operator] --> OpenClaw[OpenClaw agent loop]
  Operator --> Commands[Discord command contracts]
  Commands --> DiscordGuild[Sandbox guild command registration]
  DiscordGuild --> Approval
  OpenClaw --> Adapter["@vannadii/devplat-openclaw adapter"]
  Adapter --> Config[Repository runtime config]
  Adapter --> Supervisor[Supervisor lifecycle routing]
  Supervisor --> Policy[Policy allow deny and audit reason]
  Policy --> Storage[Storage indexes and durable records]
  Supervisor --> Research[Research briefs with sources]
  Research --> Specs[Spec revisions and PR-ready body]
  Specs --> GitHubSpec[GitHub spec pull request]
  GitHubSpec --> Approval[Discord approval bound to thread]
  Approval --> Slicing[Slice dependency graph and work packets]
  Slicing --> Queue[Task queue transitions]
  Queue --> Worktrees[Git worktree allocate sync release]
  Worktrees --> Execution[Command execution retry timeout truncation]
  Execution --> Gates[Gate classification and next action]
  Gates --> Sonar[Sonar issue normalization]
  Gates --> Review[Spec vs implementation review]
  Sonar --> Review
  Review --> Remediation[Remediation plan and result artifacts]
  Remediation --> Execution
  Review --> PRs[PR projection and merge readiness]
  PRs --> GitHubPR[GitHub PR update merge workflow dispatch]
  GitHubPR --> Branching[Dependent branch graph and rebase plan]
  Branching --> Worktrees
  GitHubPR --> Publishing[Docker Helm npm docs release surfaces]
  Storage --> Artifacts[Versioned artifacts and audit logs]
  Artifacts --> Operator
```

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
npm run act:pr
npm run sonar:install-cli
npm run sonar:analyze:changed
```

`npm run check:unit-tests`, included in `check:repo`, verifies that every
non-trivial `logic.ts` and `service.ts` has a sibling test and that every
`.test.ts`, `.test.mts`, and `.test.mjs` file uses the structured
`const cases = [...]` table with `inputs`, `mock`, and `assert` fields.

`npm run act:pr` runs the pull-request CI and TypeScript matrix workflows
locally through Docker using `act`, `.actrc`, and
`.github/act/pull_request.json`. The wrapper at `scripts/run-act.sh` cleans up
`act-*` Docker containers and `.artifacts/act` before and after each workflow,
then runs the hermetic OpenClaw deep test outside `act` so nested Docker volume
paths resolve on the host. The fixture deliberately uses a secretless bot-style
PR event so publish and Sonar upload paths stay skipped locally. The CI workflow
also skips remote artifact upload/download actions under `ACT=true` and skips
the nested-Docker deep-test job for the `devplat-local-act` actor while still
executing repo, coverage, build, docs, generated artifact, and compatibility
jobs.

`npm run sonar:install-cli` installs the SonarQube CLI through the repo helper,
which selects the documented SonarSource installer for macOS, Linux, or Windows.
After authenticating with `sonar auth login`, run `npm run sonar:analyze:changed`
to scan changed files with `sonar analyze secrets` and per-file
`sonar verify --file` commands. The wrapper runs configured analyses in
parallel, prints a plain-text summary by default, and supports `--json` for
agent-readable reports. SQAA/A3S analysis is intentionally disabled unless
`SONAR_A3S_ENABLED=true`, `DEVPLAT_SONAR_A3S_ENABLED=true`, or `--sqaa enabled`
is supplied; when enabled it also runs per-file `sonar analyze sqaa --file`
commands. If SQAA returns
`A3S analysis is not activated for this organization`, the helper reports that
capability as skipped instead of allowing the whole analysis run to fail. The
wrapper derives the current branch and defaults the project to `vannadii_devplat`;
override with `--project`, `--branch`, `--base`, or `--head` only for exceptional
local comparisons.

Runtime configuration is repository-scoped for the single-repo production path.
Set `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_DEFAULT_BRANCH`, GitHub API/token
overrides, runtime storage/worktree overrides, Docker/Helm deployment
overrides, and the Discord/OpenClaw/Sonar variables documented in the
configuration guide before running live operator flows. Config loading now
normalizes those defaults, derives the Discord category name from `GITHUB_REPO`
for multi-repository guild separation unless test traffic explicitly sets
`DISCORD_CATEGORY_NAME=test`, configures outbound Discord Gateway interaction
handling with `DISCORD_GATEWAY_URL` and `DISCORD_GATEWAY_INTENTS`, and returns
structured validation issues for bad URLs, empty required paths, invalid
deployment targets, and invalid gateway ports. The storage package remains the
only package that directly reads or writes the committed runtime state
directory.
The Helm chart mirrors that runtime path with typed `discordGateway.enabled`,
`discordGateway.url`, and `discordGateway.intents` values that render the
Gateway env vars into the runtime container.

The live lab posts compact status payloads without stale interactive components,
registers Discord operator commands in the sandbox guild, and records
callback-shaped interaction evidence in its report, including response
endpoints, Discord message ids, posted content, and component custom ids from
the posted control-plane payloads. The initial project-management bootstrap
message is a required acceptance signal; if Discord cannot post it, the live lab
fails before mutating sandbox repository state. The report preserves that
bootstrap receipt with channel id, message id, posted content, and an empty
component id list so operators can audit the visible start signal without
leaving unbound status buttons that outlive the ephemeral runner.
Human-triggered Discord client clicks remain a manual sandbox-guild acceptance
check because Discord does not expose a supported bot API for clicking buttons
as a user. The `operator_hold_ms` live-lab input keeps the private Gateway
runtime open for a bounded manual-click window after the control message is
posted. Live-lab status posts suppress raw GitHub URL previews, and reports
include selected channel `parentId` values so category placement can be audited.
Live-lab runtime containers receive the same repo-scoped Discord/OpenClaw/Sonar
environment through Docker env-name pass-through while report artifacts keep
secret values redacted. The live container explicitly starts the private
Discord Gateway worker and points `DEVPLAT_STORAGE_ROOT` at the mounted
`.devplat` state directory so real sandbox-guild slash commands and button
clicks are acknowledged through the same thread binding store used by OpenClaw
tool execution. Valid operator interactions are acknowledged before state,
telemetry, and audit persistence begins, then the bound thread receives the same
structured status payload after the control result is durable. If Discord
rejects the initial acknowledgement, DevPlat fails the action closed, writes an
audit event, and reports `responsePostError` without lifecycle state changes. If
the post-acknowledgement thread update fails, the control result keeps the
interaction receipt and durable action record while reporting `threadPostError`.

Public contract schemas are generated from exported `io-ts` codecs. For
codec-owned lifecycle records, derive TypeScript types from those codecs rather
than duplicating interface shapes, then run `npm run generate:schemas` and
`npm run generate:openclaw-manifest` with the code change.

## Instruction Surfaces

- [`PLATFORM.md`](./PLATFORM.md): foundation-scope objective, package responsibilities, delivery surfaces, and acceptance criteria
- [`CONTRIBUTING.md`](./CONTRIBUTING.md): human workflow, review, and release contract
- [`AGENTS.md`](./AGENTS.md): terse coding-agent operating rules
- [`.github/copilot-instructions.md`](./.github/copilot-instructions.md): AI pair-programming rules
- [`.github/instructions/`](./.github/instructions): platform, architecture, performance, compatibility, release, testing, schema, review, and operator policies
- [`site/guide-docs/guides/platform-lifecycle.md`](./site/guide-docs/guides/platform-lifecycle.md): end-to-end platform flow
- [`site/guide-docs/guides/user-guide.md`](./site/guide-docs/guides/user-guide.md): setup, first small project validation, Discord checks, and troubleshooting
- [`site/guide-docs/guides/quality-performance-policy.md`](./site/guide-docs/guides/quality-performance-policy.md): complete-change and performance expectations
- [`site/guide-docs/guides/live-test-lab.md`](./site/guide-docs/guides/live-test-lab.md): dispatchable live end-to-end test lane and setup references
- `packages/*/README.md`: package-local ownership, boundary, and validation notes

## Distribution Surfaces

- `docker/openclaw-runtime`: GHCR runtime image
- `deploy/helm/devplat`: GHCR OCI Helm chart
- `site/guide-docs`: GitHub Pages documentation site
