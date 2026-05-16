---
'@vannadii/devplat-openclaw': patch
---

Adds a headless maintenance runner that dogfoods the continuation tool surface from a JSON plan. The runner calls `continue_lifecycle`, invokes the returned platform tool when caller-supplied input is available, appends artifact signals, and stops at missing input, failed tool responses, or human approval blockers.
