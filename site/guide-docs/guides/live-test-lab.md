# Live Test Lab

The live test lab is the network-enabled end-to-end validation lane for the
OpenClaw runtime container. It complements the required hermetic deep test in
CI.

## What It Does

- creates a fresh public sandbox repository named `devplat-test-<run_number>-<run_attempt>`
- hardens that repository immediately after creation
- creates a Discord category with the same name and five run-dedicated channels
- reports lifecycle status and progress into those channels for the duration of
  the run
- waits for SonarQube Cloud to auto-import the repository
- runs the OpenClaw live deep test against the real container with network
  access enabled
- deletes the ephemeral repository and SonarQube Cloud project on success

## Required Lanes

- `OpenClaw Hermetic Deep Test` in `.github/workflows/ci.yml` is the merge
  blocker for all pull requests, including the Changesets version-release pull
  request.
- `.github/workflows/openclaw-live-lab.yml` is `workflow_dispatch` only. It is
  for live infrastructure validation and operator-visible end-to-end runs.

To make the hermetic lane block version releases, configure branch protection on
`main` to require the `OpenClaw Hermetic Deep Test` status check. Do not exempt
the Changesets release pull request.

## Secrets and Variables

Set these in the DevPlat repository before dispatching the live lab:

- variable: `LIVE_TEST_GITHUB_APP_CLIENT_ID`
- variable: `LIVE_TEST_GITHUB_ORG`
- secret: `LIVE_TEST_GITHUB_APP_PRIVATE_KEY`
- secret: `LIVE_TEST_DISCORD_APPLICATION_ID`
- secret: `LIVE_TEST_DISCORD_PUBLIC_KEY`
- secret: `LIVE_TEST_DISCORD_BOT_TOKEN`
- variable: `LIVE_TEST_DISCORD_GUILD_ID`
- secret: `LIVE_TEST_SONAR_TOKEN`
- variable: `LIVE_TEST_SONAR_ORGANIZATION`

The live workflow mints an org-scoped GitHub App installation token with
`actions/create-github-app-token@v3` and `client-id`. Do not replace it with a
PAT.

## Workflow Usage

Run `.github/workflows/openclaw-live-lab.yml` with:

- `ref`: optional git ref to validate
- `max_parallel_repos`: default `6`
- `retain_failed_resources`: default `false`

The workflow writes a report bundle under `$RUNNER_TEMP/openclaw-live-lab` and
uploads it as a workflow artifact.

## Discord Reporting Layout

Each run creates a category named `devplat-test-<run_number>-<run_attempt>` with
these channels:

- `spec`
- `implementation`
- `pull-request`
- `audit`
- `project-management`

Use them this way:

- `project-management`: bootstrap, high-level lifecycle, final status
- `audit`: external preflight, repo creation, eviction, cleanup, failures
- `spec`: research, spec, and slice-planning progress
- `implementation`: execution, storage, telemetry, review, remediation progress
- `pull-request`: branch, PR, workflow-dispatch, and rebase progress

Discord channels are retained after the run for operator inspection. The janitor
workflow removes old categories later.

## Public Repo Safety Model

The live lab intentionally uses public ephemeral repositories so SonarQube Cloud
can auto-import them in this design. This has hard limits:

- the repository is readable while it exists
- it can be forked while it exists
- deleting it does not delete forks

Because of that, fixture content must remain intentionally public and
non-sensitive. The workflow reduces exposure by:

- disabling issues, discussions, projects, and wiki
- applying `collaborators_only` interaction limits
- limiting Actions to GitHub-owned actions only
- requiring SHA pinning for allowed actions
- setting the default `GITHUB_TOKEN` permission to `read`
- disallowing GitHub Actions from approving pull requests
- never adding outside collaborators

## Forced Eviction

The live lab does not queue when the concurrency cap is reached.

- the default cap is `6`
- if a new run starts when `6` live-lab repos already exist, the oldest
  `devplat-test-*` repository is deleted immediately
- that eviction is expected to break any still-running workflow using that repo

This is a deliberate freshness-first policy. If you need to preserve a failed
run for investigation, dispatch a new run only when you can tolerate possible
eviction.

## Cleanup

- success: delete the ephemeral repository, SonarQube Cloud project, and
  container
- failure with `retain_failed_resources=false`: delete them as well
- failure with `retain_failed_resources=true`: keep the repo, project, and
  container for debugging

`.github/workflows/openclaw-live-lab-janitor.yml` deletes stale live-lab repos,
SonarQube Cloud projects, and Discord categories on a schedule.

## Related Guides

- [Live Test GitHub Setup](./live-test-github-setup.md)
- [Live Test Discord Setup](./live-test-discord-setup.md)
- [Live Test Sonar Setup](./live-test-sonar-setup.md)
- [Live Test Cleanup and Concurrency](./live-test-cleanup-and-concurrency.md)
