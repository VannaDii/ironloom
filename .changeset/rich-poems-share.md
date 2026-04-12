---
---

Keep the publish workflows scoped to the repository package surfaces instead of
requesting organization-wide package write access.

This change switches the Docker, Helm, and GitHub Packages release workflows to
the repository `GITHUB_TOKEN` publish path so jobs create or update
repo-associated package artifacts only. It prevents the release automation from
attempting organization-scoped package writes that the installation is not
allowed to perform.
