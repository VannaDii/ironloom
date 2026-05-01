# @vannadii/devplat-sonarcloud

SonarCloud integration and policy interpretation.

## Responsibility

This package owns SonarCloud bootstrap verification, quality gate interpretation, issue normalization, review-finding projection, and coverage threshold decisions.

## Real-World Flow

```mermaid
flowchart LR
  Sonar[SonarCloud response] --> Normalize[Normalize issues]
  Normalize --> Coverage[Coverage thresholds]
  Coverage --> Gate[Quality gate result]
  Normalize --> Review[Review findings]
  Review --> Remediation[Remediation plan]
  Gate --> Remediation[Remediation plan]
```

## Boundaries

- Keep Sonar result mapping deterministic and testable.
- Do not suppress quality gate failures.
- Feed normalized issues into review and remediation packages.
- Project Sonar issues through `@vannadii/devplat-review` rather than inventing a parallel finding shape.

- Keep public TypeScript contracts derived from the exported codecs.

## Development

```bash
npm run test --workspace @vannadii/devplat-sonarcloud
```
