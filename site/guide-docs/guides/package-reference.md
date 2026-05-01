# Package Reference

## Core Contracts

- `@vannadii/devplat-core`: shared lifecycle primitives and decode helpers
- `@vannadii/devplat-config`: runtime config normalization
- `@vannadii/devplat-artifacts`: artifact envelope and approval/audit contracts
- `@vannadii/devplat-policy`: privileged action policy decisions

## Workflow Packages

- `@vannadii/devplat-memory`: persistent knowledge, constraints, and history
- `@vannadii/devplat-research`, `@vannadii/devplat-specs`, `@vannadii/devplat-slicing`
- `@vannadii/devplat-queue`, `@vannadii/devplat-worktrees`, `@vannadii/devplat-execution`
- `@vannadii/devplat-gates`, `@vannadii/devplat-review`, `@vannadii/devplat-remediation`
- `@vannadii/devplat-prs`, `@vannadii/devplat-branching`, `@vannadii/devplat-supervisor`

## Integration Packages

- `@vannadii/devplat-storage`: the only package allowed to read or write `.devplat/` paths directly
- `@vannadii/devplat-observability`: telemetry event recording, audit records, run metrics, and run summaries
- `@vannadii/devplat-github`: GitHub action request, repository state, pull request state, issue/spec link, and workflow coordination contracts
- `@vannadii/devplat-discord`: thread bindings, approvals, and Discord control handling
- `@vannadii/devplat-sonarcloud`: Sonar bootstrap and quality gate interpretation

## Adapter Package

- `@vannadii/devplat-openclaw`: OpenClaw plugin entrypoint and tool registration surface, kept adapter-only
