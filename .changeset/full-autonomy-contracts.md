---
'@vannadii/devplat-artifacts': patch
'@vannadii/devplat-config': patch
'@vannadii/devplat-core': patch
'@vannadii/devplat-discord': patch
'@vannadii/devplat-execution': patch
'@vannadii/devplat-gates': patch
'@vannadii/devplat-github': patch
'@vannadii/devplat-openclaw': patch
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

Add the first full-autonomy contract slices for repository-scoped runtime configuration, structured platform errors, artifact registry and migration metadata, storage layout/index metadata, richer policy decisions, durable lifecycle records, gate classifications, command retry/truncation metadata, PR projections, review conformance summaries, remediation results, Sonar issue normalization, supervisor phase routing, real Discord interaction response routing, live-lab Discord interaction probing, GitHub REST submission, and Git-backed worktree operations.

Repository validation now requires package-local README coverage with real-world Mermaid flow diagrams, and generated schemas/manifests are emitted in Prettier-stable JSON so generation, repo validation, and formatting checks agree.
