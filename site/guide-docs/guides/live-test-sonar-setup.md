# Live Test Sonar Setup

This walkthrough configures SonarQube Cloud for the live test lab.

## 1. Bind the Sandbox GitHub Organization

1. Create or select a dedicated SonarQube Cloud organization for the live lab.
2. Import the sandbox GitHub organization that will host the ephemeral public
   repositories.
3. In the import flow, grant access to all repositories in that GitHub
   organization.

Auto-import of new repositories must stay enabled.

## 2. Confirm Auto-Import of New GitHub Repositories

In SonarQube Cloud:

1. Open the organization settings.
2. Go to `Organization binding`.
3. Confirm `Automatically import new GitHub repositories` is enabled.

The live lab waits for the freshly created public repo to appear as a SonarQube
Cloud project.

## 3. Generate a Dedicated Token

Create a dedicated SonarQube Cloud token for the live lab and store it in the
DevPlat repository as:

- secret: `LIVE_TEST_SONAR_TOKEN`
- variable: `LIVE_TEST_SONAR_ORGANIZATION`

## 4. Manual Reachability Check

Before dispatching the live lab, verify the token can authenticate and that the
sandbox organization is reachable.

The live workflow also does a preflight query before it creates or waits on the
ephemeral project.

## 5. Know What the Live Lab Verifies

The live lab verifies:

- SonarQube Cloud token reachability
- sandbox organization reachability
- automatic import of the new ephemeral repo into SonarQube Cloud

It does not move the main CI Sonar scan out of `.github/workflows/ci.yml`.

## 6. Cleanup Behavior

The live lab attempts to delete the ephemeral SonarQube Cloud project after the
run.

- success: delete immediately
- failure with retention disabled: delete immediately
- failure with retention enabled: keep temporarily for debugging

The janitor workflow later removes stale retained projects. If a deletion fails,
clean it up manually from the SonarQube Cloud project administration UI.
