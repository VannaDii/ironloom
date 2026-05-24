---
'@vannadii/devplat-discord': patch
---

Improve Discord control-plane context safety and operator status visibility for lifecycle commands.

- Add explicit project/thread context mismatch diagnostics with a recovery hint that points operators to `/open-project --repo ... --project ... --intent ...`.
- Enforce immutable `/open-project` intent per thread run context and fail closed on conflicting intent changes, with durable audit evidence.
- Persist and hydrate thread-scoped project metadata for operator-facing status responses:
  - run intent from immutable open-project state
  - project config version from project-settings updates
- Surface hydrated metadata consistently in accepted and blocked `show-status` / `project-summary` responses.
- Add `show-last-artifact` interpretation context and metadata so operators receive a one-line “why this matters now” message tied to current run state.
