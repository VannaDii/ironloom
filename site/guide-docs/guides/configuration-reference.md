# Configuration Reference

## Node and Package Manager

- `.nvmrc` pins the development baseline to Node `24.14.1`
- `packageManager` pins `npm@11.12.1`
- runtime verification scripts ensure local and CI execution stay aligned with repository policy

## TypeScript

- primary authoring target: TypeScript `6.0.3`
- Compatibility validation runs on Linux only against the latest stable TypeScript `5.x` and `6.x` releases.
- Do not use TypeScript type assertions or casts anywhere in authored code; banned forms include `as`, `as unknown`, angle-bracket casts, non-null assertions, and double assertions.
- source packages compile under `NodeNext` module settings

## Operator and Adapter Configuration

Runtime configuration normalization reads:

- `GITHUB_OWNER`
- `GITHUB_REPO`
- `GITHUB_DEFAULT_BRANCH`
- `GITHUB_API_BASE_URL`
- `GITHUB_WEB_BASE_URL`
- `GITHUB_TOKEN_ENV`
- `DEVPLAT_STORAGE_ROOT`
- `DEVPLAT_ARTIFACT_DIRECTORY`
- `DEVPLAT_INDEX_DIRECTORY`
- `DEVPLAT_AUDIT_LOG_DIRECTORY`
- `DEVPLAT_WORKTREE_ROOT`
- `DEVPLAT_DEPLOYMENT_TARGET`
- `DEVPLAT_DOCKER_IMAGE_REPOSITORY`
- `DEVPLAT_DOCKER_IMAGE_TAG`
- `DEVPLAT_HELM_RELEASE`
- `DEVPLAT_HELM_NAMESPACE`
- `DEVPLAT_HELM_CHART_PATH`
- `DEVPLAT_STATE_MOUNT_PATH`
- `OPENCLAW_PLUGIN_ID`
- `OPENCLAW_GATEWAY_PORT`
- `DISCORD_API_BASE_URL`
- `DISCORD_APPLICATION_ID` (required)
- `DISCORD_CATEGORY_NAME`
- `DISCORD_PUBLIC_KEY` (required)
- `DISCORD_BOT_TOKEN` (required)
- `DISCORD_DEFAULT_GUILD_ID`
- `DISCORD_SPEC_CHANNEL_ID`
- `DISCORD_IMPLEMENTATION_CHANNEL_ID`
- `DISCORD_PULL_REQUEST_CHANNEL_ID`
- `DISCORD_AUDIT_CHANNEL_ID`
- `DISCORD_PROJECT_MANAGEMENT_CHANNEL_ID`
- `SONAR_ORGANIZATION`
- `SONAR_PROJECT_KEY`

The normalized repository runtime config exposes `owner`, `repo`,
`defaultBranch`, and `repositoryKey`. GitHub API submission defaults to
`https://api.github.com`, GitHub web links default to `https://github.com`, and
the token is read from `GITHUB_TOKEN` unless `GITHUB_TOKEN_ENV` is overridden.
Storage defaults to `devplat-state` with `artifacts`, `indexes`, and `audit`
subdirectories at layout version `1`. Worktrees default to
`devplat-state/worktrees`, inherit the configured default branch, and use
`rebase-or-fast-forward` sync. Deployment defaults target local Docker with
`ghcr.io/vannadii/devplat-openclaw-runtime:latest`, Helm release `devplat`,
namespace `devplat`, chart path `deploy/helm/devplat`, and state mount
`/var/lib/devplat`. The OpenClaw gateway defaults to loopback token auth on port
`18789`. Only `@vannadii/devplat-storage` may directly read or write the runtime
state directory.

The normalized Discord runtime config also fixes:

- API version `v10`
- category name: defaults to `GITHUB_REPO` for multi-repository guild
  separation; OpenClaw test and live-lab runs set this to `test`
- OAuth install scopes `bot` and `applications.commands`
- required guild/channel permissions for thread-aware control: `ViewChannel`, `SendMessages`, `CreatePublicThreads`, `CreatePrivateThreads`, `SendMessagesInThreads`, `ManageThreads`, and `ReadMessageHistory`

Missing required Discord credentials, invalid URLs, invalid gateway ports, and
invalid deployment targets fail fast during config load. Normalized config can
also be checked for structured validation issues before it is handed to
integration services.

Recommended channel layout:

- spec parent channel for spec threads
- implementation parent channel for implementation threads
- pull-request parent channel for pull-request threads
- audit channel for operator-visible audit traffic
- project-management channel for non-mutating status queries that link back to the active bound threads

## Generated Artifacts

- JSON schemas: `packages/*/schemas/*.schema.json`
- OpenClaw manifest: `packages/openclaw/openclaw.plugin.json`
- docs publication: `site/guide-docs/.vitepress/dist`
