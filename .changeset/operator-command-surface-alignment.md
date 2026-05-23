---
'@vannadii/devplat-core': patch
'@vannadii/devplat-discord': patch
'@vannadii/devplat-supervisor': patch
'@vannadii/devplat-artifacts': patch
---

Expand the Discord operator command contract with project bootstrap and project-management commands, including `/new-project`, `/open-project`, `/project-summary`, `/project-settings`, `/project-settings-history`, `/cancel-project`, `/resume-project`, `/release-project`, `/phase-contract`, `/alternatives`, `/alts`, `/redirect`, `/consider`, `/research`, and `/spec`.

Align shared lifecycle action constants and codec unions across core, Discord, and supervisor packages so command contracts, control requests, and generated schemas stay deterministic and auditable.

Update operator-facing docs for Discord workflows and the operator lifecycle guide to reflect Discord-first bootstrap and the expanded command surface.
