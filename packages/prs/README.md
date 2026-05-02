# @vannadii/devplat-prs

Pull request lifecycle management contracts.

## Responsibility

This package owns pull request records, update submission semantics, merge readiness, and PR-facing projections for the autonomous delivery cycle.

## Real-World Flow

```mermaid
flowchart LR
  Review[Review summary] --> Projection[Review projection]
  Remediation[Remediation summary] --> Projection
  Artifacts[Source artifacts] --> Projection
  Projection --> Body[Rendered PR body]
  Body --> Record[Pull request record]
  Record --> MergeReady[Merge readiness]
  MergeReady --> GitHub[GitHub update or merge request]
  GitHub --> Audit[Persisted PR artifact]
```

## Boundaries

- Keep GitHub API transport in `@vannadii/devplat-github` where possible.
- Use policy before merge or update submission.
- Do not infer Discord thread context here.
- Render review and remediation status into the PR body before GitHub update or merge submission.

- Keep public TypeScript contracts derived from the exported codecs.

## Development

```bash
npm run test --workspace @vannadii/devplat-prs
```
