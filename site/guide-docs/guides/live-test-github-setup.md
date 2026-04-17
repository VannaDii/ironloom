# Live Test GitHub Setup

This walkthrough configures the GitHub side of the live test lab.

## 1. Create a Sandbox Organization

Create or choose a dedicated GitHub organization for live testing. Keep it
separate from production repositories.

Manual checks:

- only organization owners should be allowed to create or delete repositories
- repository visibility changes should stay owner-only
- app installation changes should stay owner-only

## 2. Create the GitHub App

1. Go to the sandbox organization settings.
2. Open `Developer settings`.
3. Create a new GitHub App dedicated to the live lab.
4. Record the app name and slug for operator reference.

## 3. Grant the Required App Permissions

Set these repository permissions on the app:

- `Administration`: `Read and write`
- `Actions`: `Read and write`
- `Checks`: `Read-only`
- `Contents`: `Read and write`
- `Issues`: `Read and write`
- `Metadata`: `Read-only`
- `Pull requests`: `Read and write`
- `Workflows`: `Read and write`

`Workflows: Read and write` is required because the live lab seeds
`.github/workflows/live-dispatch-canary.yml` into the ephemeral public
repositories.

## 4. Install the App on the Sandbox Organization

1. Install the app on the sandbox organization, not on an individual repository.
2. Grant it access to all repositories in that organization.
3. Complete the installation.

The live workflow uses `actions/create-github-app-token@v3` with `client-id`
and the `LIVE_TEST_GITHUB_ORG` repository variable as the `owner` input. When
`repositories` is left empty, the token is scoped to all repositories in that
installation.

## 5. Generate and Store Credentials

1. Generate a private key for the app.
2. Copy the app client ID.
3. Add these to the DevPlat repository:

- variable: `LIVE_TEST_GITHUB_APP_CLIENT_ID`
- variable: `LIVE_TEST_GITHUB_ORG`
- secret: `LIVE_TEST_GITHUB_APP_PRIVATE_KEY`

## 6. Verify the App Can Administer Repositories

Before using the live lab, confirm the app can do all of the following in the
sandbox organization:

1. Create a public repository.
2. Delete that repository.
3. Apply a repository interaction limit.
4. Set Actions permissions to `selected`.
5. Seed a workflow file under `.github/workflows`.
6. Create a branch and pull request.
7. Dispatch a workflow and read back the workflow run.

The live lab depends on all seven operations.

## 7. Keep the Public Repo Blast Radius Small

Public ephemeral repositories cannot be made private enough to prevent reads or
forks while they exist. Reduce risk this way:

- keep all fixture content non-sensitive
- never write org secrets or environment secrets into the public repo
- do not add outside collaborators
- rely on the live-lab runner, not repo workflows, for admin mutations
- let the runner delete repos immediately after success

## 8. Manual Sanity Check

Dispatch `.github/workflows/openclaw-live-lab.yml` after the Discord and Sonar
setup guides are complete. A healthy GitHub setup will show:

- a new `devplat-test-<run_number>-<run_attempt>` repository in the sandbox org
- a closed canary PR inside that repo
- a successful `Live Dispatch Canary` workflow run
- automatic repo deletion at the end unless failed-resource retention was
  enabled
