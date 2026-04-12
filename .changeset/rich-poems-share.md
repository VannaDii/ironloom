---
---

Keep the publish workflows scoped to the repository package surfaces instead of
requesting organization-wide package write access.

This change narrows the GitHub App token used by the Docker, Helm, and GitHub
Packages release workflows to the current repository so publish jobs create or
update repo-linked package artifacts only. It prevents the release automation
from attempting organization-scoped package writes that the installation is not
allowed to perform.
