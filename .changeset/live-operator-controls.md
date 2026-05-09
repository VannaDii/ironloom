---
'@vannadii/devplat-discord': patch
'@vannadii/devplat-openclaw': patch
---

Keep live-lab operator controls usable while the private Discord Gateway runtime is still active.

The live lab now runs its Discord interaction probe from the deep-test runtime's before-cleanup hook, after the autonomous OpenClaw cycle has completed and before the container is removed. That keeps the private Discord Gateway worker alive when the callback-shaped operator control message is posted, so manual sandbox-guild button acceptance can exercise the same Gateway-backed response path instead of seeing controls after the listener has already shut down.

A new `operator_hold_ms` workflow/script option keeps that runtime open for a bounded manual-click window after the control payload is visible. The default is now `150000`, so dispatchable live-lab runs keep the private Gateway runtime online for 2.5 minutes unless explicitly overridden. The bootstrap and progress status messages remain noninteractive, while bound control-plane messages continue to preserve contextual Discord button components and report their custom ids for audit review.

The live-lab probe now also persists its bound implementation thread session into the deep-test runtime state directory before posting the actionable Discord controls. That session is projected as the dedicated shared `discord-thread-session` artifact type instead of being mislabeled as a spec, slice, or pull request payload. Manual sandbox-guild button clicks during the hold window can therefore revalidate against the same storage-backed thread binding used by the private Gateway worker instead of failing closed as unresolved context.

The live-lab probe now creates a short-lived implementation thread under the shared `test` category implementation channel before exposing controls. The posted controls, callback channel id, persisted Gateway session, and component custom ids all use that returned thread id so manual clicks exercise a real thread-aware path instead of binding to the parent progress channel.

The live-lab probe now also routes one returned button `custom_id` as a callback-shaped component interaction after the initial slash-command-shaped probe. That gives automated coverage for the button route, thread revalidation, response receipts, and failure handling before a human performs the manual sandbox-guild click during the hold window.

Route-refusal messages now include a fenced JSON diagnostic of the received Discord event with sensitive fields redacted. This keeps operator-facing "Action refused" replies useful for troubleshooting broken bindings without exposing interaction tokens in Discord.

Gateway-backed Discord button callbacks now accept a self-consistent thread binding when the Discord callback `channel_id` exactly matches the versioned component `custom_id` thread id, even if the state scan cannot decode a persisted thread-session record. Parent-channel or side-panel callbacks still require a matching stored session, preserving fail-closed behavior for ambiguous delivery surfaces while allowing in-thread controls to return the real action response.

Deferred Discord interactions now set the ephemeral flag during the initial loading acknowledgement and complete through Discord's follow-up webhook endpoint. Discord treats the first follow-up after a deferred channel-message response as the original interaction response edit, so the client clears the "thinking" state after the bound-thread status post instead of leaving a stuck ephemeral loader.

Discord component button interactions now use Discord's deferred message-update acknowledgement instead of the deferred channel-message acknowledgement used by slash-command-style interactions. Button clicks therefore acknowledge within the three-second interaction window without creating a separate per-user "thinking" response that has to be completed later, while slash command callbacks still complete through the deferred follow-up path.

Simulated live-lab interaction acknowledgements now stay loopback-only because callback-shaped probe payloads do not carry real Discord interaction tokens. The bound operator result still posts through the real Discord thread transport with components intact, while human sandbox-guild clicks during the hold window continue to exercise the private Gateway worker's real deferred-response path.

Simulated live-lab interaction completion receipts now also stay loopback-only for callback-shaped probes, while real human sandbox-guild slash-command-style callbacks complete through the private Gateway worker's deferred follow-up response path during the hold window. Simulated button callbacks now assert deferred-update acknowledgement and bound-thread posting without requiring a completion receipt.

Plain Node live-lab runs now fail fast with a `npm run build:workspace` instruction when a workspace package is missing its compiled `dist/index.js` entrypoint. Source package entrypoints remain available for preflight tests or explicit TypeScript-loader execution, so preflight can still validate package wiring before workspace builds exist.

Live-lab workflow dispatch now retries the narrow GitHub 422 response that appears while a newly seeded fixture workflow is still being indexed as dispatchable. Other workflow-dispatch failures still fail fast, while transient "Workflow does not have workflow_dispatch trigger" responses get a bounded retry before the lab reports failure.

The deep-test runner now normalizes the container-owned `.devplat` bind-mount permissions from inside the still-running runtime container before host-side cleanup hooks persist extra live-lab session records. It changes bind-mount content to the host runner owner with owner-only write permissions, keeping live-lab audit/session writes available without making local state world-writable. If the auxiliary permission normalization fails, the runner records a warning in the report and still runs cleanup so deep-test failures continue to reflect platform contract regressions.

Validation coverage now asserts that the deep-test before-cleanup hook runs before container removal, that the live-lab probe persists the Gateway-bound thread session before exposing controls, that mounted runtime state is made host-runner-owned before cleanup hooks run, that permission-normalization failures become report warnings instead of skipped cleanup, that simulated acknowledgements do not post audit-channel messages, that the probe creates and binds a real implementation thread, that the probe routes one returned button component id through deferred-update acknowledgement, that button-route failures fail the lab, that package entrypoint fallback is limited to source-capable execution, that the optional hold executes before runtime cleanup, and that the live-lab documentation describes the manual operator acceptance path.
