# @vannadii/devplat-remediation

Remediation planning contracts.

## Responsibility

This package owns remediation plans from review findings, including autofix eligibility, unresolved issue summaries, and next-step recommendations.

## Real-World Flow

```mermaid
flowchart LR
  Findings[Review and Sonar findings] --> Plan[Remediation plan]
  Plan --> Approval[Approval requirement]
  Approval --> Fix[Apply or request fix]
  Fix --> Result[Remediation result artifact]
  Result --> Gates[Retry gates]
```

## Boundaries

- Consume review and Sonar findings as inputs.
- Do not execute fixes directly.
- Keep remediation outputs artifact-ready and auditable.

## Development

```bash
npm run test --workspace @vannadii/devplat-remediation
```
