---
'@vannadii/devplat-openclaw': minor
'@vannadii/devplat-supervisor': minor
---

Add a headless lifecycle continuation path for agent-driven software-building work.

The supervisor now accepts repository, objective, actor, timestamp, and lifecycle artifact signals, then returns the next concrete platform tool with route ownership, missing artifact types, input requirements, and human approval blockers. OpenClaw exposes the delegated `continue_lifecycle` tool so callers can continue research/spec/slice/task/worktree/gate/remediation/PR/merge loops without Discord thread state.
