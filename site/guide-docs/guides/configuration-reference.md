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
- `OPENCLAW_PLUGIN_ID`
- `DISCORD_API_BASE_URL`
- `DISCORD_APPLICATION_ID` (required)
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

The normalized Discord runtime config also fixes:

- API version `v10`
- OAuth install scopes `bot` and `applications.commands`
- required guild/channel permissions for thread-aware control: `ViewChannel`, `SendMessages`, `CreatePublicThreads`, `CreatePrivateThreads`, `SendMessagesInThreads`, `ManageThreads`, and `ReadMessageHistory`

Missing required Discord credentials fail fast during config load instead of falling back to placeholder values.

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
