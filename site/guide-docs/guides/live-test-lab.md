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
- requires the initial project-management bootstrap status message to post
  successfully before any sandbox repository mutation
- registers Discord command contracts, normalizes a Discord callback-shaped
  slash command payload, records a local simulated deferred acknowledgement,
  posts the bound-thread status through the same response transport used by the
  runtime, completes the deferred interaction, and routes one simulated button
  callback through the same bound thread; the run fails if the interaction
  resolves to the wrong thread or does not record callback, thread message,
  deferred-completion, and actionable component id receipts
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
- `operator_hold_ms`: default `150000`; set to another non-negative millisecond
  value when a human operator needs a different manual-click window while the
  private Gateway worker is still alive
- `retain_failed_resources`: default `false`

The workflow writes a report bundle under `$RUNNER_TEMP/openclaw-live-lab` and
uploads it as a workflow artifact.

The workflow builds the workspace before running the live lab so the networked
runner can load the same package services that production uses for Discord
interaction routing. Plain Node live-lab runs require those compiled
`dist/index.js` package entrypoints; if they are missing, the runner fails fast
with a `npm run build:workspace` instruction instead of attempting to import
TypeScript source files without a loader.

The live-lab runner passes the repository-scoped runtime environment into the
OpenClaw container as named Docker environment variables. Secret values are not
included in Docker arguments or report artifacts; `runtime-env.json` records only
the redacted runtime snapshot for audit review.
Live-mode containers also set `DISCORD_GATEWAY_ENABLED=true` and
`DEVPLAT_STORAGE_ROOT=/app/.devplat`, so the private outbound Discord Gateway
worker starts beside the OpenClaw gateway and resolves button or slash-command
clicks against the same persisted thread-session state written by platform
tools.
Before host-side cleanup hooks write additional live-lab session records into
that mounted store, the deep-test runner asks the still-running container to
make `/app/.devplat` content owned and writable by the host runner only. That
avoids container UID ownership causing permission failures during the
manual-operator hold window without making local state world-writable. If this
auxiliary normalization fails, the report records a warning and cleanup still
runs.

The matching local invocation is:

```sh
npm run build:workspace
npm run test:openclaw:live-lab:local -- --ref main
```

The local command uses `.env` and the same GitHub App bootstrap path as the
workflow. Build first so the Discord interaction probe can load the package
services from `dist`. Source package entrypoints are only used by preflight
tests or explicit TypeScript-loader execution.

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
Status messages use the compact DevPlat state/scope/item format, render
workflow URLs as compact links, and suppress raw GitHub previews. They do not
include interactive components because the live-lab runner is intentionally
ephemeral and project-management updates are not bound lifecycle threads. The
uploaded `live-lab-report.json` records each selected channel id and `parentId`
so operators can confirm the run used the channels under the `test` category,
not uncategorized duplicates with the same
names.
The first bootstrap message in `project-management` is not best effort: if it
cannot be posted, the live lab fails before listing, creating, or deleting any
sandbox repository. Later progress and failure notifications remain
best-effort so the report can still be written when Discord has a transient
error after the required operator-visible start signal. The report records the
bootstrap channel id, message id, posted content, and empty component id list so
operators can audit the exact Discord message that started the run without
leaving buttons that outlive the runner.

Production operator channels use the same standard channel names from runtime
configuration under a category named for the repository. OpenClaw test and
live-lab traffic always uses the `test` category so validation chatter stays
separated from normal operations.

The live lab also registers the exported Discord operator command contracts into
the sandbox guild. After registration, it runs a Discord interaction probe. The
probe simulates the operator `/retry-gates` path, routes it through the Discord
control-plane service, renders the compact operator message payload with
contextual buttons, records a local simulated deferred acknowledgement, posts the
bound-thread status into a short-lived implementation thread created under the
standard `implementation` channel with those contextual buttons intact, records a
minimal simulated deferred-completion receipt, then routes one returned button
`custom_id` as a second callback-shaped interaction. It records the command
registration, response receipt endpoints, Discord message ids, posted content,
component custom ids, completion receipts, and button callback receipts in
`live-lab-report.json`. The probe runs before the deep-test runtime is cleaned up
so the private Gateway worker is still alive when the control message is posted.
It also writes the same bound implementation thread session into the deep-test
runtime state directory before posting the button-bearing message, allowing
manual clicks during the hold window to revalidate against the same persisted
binding and thread id used by the private Gateway worker. The runner normalizes
the mounted state directory immediately before that host-side write, so
container-created state remains auditable and writable by the
workflow process while retaining owner-only permissions. If the normalization
step fails, `live-lab-report.json` includes a warning and the cleanup hook still
runs.
The `operator_hold_ms` input keeps that runtime open for 150000 ms by default
after the control message is visible, giving an operator a bounded manual-click
window. The probe fails if the thread control-plane response loses the button
rows, so the live-lab lane cannot silently regress to plain log-style messages.
Only unbound bootstrap/progress status messages stay noninteractive to avoid
stale clickable buttons after cleanup.

Discord does not provide a supported bot API for clicking buttons as a human
operator. The automated live lab therefore validates the production registration,
normalization, routing, thread posting, and structured-message path with a
callback-shaped payload. Simulated acknowledgements remain local receipts because
there is no real Discord interaction token to acknowledge; human-triggered
slash/button clicks in the sandbox guild use the private Gateway worker and real
Discord deferred-response and completion-follow-up path during the hold window.

The Discord package also exposes a private outbound Gateway runtime for
production mounts. That runtime identifies with Discord Gateway, heartbeats,
receives `INTERACTION_CREATE` dispatches without public ingress, resolves
stored thread-session bindings from the configured state directory, delegates
the normalized operator interaction into the same control-plane service used by
the live-lab probe, and posts structured operator payloads with safe mentions
and contextual buttons. A signature-verified webhook helper remains available
for explicit inbound deployments, but it is not the default private runtime
path.

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
