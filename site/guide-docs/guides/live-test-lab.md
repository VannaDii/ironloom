# Live Test Lab

The live test lab is the network-enabled end-to-end validation lane for the
OpenClaw runtime container. It complements the required hermetic deep test in
CI.

## What It Does

- creates a fresh public sandbox repository named `devplat-test-<run_number>-<run_attempt>`
- hardens that repository immediately after creation
- reuses one shared set of five live-lab Discord channels under the `test`
  category
- reports lifecycle status and progress into those shared channels for the
  duration of the run
- registers Discord command contracts, normalizes a Discord callback-shaped
  slash command payload, and posts the interaction acknowledgement plus
  bound-thread status through the same response transport used by the runtime;
  the run fails if the interaction resolves to the wrong thread or does not
  record both callback and thread message receipts with actionable component ids
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

The live-lab scripts mint the GitHub App installation token directly from these
inputs. Use the same values in local `.env` runs, and do not replace the app
credentials with a PAT. Store `LIVE_TEST_GITHUB_APP_PRIVATE_KEY` as a single
quoted value with literal `\n` escapes between PEM lines; the scripts normalize
those escapes before minting the JWT for local `--env-file=.env` runs.

If `LIVE_TEST_GITHUB_ORG` names a personal user account instead of an
organization, also set `LIVE_TEST_GITHUB_TOKEN`. The live lab creates the
ephemeral repository through `POST /user/repos`, which requires a user token
rather than a GitHub App installation token.

## Workflow Usage

Run `.github/workflows/openclaw-live-lab.yml` with:

- `ref`: optional git ref to validate
- `max_parallel_repos`: default `6`
- `retain_failed_resources`: default `false`

The workflow writes a report bundle under `$RUNNER_TEMP/openclaw-live-lab` and
uploads it as a workflow artifact.

The workflow builds the workspace before running the live lab so the networked
runner can load the same package services that production uses for Discord
interaction routing.

The live-lab runner passes the repository-scoped runtime environment into the
OpenClaw container as named Docker environment variables. Secret values are not
included in Docker arguments or report artifacts; `runtime-env.json` records only
the redacted runtime snapshot for audit review.

The matching local invocation is:

```sh
npm run build:workspace
npm run test:openclaw:live-lab:local -- --ref main
```

The local command uses `.env` and the same GitHub App bootstrap path as the
workflow. Build first so the Discord interaction probe can load the package
services from `dist`.

## Discord Reporting Layout

The live lab reuses these shared channels under the `test` Discord category:

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

Every message is labeled with the run metadata, so operators can correlate
activity without per-run channel trees.
Status messages use the compact DevPlat state/scope/item format and suppress
raw GitHub URL previews. The uploaded `live-lab-report.json` records each
selected channel id and `parentId` so operators can confirm the run used the
channels under the `test` category, not uncategorized duplicates with the same
names.

Production operator channels use the same standard channel names from runtime
configuration under a category named for the repository. OpenClaw test and
live-lab traffic always uses the `test` category so validation chatter stays
separated from normal operations.

The live lab also registers the exported Discord operator command contracts into
the sandbox guild. After registration, it runs a Discord interaction probe. The
probe simulates the operator `/retry-gates` path, routes it through the Discord
control-plane service, renders the compact operator message payload with
contextual buttons, posts the interaction acknowledgement into the audit
channel, posts the bound-thread status into the implementation channel, and
records the command registration, response receipt endpoints, Discord message
ids, posted content, and component custom ids in `live-lab-report.json`. The
probe fails if either response loses the structured button rows, so the live-lab
lane cannot silently regress to plain log-style messages.

Discord does not provide a supported bot API for clicking buttons as a human
operator. The automated live lab therefore validates the production registration,
normalization, routing, transport, and structured-message path with a
callback-shaped payload. Human-triggered slash/button clicks in the sandbox guild
remain a manual operator acceptance check.

The Discord package also exposes a signature-verified interaction webhook
service for production mounts. That service validates the Discord Ed25519
signature headers, responds to Discord ping requests, decodes callback-shaped
slash/button payloads through the package codecs, resolves live binding metadata
through the supplied resolver, and delegates the normalized operator interaction
into the same control-plane service used by the live-lab probe.

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
SonarQube Cloud projects, and any leftover legacy Discord categories from the
older per-run layout on a schedule.

## Related Guides

- [Live Test GitHub Setup](./live-test-github-setup.md)
- [Live Test Discord Setup](./live-test-discord-setup.md)
- [Live Test Sonar Setup](./live-test-sonar-setup.md)
- [Live Test Cleanup and Concurrency](./live-test-cleanup-and-concurrency.md)
