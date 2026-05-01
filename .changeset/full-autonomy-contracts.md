---
'@vannadii/devplat-artifacts': patch
'@vannadii/devplat-config': patch
'@vannadii/devplat-core': patch
'@vannadii/devplat-discord': patch
'@vannadii/devplat-execution': patch
'@vannadii/devplat-gates': patch
'@vannadii/devplat-github': patch
'@vannadii/devplat-openclaw': patch
'@vannadii/devplat-observability': patch
'@vannadii/devplat-policy': patch
'@vannadii/devplat-prs': patch
'@vannadii/devplat-queue': patch
'@vannadii/devplat-remediation': patch
'@vannadii/devplat-review': patch
'@vannadii/devplat-slicing': patch
'@vannadii/devplat-sonarcloud': patch
'@vannadii/devplat-specs': patch
'@vannadii/devplat-storage': patch
'@vannadii/devplat-supervisor': patch
'@vannadii/devplat-worktrees': patch
---

Add the first full-autonomy contract slices for repository-scoped runtime configuration, GitHub API/web/token defaults, `.devplat` storage directories, worktree sync defaults, Docker/Helm deployment defaults, structured runtime config validation issues, codec-first core value objects, classified platform errors, artifact registry and migration metadata, storage layout/index metadata, richer policy decisions, policy lifecycle category/risk/escalation evaluations exposed through OpenClaw tool output, durable lifecycle records, richer spec revision rendering, richer slice dependency graphs and work packets, gate classifications and remediation handoff hooks, command retry/truncation metadata, review/remediation-aware PR projections, review conformance summaries, remediation results, Sonar issue normalization and review-finding projection, supervisor phase routing with blocker-aware route plans, observability audit records and run metrics, real Discord command contracts, real Discord interaction response routing, bound Discord work-item projection, OpenClaw Discord control handling for normalized requests and operator interaction callbacks, live-lab Discord command registration and interaction probing, GitHub REST submission, GitHub repository/PR/spec-link state contracts, Git-backed worktree operations, and fail-closed worktree branch safety metadata.

Repository validation now requires package-local README coverage with real-world Mermaid flow diagrams, and generated schemas/manifests are emitted in Prettier-stable JSON so generation, repo validation, and formatting checks agree.
