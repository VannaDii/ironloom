# @vannadii/devplat-artifacts

Versioned artifact contracts for DevPlat.

## Responsibility

This package owns auditable artifact envelopes, the default lifecycle artifact registry, migration records, and known artifact payloads for approvals, audit logs, merge decisions, rebase results, and validation. It is the contract layer for handoffs between planning, execution, review, remediation, Discord, OpenClaw, and GitHub-facing flows.

## Real-World Flow

```mermaid
flowchart LR
  Lifecycle[Lifecycle service] --> Envelope[Artifact envelope]
  Envelope --> Version[Schema version and migration metadata]
  Version --> Registry[Artifact registry]
  Registry --> Lifecycle[Research spec slice task review records]
  Lifecycle --> Migration[Explicit migration record]
  Migration --> Payload[Approval audit merge rebase validation payload]
  Payload --> Storage[Storage persistence]
  Storage --> Operator[Discord and OpenClaw status]
```

## Boundaries

- Keep artifact shape, version, migration metadata, and validation here.
- Keep the registry as the machine-readable source for artifact type ownership, current versions, storage scopes, and migration policy.
- Do not put workflow orchestration or external API calls in this package.
- Keep public contracts aligned with codecs, generated schemas, docs, and tests.
- Keep public TypeScript contracts derived from the exported codecs.

## Development

```bash
npm run test --workspace @vannadii/devplat-artifacts
```
