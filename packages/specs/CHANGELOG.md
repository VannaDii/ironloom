# @vannadii/devplat-specs

## 0.2.0

### Patch Changes

- [#60](https://github.com/VannaDii/devplat/pull/60) [`214fd77`](https://github.com/VannaDii/devplat/commit/214fd7718fa0da333f39d45daff02295e98b71a7) Thanks [@VannaDii](https://github.com/VannaDii)! - Project dependent-branch rebase conflicts back into the executed rebase plan.
  Deepen OpenClaw worktree delegation with explicit Git-backed worktree tool
  execution.
  Record OpenClaw gate execution telemetry with actor, classification, and
  next-action details.

  Dependent rebase execution already delegated branch refresh work to
  `@vannadii/devplat-worktrees` and returned the raw sync results. It now also
  derives the returned plan's `conflictClassification` from sync results that
  report `conflictsDetected`, so downstream OpenClaw tool output and operator
  surfaces receive the concrete affected branches and `resolve-conflicts` next
  action without reinterpreting raw worktree records.

  OpenClaw worktree lifecycle tools now accept explicit `applyToDisk` input. Pure
  record projection remains the default, while `applyToDisk: true` delegates
  allocation, sync, and release to the Git-backed worktree service methods.
  The Git-backed sync and release service methods now recompute the expected
  worktree path from the configured root, task id, and branch name, then block
  before Git execution when a caller-provided allocation path points somewhere
  else.

  OpenClaw gate runs now record telemetry through the configured storage root.
  The `run_gates` tool accepts an optional `actorId`, preserves the gate report
  shape, and adds the persisted telemetry event id to its result so downstream
  operators can audit pass/fail classification and next actions.

  OpenClaw Sonar quality-gate evaluations now record telemetry through the same
  storage path. The `evaluate_sonar_quality_gate` tool accepts an optional
  `actorId`, delegates threshold evaluation to the SonarCloud package, and returns
  the persisted telemetry event id with project, coverage, blocking issue, status,
  and next-action details.

  OpenClaw worktree tool `baseBranch` inputs now use the shared Git branch codec
  instead of raw strings. Generated schemas also carry the shared Git branch
  pattern so adapter decoding and external tool contracts reject flag-like,
  whitespace-containing, or otherwise invalid branch refs before any Git-backed
  worktree operation runs.

  GitHub workflow submission decisions now include the persisted telemetry event
  id returned from the policy and REST submission boundary. OpenClaw pull request
  update and merge tools continue to delegate to the PR/GitHub packages, but their
  operator-facing output can now point directly at the durable GitHub workflow
  telemetry record for accepted, blocked, dry-run, and rejected submissions.

  Pull request records now decode `branchName` and `baseBranch` through the shared
  Git branch codec and `updatedAt` through the shared ISO timestamp codec.
  Generated PR and OpenClaw PR-tool schemas carry the same branch pattern and
  date-time format, so unsafe refs and malformed timestamps are rejected before PR
  update or merge submission.

  Worktree allocation, sync, and release records now decode `updatedAt` through
  the shared ISO timestamp codec, and sync result `baseBranch` values decode
  through the shared Git branch codec. Generated worktree and embedded OpenClaw
  schemas now expose the stricter date-time contract for persisted allocation
  input while blocked worktree records can still preserve unsafe operator branch
  input for auditability.

  Queue task records now decode `updatedAt` and transition `occurredAt` values
  through the shared ISO timestamp codec. Generated queue and OpenClaw task tool
  schemas now expose date-time formats for durable lifecycle records and
  transition-event history.

  Telemetry events, audit records, and run summaries now decode event, audit, and
  run boundary timestamps through the shared ISO timestamp codec. Generated
  observability and OpenClaw telemetry-record schemas now expose date-time formats
  for persisted telemetry and audit surfaces.

  Runtime config now decodes repository default branches and worktree base
  branches through the shared Git branch codec, repository keys through the shared
  repository key codec, and config `updatedAt` through the shared ISO timestamp
  codec. The schema generator now supports the shared repository-key codec through
  a tested core-owned JSON Schema pattern.

  Specification records and revision metadata now decode `updatedAt` through the
  shared ISO timestamp codec. Generated spec and OpenClaw spec tool schemas now
  expose date-time formats for durable spec history.

- [#55](https://github.com/VannaDii/devplat/pull/55) [`efccadf`](https://github.com/VannaDii/devplat/commit/efccadfbd840179c8d1088c7674a7ee6252a1fe7) Thanks [@VannaDii](https://github.com/VannaDii)! - Add the first full-autonomy contract slices:
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
  - OpenClaw command execution now reuses the execution-owned option codec so tool callers can pass `maxOutputBytes` and `retry.attempts`, with the delegated request snapshot and telemetry preserving truncation and retry policy evidence
  - OpenClaw command execution now exposes and delegates `retry.retryableExitCodes`, letting callers retry non-default subprocess exit codes while preserving the normalized retry policy in telemetry and results
  - OpenClaw command execution results now return the persisted telemetry event id for policy-allowed and policy-blocked execution paths so callers can audit the stored command lifecycle evidence directly
  - Memory, research, review, and remediation lifecycle codecs now reject non-ISO durable timestamps and expose the stricter contracts through regenerated package and OpenClaw schemas
  - Policy, gates, supervisor, slicing, and OpenClaw plugin-config lifecycle codecs now reject non-ISO durable timestamps, and slice work-packet plus pull-request lifecycle branch refs now use the shared Git branch codec
  - Discord approval, binding, thread-session, control-request, operator-interaction, and callback-option codecs now reject non-ISO durable timestamps without changing the deferred live human-click acceptance boundary
  - Sonar bootstrap verification and quality-gate codecs now reject non-ISO evidence timestamps, and GitHub repository and pull-request snapshots now validate default, protected, head, and base branch refs with the shared Git branch codec

  Repository validation now requires package-local README coverage with real-world Mermaid flow diagrams, and generated schemas/manifests are emitted in Prettier-stable JSON so generation, repo validation, and formatting checks agree.

- Updated dependencies [[`04f92aa`](https://github.com/VannaDii/devplat/commit/04f92aa2bd0392813650e2fd8c8ba229d52558bb), [`214fd77`](https://github.com/VannaDii/devplat/commit/214fd7718fa0da333f39d45daff02295e98b71a7), [`efccadf`](https://github.com/VannaDii/devplat/commit/efccadfbd840179c8d1088c7674a7ee6252a1fe7), [`fe4da91`](https://github.com/VannaDii/devplat/commit/fe4da91b778b31a57994f1465913c948476bc96f)]:
  - @vannadii/devplat-artifacts@0.2.0
  - @vannadii/devplat-core@0.2.0

## 0.1.0

### Minor Changes

- [#12](https://github.com/VannaDii/devplat/pull/12) [`da1e426`](https://github.com/VannaDii/devplat/commit/da1e4269cdfa9cf2f18eaf39e93f5d721ccd46a0) Thanks [@VannaDii](https://github.com/VannaDii)! - Expand the operator and adapter surface for thread-aware platform control.

  This change adds explicit spec revision updates, worktree sync and release flows,
  pull request merge submission semantics, broader Discord operator actions, and
  matching OpenClaw tools and schemas. It also tightens pre-commit and Sonar CI
  enforcement and updates the platform and guide documentation to describe the
  current baseline, remaining completion gap, and release workflow.
