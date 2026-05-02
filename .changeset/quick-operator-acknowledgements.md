---
'@vannadii/devplat-discord': patch
---

Send Discord operator interaction acknowledgements before persistence and audit writes so Gateway-delivered slash commands and button clicks can satisfy Discord's prompt response window even when the local state store or telemetry path is slower. The control plane still evaluates policy before rendering the accepted or blocked payload, then persists state, telemetry, and audit records and posts the bound-thread status message after the interaction callback has been acknowledged.
