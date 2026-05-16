# @vannadii/devplat-openclaw

## 0.2.0

### Minor Changes

- [#71](https://github.com/VannaDii/devplat/pull/71) [`9f89d64`](https://github.com/VannaDii/devplat/commit/9f89d649c9d2f3b948fd64529a29661f2fa4f6ca) Thanks [@VannaDii](https://github.com/VannaDii)! - Add a headless lifecycle continuation path for agent-driven software-building work.

  The supervisor now accepts repository, objective, actor, timestamp, and lifecycle artifact signals, then returns the next concrete platform tool with route ownership, missing artifact types, input requirements, and human approval blockers. OpenClaw exposes the delegated `continue_lifecycle` tool so callers can continue research/spec/slice/task/worktree/gate/remediation/PR/merge loops without Discord thread state.

### Patch Changes

- [#63](https://github.com/VannaDii/devplat/pull/63) [`04f92aa`](https://github.com/VannaDii/devplat/commit/04f92aa2bd0392813650e2fd8c8ba229d52558bb) Thanks [@VannaDii](https://github.com/VannaDii)! - Deepen artifact validation by allowing callers to provide delegated payload
  validators for registry-supported artifact envelopes whose payload contracts are
  owned by downstream packages.

  The artifacts package still owns envelope, registry, migration, and local
  approval/audit/merge/rebase payload validation. It now also accepts an optional
  payload-validator map and fails closed with a structured
  `artifact.payload_invalid` diagnostic when a delegated package validator rejects
  an envelope payload. Successful delegated validation appends an
  `artifact-payload:<type>` trace entry before generic envelope normalization, so
  operators can see that both the envelope and embedded payload contract were
  checked.

  The OpenClaw artifact-validation tool now supplies delegated validators for
  research briefs, spec records, slice plans, task records, gate reports, review
  findings, remediation plans, pull request records, telemetry events, worktree
  allocations, and Discord thread sessions. Generic lifecycle envelopes therefore
  no longer pass OpenClaw validation solely because the outer envelope is shaped
  correctly; their embedded payload must also satisfy the owning package codec.
  OpenClaw tool responses now also project object-shaped delegated results into
  an `operationalResult` summary when lifecycle evidence is present. The summary
  surfaces normalized status, artifact id, persisted record key, policy decision
  id, telemetry event id, and next-action hints without replacing the
  package-owned payload, giving agent loops a consistent handoff shape across
  artifact, storage, policy, telemetry, and gate tools.

  Discord Gateway button routing now resolves persisted thread sessions from the
  component-encoded thread id when Discord reports the interaction channel as the
  parent channel. The resolver still revalidates the encoded thread against the
  stored session and requires the callback channel to match the persisted thread
  or parent channel, so unrelated-channel replays fail closed while live-lab
  manual button clicks can route to the bound thread. Callback channel and
  component thread identifiers are computed once per interaction before scanning
  stored sessions, and OpenClaw artifact validation now constructs its delegated
  validator map once before optional registry hardening is attached.

  Repository governance is also tightened so instruction drift is caught locally
  before review. `check:repo` now includes a package-source JSDoc gate, the unit
  test checker rejects non-canonical `it.each(<name>)` case-table variables, and
  the instruction checker requires the code-change Changesets rule, canonical
  test-table wording, and JSDoc governance documentation to stay aligned across
  the agent, contributor, GitHub, and developer-guide surfaces. The JSDoc gate
  also rejects low-quality placeholder wording such as duplicated service labels,
  `Creates create.`, and codec labels on non-codec helpers so generated comments
  must be made intentional before review.

  The source-local governance checks now run through ESLint instead of duplicate
  repository scripts. A local DevPlat ESLint plugin enforces authored JSDoc,
  structured case tables, regular-expression placement and `PATTERN` naming, and
  static policy boundaries, while the remaining scripts only perform cross-file
  or generated-artifact checks that lint rules cannot express cleanly. The local
  toolchain also bumps to the latest compatible `eslint` and `typescript-eslint`
  versions available for the repository's ESLint 10 and TypeScript 6 baseline.
  The structured case-table lint rule now validates required `inputs`, `mock`,
  and `assert` fields on each element of the canonical `cases` array, including
  tables wrapped in TypeScript `satisfies` expressions, so unrelated object
  literals cannot satisfy the rule. Regex linting also rejects inline regex
  literals and `RegExp` constructors inside `constants.ts` unless they are direct
  `const *_PATTERN` declarations.
  The sibling-test layout rule for non-trivial `logic.ts` and `service.ts` units
  now runs inside the DevPlat ESLint plugin too, so `check:repo` no longer needs a
  separate `check:unit-tests` script for behavior that can be enforced per source
  file.

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

- [#69](https://github.com/VannaDii/devplat/pull/69) [`82e9dcf`](https://github.com/VannaDii/devplat/commit/82e9dcfee7ba7a8529ff4bc5b63369b8d5574243) Thanks [@VannaDii](https://github.com/VannaDii)! - Add supported live Discord UX validation for interaction changes.

  The repository now has a dedicated Discord UX live-lab workflow and script that
  can be required as a stable pull-request status while internally skipping PRs
  that do not touch Discord, OpenClaw, runtime, Helm, manifest, schema, live-lab,
  or workflow paths. Relevant PRs must provide the sandbox Discord application,
  bot token, and guild configuration before the live gate can pass.

  The live UX probe registers the real sandbox guild command contracts, creates a
  short-lived implementation thread under the shared test category, persists a
  realistic Discord thread-session binding, routes slash-command-shaped and
  fetched-button-shaped Gateway interactions through the Discord control plane,
  replays the fetched button through the HTTP interaction webhook path, and then
  fetches the posted Discord messages back through REST to verify operator-visible
  content, allowed mentions, component rows, unique component custom ids, message
  ids, same-thread routing, and the immediate component acknowledgement that real
  Discord button clicks require.

  The existing OpenClaw live lab now shares the Discord live-lab harness for REST
  requests, channel setup, command registration, message receipts, simulated
  interaction transport, thread creation, package entrypoint resolution, and
  Gateway-bound session persistence, keeping the OpenClaw and Discord UX probes
  aligned.

  Discord interaction webhooks now return the documented immediate deferred
  acknowledgement for routed slash commands and message components before durable
  control-plane persistence, thread posting, and follow-up work continue in the
  background. This keeps real Discord button clicks from timing out while
  preserving thread-bound operator audit records.

  The Discord UX live lab also has an explicit `--operator-hold-ms` manual-click
  window. When set, it starts the real private Discord Gateway runtime against the
  same temporary live state root before posting button-bearing messages, keeps that
  worker open for the requested hold duration, and writes
  `discord-ux-gateway-runtime-report.json` with READY, handled interaction,
  response status, thread status, and runtime error diagnostics. This lets
  maintainers validate actual Discord client button clicks against the same
  thread-session binding used by automated route replay. Manual workflow-dispatch
  runs now default that hold window to 150000 ms so the posted controls have a live
  receiver by default; PR-triggered runs keep the zero-hold automated-gate behavior
  unless a caller explicitly opts into a hold window.
  Gateway startup timeout handling disposes the partially opened session before
  rethrowing, and the runtime report is written after the hold window so reported
  clicks reflect the final manual-validation state.

  The OpenClaw live lab also tolerates GitHub's workflow indexing delay after
  creating a fresh sandbox repository, retrying transient workflow dispatch 422s
  long enough for the seeded `workflow_dispatch` canary to become available.

  Operator documentation now includes the exact registered Discord slash-command
  reference plus a Mermaid command flow that shows how OpenClaw tools and Discord
  commands carry a change from research and spec creation through PR acceptance.

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

- [#72](https://github.com/VannaDii/devplat/pull/72) [`f346ed3`](https://github.com/VannaDii/devplat/commit/f346ed3deb3519d7de1ad928bbf5a0338046f46a) Thanks [@VannaDii](https://github.com/VannaDii)! - Adds a headless maintenance runner that dogfoods the continuation tool surface from a JSON plan. The runner calls `continue_lifecycle`, invokes the returned platform tool when caller-supplied input is available, appends artifact signals, validates plan input at the JSON boundary, can write a resumable handoff plan, and stops at missing input, failed tool responses, or human approval blockers.

- [#57](https://github.com/VannaDii/devplat/pull/57) [`92c32f2`](https://github.com/VannaDii/devplat/commit/92c32f22bd48be3858927a38edaed6eb79c14393) Thanks [@VannaDii](https://github.com/VannaDii)! - Keep live-lab operator controls usable while the private Discord Gateway runtime is still active.

  The live lab now runs its Discord interaction probe from the deep-test runtime's before-cleanup hook, after the autonomous OpenClaw cycle has completed and before the container is removed. That keeps the private Discord Gateway worker alive when the callback-shaped operator control message is posted, so manual sandbox-guild button acceptance can exercise the same Gateway-backed response path instead of seeing controls after the listener has already shut down.

  A new `operator_hold_ms` workflow/script option keeps that runtime open for a bounded manual-click window after the control payload is visible. The default is now `150000`, so dispatchable live-lab runs keep the private Gateway runtime online for 2.5 minutes unless explicitly overridden. The bootstrap and progress status messages remain noninteractive, while bound control-plane messages continue to preserve contextual Discord button components and report their custom ids for audit review.

  The live-lab probe now also persists its bound implementation thread session into the deep-test runtime state directory before posting the actionable Discord controls. That session is projected as the dedicated shared `discord-thread-session` artifact type instead of being mislabeled as a spec, slice, or pull request payload. Manual sandbox-guild button clicks during the hold window can therefore revalidate against the same storage-backed thread binding used by the private Gateway worker instead of failing closed as unresolved context.

  The live-lab probe now creates a short-lived implementation thread under the shared `test` category implementation channel before exposing controls. The posted controls, callback channel id, persisted Gateway session, and component custom ids all use that returned thread id so manual clicks exercise a real thread-aware path instead of binding to the parent progress channel.

  The live-lab probe now also routes one returned button `custom_id` as a callback-shaped component interaction after the initial slash-command-shaped probe. That gives automated coverage for the button route, thread revalidation, response receipts, and failure handling before a human performs the manual sandbox-guild click during the hold window.

  Route-refusal messages now include a fenced JSON diagnostic of the received Discord event with sensitive fields redacted. This keeps operator-facing "Action refused" replies useful for troubleshooting broken bindings without exposing interaction tokens in Discord.

  The received-event diagnostic now persists only the callback id, token, channel id, command name, component custom id, and user ids needed for troubleshooting. Rendered route-refusal diagnostics are also truncated before Discord's message content limit with an explicit marker, so malformed or unexpectedly large callback payloads cannot make the failure response fail to post.

  The generated Discord and OpenClaw schemas now model that bounded received-event snapshot explicitly instead of accepting arbitrary diagnostic data from callers.

  Gateway-backed Discord button callbacks now accept a self-consistent thread binding when the Discord callback `channel_id` exactly matches the versioned component `custom_id` thread id, even if the state scan cannot decode a persisted thread-session record. Parent-channel or side-panel callbacks still require a matching stored session, preserving fail-closed behavior for ambiguous delivery surfaces while allowing in-thread controls to return the real action response.

  Deferred Discord interactions now set the ephemeral flag during the initial loading acknowledgement and complete through Discord's follow-up webhook endpoint. Discord treats the first follow-up after a deferred channel-message response as the original interaction response edit, so the client clears the "thinking" state after the bound-thread status post instead of leaving a stuck ephemeral loader.

  Discord component button interactions now use Discord's deferred message-update acknowledgement instead of the deferred channel-message acknowledgement used by slash-command-style interactions. Button clicks therefore acknowledge within the three-second interaction window without creating a separate per-user "thinking" response that has to be completed later, while slash command callbacks still complete through the deferred follow-up path.

  Simulated live-lab interaction acknowledgements now stay loopback-only because callback-shaped probe payloads do not carry real Discord interaction tokens. The bound operator result still posts through the real Discord thread transport with components intact, while human sandbox-guild clicks during the hold window continue to exercise the private Gateway worker's real deferred-response path.

  Simulated live-lab interaction completion receipts now also stay loopback-only for callback-shaped probes, while real human sandbox-guild slash-command-style callbacks complete through the private Gateway worker's deferred follow-up response path during the hold window. Simulated button callbacks now assert deferred-update acknowledgement and bound-thread posting without requiring a completion receipt.

  Plain Node live-lab runs now fail fast with a `npm run build:workspace` instruction when a workspace package is missing its compiled `dist/index.js` entrypoint. Source package entrypoints remain available for preflight tests or explicit TypeScript-loader execution, so preflight can still validate package wiring before workspace builds exist.

  Live-lab workflow dispatch now retries the narrow GitHub 422 response that appears while a newly seeded fixture workflow is still being indexed as dispatchable. Other workflow-dispatch failures still fail fast, while transient "Workflow does not have workflow_dispatch trigger" responses get a bounded retry before the lab reports failure.

  The deep-test runner now normalizes the container-owned `.devplat` bind-mount permissions from inside the still-running runtime container before host-side cleanup hooks persist extra live-lab session records. It changes bind-mount content to the host runner owner with owner-only write permissions, keeping live-lab audit/session writes available without making local state world-writable. If the auxiliary permission normalization fails, the runner records a warning in the report and still runs cleanup so deep-test failures continue to reflect platform contract regressions.

  Validation coverage now asserts that the deep-test before-cleanup hook runs before container removal, that the live-lab probe persists the Gateway-bound thread session before exposing controls, that mounted runtime state is made host-runner-owned before cleanup hooks run, that permission-normalization failures become report warnings instead of skipped cleanup, that simulated acknowledgements do not post audit-channel messages, that the probe creates and binds a real implementation thread, that the probe routes one returned button component id through deferred-update acknowledgement, that button-route failures fail the lab, that package entrypoint fallback is limited to source-capable execution, that the optional hold executes before runtime cleanup, and that the live-lab documentation describes the manual operator acceptance path.

- [#65](https://github.com/VannaDii/devplat/pull/65) [`a580c05`](https://github.com/VannaDii/devplat/commit/a580c053326925a97509923e048726eaec8e650f) Thanks [@VannaDii](https://github.com/VannaDii)! - Add a local Discord action stack runner for debugging operator interactions.

  The new `dev:local-stack` npm script starts the OpenClaw runtime and private
  Discord Gateway sidecar from the local workspace, exposes Node inspector ports
  for both processes, creates a disposable Discord sandbox category/thread, and
  posts a single startup message containing one button for every Discord control
  action. The runner persists the thread binding into the mounted DevPlat state
  before posting controls, keeps the stack online until shutdown, and removes the
  Docker container, locally built image, temporary report directory, and created
  Discord channels when the command exits.

- [#74](https://github.com/VannaDii/devplat/pull/74) [`7056db6`](https://github.com/VannaDii/devplat/commit/7056db6476e100a573d36766153a4e0eea448626) Thanks [@VannaDii](https://github.com/VannaDii)! - Adds local handoff resume support to the headless maintenance runner. Operators
  can now use `--handoff` to read and rewrite
  `.devplat/state/next-maintenance-plan.json`, and `--tool-input <file>` to append
  one validated next-tool input before the bounded continuation loop runs. The
  release also documents the ignored local handoff flow for repeatable
  repository-scoped maintenance and adds `npm run docker:openclaw:latest` for
  running the latest published OpenClaw runtime image with local dashboard access.
  Docker runtime publishing now emits a multi-platform manifest for `linux/amd64`
  and `linux/arm64/v8`. Handoff mode also rejects conflicting `--plan` usage and
  unknown external tool names before the lifecycle loop starts. The runtime image
  build now compiles workspace output on the build platform and installs
  production dependencies in the target-platform stage so arm64 publishing avoids
  running the workspace build under QEMU. The latest-image npm command now
  delegates Docker argument construction to a Node runner so macOS and Linux use
  the same command path without inline shell expansion, with an image override for
  validating published PR images before `latest` moves forward. Local Docker state
  under `.devplat/` is ignored by repo-wide lint and formatting scans. The local
  Docker command publishes the dashboard on host loopback by default while keeping
  the gateway reachable for Docker's container-to-host port forward.

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

- Updated dependencies [[`04f92aa`](https://github.com/VannaDii/devplat/commit/04f92aa2bd0392813650e2fd8c8ba229d52558bb), [`214fd77`](https://github.com/VannaDii/devplat/commit/214fd7718fa0da333f39d45daff02295e98b71a7), [`82e9dcf`](https://github.com/VannaDii/devplat/commit/82e9dcfee7ba7a8529ff4bc5b63369b8d5574243), [`efccadf`](https://github.com/VannaDii/devplat/commit/efccadfbd840179c8d1088c7674a7ee6252a1fe7), [`9f89d64`](https://github.com/VannaDii/devplat/commit/9f89d649c9d2f3b948fd64529a29661f2fa4f6ca), [`92c32f2`](https://github.com/VannaDii/devplat/commit/92c32f22bd48be3858927a38edaed6eb79c14393), [`a580c05`](https://github.com/VannaDii/devplat/commit/a580c053326925a97509923e048726eaec8e650f), [`fe4da91`](https://github.com/VannaDii/devplat/commit/fe4da91b778b31a57994f1465913c948476bc96f)]:
  - @vannadii/devplat-artifacts@0.2.0
  - @vannadii/devplat-discord@0.2.0
  - @vannadii/devplat-config@0.2.0
  - @vannadii/devplat-core@0.2.0
  - @vannadii/devplat-branching@0.2.0
  - @vannadii/devplat-github@0.2.0
  - @vannadii/devplat-observability@0.2.0
  - @vannadii/devplat-prs@0.2.0
  - @vannadii/devplat-queue@0.2.0
  - @vannadii/devplat-specs@0.2.0
  - @vannadii/devplat-worktrees@0.2.0
  - @vannadii/devplat-execution@0.2.0
  - @vannadii/devplat-gates@0.2.0
  - @vannadii/devplat-policy@0.2.0
  - @vannadii/devplat-remediation@0.2.0
  - @vannadii/devplat-review@0.2.0
  - @vannadii/devplat-slicing@0.2.0
  - @vannadii/devplat-sonarcloud@0.2.0
  - @vannadii/devplat-storage@0.2.0
  - @vannadii/devplat-supervisor@0.2.0
  - @vannadii/devplat-research@0.2.0
  - @vannadii/devplat-memory@0.2.0

## 0.1.0

### Minor Changes

- [#14](https://github.com/VannaDii/devplat/pull/14) [`4288cff`](https://github.com/VannaDii/devplat/commit/4288cff50dded6c2e97a9de6ec77b6c9102ad7e4) Thanks [@VannaDii](https://github.com/VannaDii)! - Align the Discord control-plane contracts with explicit v10 runtime
  configuration and thread-scoped operator behavior.

  This change adds Discord v10 connection and install settings to the runtime and
  OpenClaw plugin configuration, expands Discord thread and control contracts to
  stay fully thread-aware, and updates the generated schemas, manifest, and guide
  documentation to match the current operator workflow and CI expectations.

- [#12](https://github.com/VannaDii/devplat/pull/12) [`da1e426`](https://github.com/VannaDii/devplat/commit/da1e4269cdfa9cf2f18eaf39e93f5d721ccd46a0) Thanks [@VannaDii](https://github.com/VannaDii)! - Expand the operator and adapter surface for thread-aware platform control.

  This change adds explicit spec revision updates, worktree sync and release flows,
  pull request merge submission semantics, broader Discord operator actions, and
  matching OpenClaw tools and schemas. It also tightens pre-commit and Sonar CI
  enforcement and updates the platform and guide documentation to describe the
  current baseline, remaining completion gap, and release workflow.

### Patch Changes

- Updated dependencies [[`4288cff`](https://github.com/VannaDii/devplat/commit/4288cff50dded6c2e97a9de6ec77b6c9102ad7e4), [`da1e426`](https://github.com/VannaDii/devplat/commit/da1e4269cdfa9cf2f18eaf39e93f5d721ccd46a0)]:
  - @vannadii/devplat-config@0.1.0
  - @vannadii/devplat-discord@0.1.0
  - @vannadii/devplat-prs@0.1.0
  - @vannadii/devplat-specs@0.1.0
  - @vannadii/devplat-worktrees@0.1.0
  - @vannadii/devplat-branching@0.0.1
  - @vannadii/devplat-supervisor@0.0.1
  - @vannadii/devplat-slicing@0.0.1
