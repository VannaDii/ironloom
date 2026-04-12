---
---

Regenerate committed schemas and the OpenClaw manifest when the release
workflow opens or updates the versioning pull request.

This change runs `prepare:generated` immediately after `changeset version` in
the release workflow so the release PR includes the updated generated artifacts
that correspond to the bumped package versions.
