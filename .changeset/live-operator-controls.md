---
'@vannadii/devplat-discord': patch
'@vannadii/devplat-openclaw': patch
---

Keep live-lab operator controls usable while the private Discord Gateway runtime is still active.

The live lab now runs its Discord interaction probe from the deep-test runtime's before-cleanup hook, after the autonomous OpenClaw cycle has completed and before the container is removed. That keeps the private Discord Gateway worker alive when the callback-shaped operator control message is posted, so manual sandbox-guild button acceptance can exercise the same Gateway-backed response path instead of seeing controls after the listener has already shut down.

A new `operator_hold_ms` workflow/script option keeps that runtime open for a bounded manual-click window after the control payload is visible. The default is now `150000`, so dispatchable live-lab runs keep the private Gateway runtime online for 2.5 minutes unless explicitly overridden. The bootstrap and progress status messages remain noninteractive, while bound control-plane messages continue to preserve contextual Discord button components and report their custom ids for audit review.

The live-lab probe now also persists its bound implementation thread session into the deep-test runtime state directory before posting the actionable Discord controls. Manual sandbox-guild button clicks during the hold window can therefore revalidate against the same storage-backed thread binding used by the private Gateway worker instead of failing closed as unresolved context.

Validation coverage now asserts that the deep-test before-cleanup hook runs before container removal, that the live-lab probe persists the Gateway-bound thread session before exposing controls, that the optional hold executes before runtime cleanup, and that the live-lab documentation describes the manual operator acceptance path.
