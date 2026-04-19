# Live Test Cleanup and Concurrency

This guide explains how the live lab handles concurrent runs and stale public
resources.

## Concurrency Model

Each live run creates a fresh public sandbox repository. That removes same-repo
branch and workflow collisions, but the lab still enforces a hard concurrency
cap.

Default behavior:

- the cap is `6`
- only repositories named `devplat-test-*` count toward the cap
- if a new run starts when the cap is already reached, the oldest matching
  repository is deleted immediately

There is no queue. Fresh runs win.

## Why the Oldest Repo Is Deleted

The live lab is used to validate the latest container and control-plane changes.
When the cap is saturated, keeping old runs alive is less important than
allowing a new run to start. Deleting the oldest repo may break any workflow
still using it. That behavior is expected.

## Resource Naming

A run with `run_number=123` and `run_attempt=2` uses:

- GitHub repo: `devplat-test-123-2`
- Discord messages labeled with run `123-2` in the shared live-lab channels
- branch: `live-test/123-2`

The shared naming scheme makes repo, Sonar, and report cleanup easier to
correlate, while Discord stays on a stable channel set.

## Cleanup Rules

The live workflow and janitor split cleanup work:

- live workflow:
  - deletes the current run repo and Sonar project on success
  - deletes them on failure unless `retain_failed_resources=true`
  - reuses the shared Discord channels for every run
- janitor workflow:
  - deletes `devplat-test-*` repos older than `24h`
  - deletes matching Sonar projects older than `24h`
  - deletes leftover legacy Discord categories from the older per-run layout once they age past the configured hour window, default `168h`

## Retaining Failed Resources

Use `retain_failed_resources=true` only when you need to inspect:

- the public ephemeral repo
- the imported SonarQube Cloud project
- the container logs and state bundle

Even retained runs are not protected from eviction if newer runs push the live
repo count over the cap.

## Operational Guidance

- prefer dispatching new runs only when older retained failures are no longer
  needed
- do not place sensitive content in the fixture repo or PR body
- use the janitor workflow after debugging if you want to remove retained
  resources immediately
