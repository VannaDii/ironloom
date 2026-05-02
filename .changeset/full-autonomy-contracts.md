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

Add the first full-autonomy contract slices:

- repository-scoped runtime configuration, GitHub API/web/token defaults, `.devplat` storage directories, worktree sync defaults, and Docker/Helm deployment defaults
- structured runtime config validation issues, codec-first core value objects, classified platform errors, shared ISO timestamp and Git branch codecs, shared artifact type vocabulary, and package-local constants
- artifact registry and migration metadata, storage layout/index metadata, durable lifecycle records, and storage key path-traversal rejection
- richer policy decisions plus lifecycle category/risk/escalation evaluations exposed through OpenClaw tool output
- richer spec revision rendering, slice dependency graphs, PR-sized work packets, gate classifications, remediation handoff hooks, command retry/truncation metadata, review/remediation-aware PR projections, review conformance summaries, and remediation results
- Sonar issue normalization and review-finding projection, supervisor phase routing with blocker-aware route plans, observability audit records, and run metrics
- real Discord command contracts, raw Discord interaction callback normalization, signature-verified Discord interaction webhook handling, real Discord interaction response routing, and bound Discord work-item projection
- OpenClaw Discord control handling for normalized requests and operator interaction callbacks, plus OpenClaw storage, memory, telemetry, Discord lifecycle, GitHub submission, pull-request submission, and supervisor-step tools that honor the whitespace-normalized `DEVPLAT_STORAGE_ROOT`
- hermetic OpenClaw deep-test validation of callback-shaped Discord interactions through loopback response receipts
- live-lab Discord command registration and callback-shaped interaction probing with required callback/thread receipts
- Helm chart values for enabling the private outbound Discord Gateway worker without public webhook ingress
- GitHub REST submission, GitHub repository/PR/spec-link state contracts, Git-backed worktree operations, and fail-closed worktree branch safety metadata

Repository validation now requires package-local README coverage with real-world Mermaid flow diagrams, and generated schemas/manifests are emitted in Prettier-stable JSON so generation, repo validation, and formatting checks agree.
