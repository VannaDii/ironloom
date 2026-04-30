# GitHub Instructions

## Source of Truth

- GitHub is the system of record for spec pull requests, implementation pull requests, reviews, approvals, and merge history.
- Do not hide lifecycle state in Discord threads, OpenClaw runtime memory, or local-only artifacts.
- Keep issue, brief, spec, slice, PR, and release relationships traceable.

## Pull Request Model

- Spec work and implementation work should stay distinguishable in GitHub history.
- Implementation pull requests must retain links to the governing spec, slice, and operator context.
- Branch names and pull request titles must describe intent, not reuse any registered tool name.
- Pull request titles must use conventional commit format.
- Pull request bodies must use the repository template at `.github/pull_request_template.md` and fill every section with concrete change data.
- Reviews, approvals, rebases, retries, and merges must leave an auditable GitHub trail.

## Review and Merge

- Keep review outcomes aligned with policy decisions, gate results, and remediation status.
- Do not merge privileged or release-impacting changes through undocumented manual steps.
- Preserve merge history that makes lifecycle progress reconstructable after the fact.

## Release Provenance

- Changesets, release pull requests, package publication, Docker publication, Helm publication, and docs publication must be attributable to GitHub state.
- Manual dispatch flows must still point back to the commit, pull request, or release context they publish.
