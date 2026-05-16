---
'@vannadii/devplat-openclaw': patch
---

Adds local handoff resume support to the headless maintenance runner. Operators
can now use `--handoff` to read and rewrite
`.devplat/state/next-maintenance-plan.json`, and `--tool-input <file>` to append
one validated next-tool input before the bounded continuation loop runs. The
release also documents the ignored local handoff flow for repeatable
repository-scoped maintenance.
