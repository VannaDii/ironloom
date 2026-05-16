# @vannadii/devplat-execution

## 0.2.0

### Patch Changes

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

- [#58](https://github.com/VannaDii/devplat/pull/58) [`fe4da91`](https://github.com/VannaDii/devplat/commit/fe4da91b778b31a57994f1465913c948476bc96f) Thanks [@VannaDii](https://github.com/VannaDii)! - Send Discord operator interaction acknowledgements before persistence and audit writes so Gateway-delivered slash commands and button clicks can satisfy Discord's prompt response window even when the local state store or telemetry path is slower. Routed lifecycle actions now use Discord's deferred acknowledgement path, then persist state, telemetry, and audit records before posting the compact structured result once into the bound thread. That keeps operator messages readable and avoids duplicating the same button-bearing payload as both an interaction response and thread message. Interaction-originated requests are normalized once, so persisted traces contain one Discord route marker for the action. If Discord rejects the initial deferred acknowledgement, the acknowledgement transport throws, or a route-refusal acknowledgement is rejected, the action fails closed, records an audit event with the acknowledgement failure reason, skips lifecycle state changes, and reports `responsePostError`. If the post-acknowledgement thread status message throws or returns a non-2xx receipt, the control result now preserves the interaction acknowledgement receipt and durable action result while reporting `threadPostError` for operator and live-lab diagnostics. Live-lab runs now keep the private runtime online for 150000 ms by default after posting operator controls so manual Discord interactions have a bounded response window.

  After a routed interaction finishes persistence, Discord now sends a minimal ephemeral completion follow-up for the deferred interaction whether the compact bound-thread post succeeds or fails. This clears the operator's pending interaction state without reposting the full button-bearing payload, reports thread-message failures with `threadPostError`, and surfaces any completion rejection as `completionPostError` for diagnostics.

  The OpenClaw deep-test runtime now also passes `DEVPLAT_WORKTREE_ROOT=devplat-state/worktrees` through the container environment and verifies allocation, sync, and release scenario records against that trimmed configured root. This keeps hermetic OpenClaw validation aligned with the runtime worktree layout used by live operator control flows.

  Live-lab status messages now use the same compact status anchors for failure and success states, label commit SHAs as `Sha`, and render workflow URLs as explicit angle-bracket links while keeping Discord URL previews suppressed. This keeps project-management status messages readable without letting GitHub unfurls dominate the operator channel.

  The live-lab Sonar project-key sanitizer now uses a named regex constant with explicit safe and unsafe character coverage, keeping local test-lab helpers aligned with the repository regex-governance rule.

  The OpenClaw deep-test artifact redaction helper now also uses a named regex constant and covers hyphenated, underscored, and nested secret-key variants so runtime artifact snapshots continue redacting sensitive values consistently.

  The local pre-push gate now runs the same repository lint command used by CI before Sonar and build/doc validation, preventing lint-only CI failures from reaching the remote PR path.

  Shared lifecycle action names now live in `@vannadii/devplat-core`, and GitHub and policy action constants consume that shared vocabulary instead of redefining cross-package action strings. Policy lifecycle action grouping now lives in a dedicated constants module with explicit coverage for sensitive, destructive, publish, merge, command-execution, rebase, autofix, and destructive-cleanup action sets.

  Discord operator commands, control-plane codecs, button renderers, interaction routing, OpenClaw command execution telemetry, pull-request GitHub submissions, gate retry next-actions, and remediation gate retry hints now consume the same shared lifecycle action constants. Package-local gate and remediation next-action constants live in their owning packages with direct unit coverage so shared action vocabulary is no longer redefined across package boundaries.

  Gate remediation hooks now also emit the package-owned remediation-plan next-action constant instead of hard-coding the same string, keeping gate classifications and remediation hook payloads on the same vocabulary source.

  The repository check suite now includes `npm run check:constants`, which parses authored package source and rejects shared lifecycle action literals outside their owning core constants module. Branching, policy, and supervisor routing now use package-local constants for local next-action or category vocabulary and shared core constants where the same lifecycle action value crosses package boundaries.

  The repository check suite now also includes `npm run check:type-assertions`, an AST-based gate that rejects `as`, angle-bracket, and non-null assertions in authored package TypeScript source while allowing non-casting `satisfies` expressions. This turns the documented no-assertions rule into an automated local and CI repository check.

  The repository check suite now also includes `npm run check:regex-governance`, an AST-based gate that requires authored package regular expressions to live in `constants.ts`, use a `PATTERN` suffix, and be referenced by package tests. This turns the regular-expression constant and test-coverage rule into a local and CI repository check.

  The changed-file SonarQube CLI helper now treats unauthenticated local CLI sessions as an explicit skipped local verification state with a `sonar auth login` hint, keeping pre-push usable for agents while CI remains the authoritative Sonar gate.

  The live-lab operator-hold documentation now describes the actual post-controls cleanup window, and the developer guide clarifies that authenticated local Sonar changed-file verification becomes enforced before push.

  The unit-test governance check now also rejects ad hoc `for (const testCase of cases)` loops, requiring the documented `it.each(cases)('$name', ...)` runner so every structured case table reports stable case names through Vitest.

  Live-lab progress routing now uses an explicit phase switch and a named pull-request tool vocabulary for channel selection. The helper coverage exercises spec, audit, project-management, pull-request, and implementation fallback routing so Discord live-lab updates keep landing in the expected test-category channels.

  Command working-directory normalization now lives in `@vannadii/devplat-execution` with package-owned error constants and direct coverage for blank, nested relative, absolute, and repository-escaping cwd inputs. The OpenClaw command tool delegates to that execution-domain helper instead of carrying its own adapter-local cwd validation.

  Storage index entries can now be read and listed through `FileStoreService.readIndex()` and `FileStoreService.listIndex()`, keeping direct `.devplat/indexes` path knowledge inside `@vannadii/devplat-storage`. The OpenClaw adapter now exposes `read_stored_index` and `list_stored_index` tools that delegate to those storage APIs, fail closed on missing or invalid index entries, and cover sorted index listing for lifecycle lookup paths.

  Indexed storage records can now be resolved through `FileStoreService.readIndexedRecord()` and the `read_indexed_record` OpenClaw tool, allowing lifecycle callers to go from active-thread, task, pull-request, branch, or artifact index keys to the owning stored record without chaining direct `.devplat` path reads. The hermetic deep test now exercises that indexed-record lookup after persisting an artifact-indexed lifecycle record.

- Updated dependencies [[`214fd77`](https://github.com/VannaDii/devplat/commit/214fd7718fa0da333f39d45daff02295e98b71a7), [`efccadf`](https://github.com/VannaDii/devplat/commit/efccadfbd840179c8d1088c7674a7ee6252a1fe7), [`fe4da91`](https://github.com/VannaDii/devplat/commit/fe4da91b778b31a57994f1465913c948476bc96f)]:
  - @vannadii/devplat-core@0.2.0
