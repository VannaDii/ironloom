# Runtime HTTP API

Ironloom serves setup, health, and readiness on the existing runtime HTTP port.

## `GET /healthz`

Returns `200 ok` when the HTTP server is alive.

## `GET /readyz`

Returns `200 ok` only when required runtime configuration resolves from environment values or encrypted local setup. Returns `503 setup required` while setup remains incomplete.

## `GET /`

Returns the setup page.

## `GET /setup`

Returns the setup page.

If `IRONLOOM_CONFIG_KEY` is missing or invalid, the page shows key instructions and no setup input fields.

If `IRONLOOM_INSTALLER_TOKEN` is missing, the page shows installer-token instructions.

When setup prerequisites are present, the page renders the config form. Environment-backed fields are locked and secret values are not displayed.

## `POST /setup`

Accepts setup form values after the submitted installer token matches `IRONLOOM_INSTALLER_TOKEN`.

Successful submissions write encrypted setup configuration under `IRONLOOM_STATE_ROOT` and return `200 setup saved`.

Invalid installer tokens return `403 setup rejected`.

## `POST /setup/openai/oauth/start`

Returns the OpenAI OAuth setup instructions used by the config page. The resulting OAuth session reference can be saved through the setup form or bound through `IRONLOOM_OPENAI_OAUTH_SESSION`.

## `POST /setup/discord/oauth/start`

Returns a Discord authorization page for the configured application ID. The generated URL uses the `bot` and `applications.commands` scopes so a Discord server administrator can install Ironloom into the target server.
