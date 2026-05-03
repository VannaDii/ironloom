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

Plain Node live-lab runs now fail fast with a `npm run build:workspace` instruction when a workspace package is missing its compiled `dist/index.js` entrypoint. Source package entrypoints remain available for preflight tests or explicit TypeScript-loader execution, so preflight can still validate package wiring before workspace builds exist.

The deep-test runner now normalizes the container-owned `.devplat` bind-mount permissions from inside the still-running runtime container before host-side cleanup hooks persist extra live-lab session records. This keeps live-lab audit/session writes from failing when container-created `state/` directories are owned by the runtime user on the host mount.

Validation coverage now asserts that the deep-test before-cleanup hook runs before container removal, that the live-lab probe persists the Gateway-bound thread session before exposing controls, that mounted runtime state is made host-writable before cleanup hooks run, that the probe creates and binds a real implementation thread, that the probe routes one returned button component id, that button-route failures fail the lab, that package entrypoint fallback is limited to source-capable execution, that the optional hold executes before runtime cleanup, and that the live-lab documentation describes the manual operator acceptance path.
