# Live Test Discord Setup

This walkthrough configures the Discord side of the live test lab.

## 1. Create a Sandbox Guild

Create a dedicated Discord server for live testing. Do not reuse a production
operator guild.

## 2. Create the Discord Application and Bot

1. Open the Discord developer portal.
2. Create a new application for the live lab.
3. Add a bot user to that application.
4. Record the application ID and public key.
5. Reset and record the bot token.

## 3. Enable Installation Scopes

When generating the install URL, include:

- `bot`
- `applications.commands`

## 4. Invite the Bot with the Required Permissions

Grant these runtime permissions:

- `ViewChannel`
- `SendMessages`
- `CreatePublicThreads`
- `CreatePrivateThreads`
- `SendMessagesInThreads`
- `ManageThreads`
- `ReadMessageHistory`

Grant this workflow provisioning permission too:

- `ManageChannels`

`ManageChannels` is required only if you want the workflow to create any missing
shared live-lab channels automatically. It is not part of the DevPlat runtime
contract itself.

## 5. Store the Credentials in GitHub Actions

Add these to the DevPlat repository:

- secret: `LIVE_TEST_DISCORD_APPLICATION_ID`
- secret: `LIVE_TEST_DISCORD_PUBLIC_KEY`
- secret: `LIVE_TEST_DISCORD_BOT_TOKEN`
- variable: `LIVE_TEST_DISCORD_GUILD_ID`

## 6. Verify Manual Provisioning Once

Before using the workflow, verify the bot can:

1. List channels in the sandbox guild.
2. Create a top-level text channel.
3. Post a message into that channel.
4. Delete the test channel.

If any step fails, correct permissions before dispatching the live lab.

## 7. Understand the Workflow-Owned Layout

The live workflow reuses one shared set of top-level channels and creates any
missing channel automatically:

- `spec`
- `implementation`
- `pull-request`
- `audit`
- `project-management`

Those channels are reused on every run. Messages stay in place and are labeled
with the run metadata.

## 8. Expected Runtime Behavior

During a healthy run:

- `project-management` receives the bootstrap and final status messages
- `audit` receives preflight, repo-create, eviction, and cleanup messages
- `spec`, `implementation`, and `pull-request` receive phase-specific updates

If the container never boots, the runner still reports the failure through the
shared live-lab channels.
