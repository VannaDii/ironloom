# Review Instructions

## Review Style

- Lead with findings, not praise, summary, or general reassurance.
- Use direct language. Do not soften a real defect into a suggestion.
- If no defects are found, state residual risks and what the review did not prove.

## Blocking Findings

- Every blocking review finding must state what is wrong, the evidence, why it matters, and why the proposed fix direction is correct.
- Prioritize correctness, regressions, policy bypasses, test gaps, schema drift, boundary violations, performance regressions, unsafe automation, release risk, and auditability loss.
- Treat weak tests as a real defect when they hide failure source or fail to prove the intended behavior.

## Completion Expectations

- Reject changes that hide logic in decorators, weaken strictness, skip required artifacts, or move privileged behavior outside policy and observability paths.
- Reject changes that leave lifecycle steps incomplete across GitHub, Discord, OpenClaw, release surfaces, docs, or operator guidance.
- When addressing PR feedback, review each item, research its edge cases, implement the smallest complete fix, run targeted verification, and reply directly on the review thread with a brief concrete note. Do not resolve review threads after replying.
