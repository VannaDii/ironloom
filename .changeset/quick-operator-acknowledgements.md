---
'@vannadii/devplat-branching': patch
'@vannadii/devplat-core': patch
'@vannadii/devplat-discord': patch
'@vannadii/devplat-execution': patch
'@vannadii/devplat-gates': patch
'@vannadii/devplat-github': patch
'@vannadii/devplat-openclaw': patch
'@vannadii/devplat-policy': patch
'@vannadii/devplat-prs': patch
'@vannadii/devplat-remediation': patch
'@vannadii/devplat-storage': patch
'@vannadii/devplat-supervisor': patch
---

Send Discord operator interaction acknowledgements before persistence and audit writes so Gateway-delivered slash commands and button clicks can satisfy Discord's prompt response window even when the local state store or telemetry path is slower. Routed lifecycle actions now use Discord's deferred acknowledgement path, then persist state, telemetry, and audit records before posting the compact structured result once into the bound thread. That keeps operator messages readable and avoids duplicating the same button-bearing payload as both an interaction response and thread message. Interaction-originated requests are normalized once, so persisted traces contain one Discord route marker for the action. If Discord rejects the initial deferred acknowledgement, the acknowledgement transport throws, or a route-refusal acknowledgement is rejected, the action fails closed, records an audit event with the acknowledgement failure reason, skips lifecycle state changes, and reports `responsePostError`. If the post-acknowledgement thread status message throws or returns a non-2xx receipt, the control result now preserves the interaction acknowledgement receipt and durable action result while reporting `threadPostError` for operator and live-lab diagnostics. Live-lab runs now keep the private runtime online for 150000 ms by default after posting operator controls so manual Discord interactions have a bounded response window.

After a routed interaction successfully posts its compact result into the bound thread, Discord now sends a minimal ephemeral completion follow-up for the deferred interaction. This clears the operator's pending interaction state without reposting the full button-bearing payload, and any completion rejection is surfaced as `completionPostError` for diagnostics.

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
