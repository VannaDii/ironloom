---
'@vannadii/devplat-artifacts': patch
'@vannadii/devplat-discord': patch
'@vannadii/devplat-openclaw': patch
---

Deepen artifact validation by allowing callers to provide delegated payload
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
