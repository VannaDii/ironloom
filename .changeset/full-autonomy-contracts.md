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
- artifact validation now enforces the shared supported artifact type vocabulary before generic envelope normalization, while still accepting registry-supported lifecycle artifacts whose payload codecs live in downstream owner packages, and can apply the active repository registry to reject unregistered artifact types, newer-than-registered artifact versions, and stale artifacts whose registry entry requires migration
- artifact envelope codecs and generated schemas now expose the shared supported artifact vocabulary as the allowed artifact-type contract, Discord thread sessions persist the dedicated shared `discord-thread-session` artifact type, and interactive approvals persist approval artifacts instead of Discord-local artifact types
- richer policy decisions plus lifecycle category/risk/escalation evaluations exposed through OpenClaw tool output
- richer spec revision rendering, slice dependency graphs, PR-sized work packets, gate classifications, remediation handoff hooks, command retry/truncation metadata, review/remediation-aware PR projections, review conformance summaries, and remediation results
- Sonar issue normalization and review-finding projection, supervisor phase routing with blocker-aware route plans, observability audit records, and run metrics
- real Discord command contracts, raw Discord interaction callback normalization, signature-verified Discord interaction webhook handling, real Discord interaction response routing, and bound Discord work-item projection
- OpenClaw Discord control handling for normalized requests and operator interaction callbacks, plus OpenClaw storage, memory, telemetry, Discord lifecycle, GitHub submission, pull-request submission, and supervisor-step tools that honor the whitespace-normalized `DEVPLAT_STORAGE_ROOT`
- OpenClaw pull-request submission tools that target the whitespace-normalized configured `GITHUB_OWNER`/`GITHUB_REPO` repository identity instead of the package fallback when those environment values are available
- OpenClaw worktree allocation and dependent rebase tools that honor the whitespace-normalized configured `DEVPLAT_WORKTREE_ROOT`
- Worktree allocation constants centralized in the worktrees package constants module instead of being embedded in logic/service implementation files
- hermetic OpenClaw deep-test validation of callback-shaped Discord interactions through loopback response receipts
- live-lab Discord command registration and callback-shaped interaction probing with required callback/thread receipts
- Helm chart values for enabling the private outbound Discord Gateway worker without public webhook ingress
- GitHub REST submission, GitHub repository/PR/spec-link state contracts, Git-backed worktree operations, and fail-closed worktree branch safety metadata
- GitHub workflow submission decisions now keep non-2xx REST receipts attached while marking the action unsubmitted, so failed GitHub API writes cannot be mistaken for successful lifecycle changes
- Git-backed worktree command failures now preserve the child-process exit code and captured stdout/stderr for more accurate gate and operator diagnostics
- Git-backed worktree sync now blocks unsafe base branches before Git commands run, and OpenClaw Git-backed allocation now requires an explicit validated base branch whenever `applyToDisk` is true
- Active artifact-registry validation now includes the applicable migration id in required-migration failures when the registry contains a direct migration record, giving operators an exact upgrade target
- Artifact registries now expose ordered migration-path lookup, and active artifact validation reports chained migration ids in both the operator-facing error and structured diagnostic when a stale artifact requires multiple recorded migrations before validation
- OpenClaw `validate_artifact` failures now preserve structured validation diagnostics, including migration path metadata, instead of returning only the failure string
- Changed-file coverage validation now waits briefly for the generated LCOV report to materialize after Vitest exits, preventing local pre-push races from failing after successful coverage runs
- CI shared generated, coverage, build, and docs artifacts now use run-stable names with overwrite enabled, and instruction validation rejects any attempt-scoped shared artifact name line so failed-job reruns can reuse successful upstream artifacts from the same workflow run
- Live-lab workspace package entrypoint resolution now distinguishes missing build output from other filesystem access failures, preserving permission and IO diagnostics instead of reporting them as build-required errors
- Deep-test cleanup now skips bind-mount ownership normalization with an audit warning on non-POSIX Node runtimes instead of throwing during module load, and CI artifact instruction validation now checks upload-artifact steps by step metadata so key order or retention-day changes do not create false failures
- Command execution now enforces repository-relative working-directory safety at the service boundary, returns a structured refusal result instead of spawning subprocesses from absolute or repository-escaping paths, and includes package-runner regression coverage for repository-relative cwd execution
- Command execution retry handling now honors the configured retryable exit-code policy instead of retrying every failed subprocess exit
- Memory, research, review, and remediation lifecycle codecs now reject non-ISO durable timestamps and expose the stricter contracts through regenerated package and OpenClaw schemas
- Policy, gates, supervisor, slicing, and OpenClaw plugin-config lifecycle codecs now reject non-ISO durable timestamps, and slice work-packet branch refs now use the shared Git branch codec
- Discord approval, binding, thread-session, control-request, operator-interaction, and callback-option codecs now reject non-ISO durable timestamps without changing the deferred live human-click acceptance boundary
- Sonar bootstrap verification and quality-gate codecs now reject non-ISO evidence timestamps, and GitHub repository snapshots now validate default and protected branch refs with the shared Git branch codec

Repository validation now requires package-local README coverage with real-world Mermaid flow diagrams, and generated schemas/manifests are emitted in Prettier-stable JSON so generation, repo validation, and formatting checks agree.
