# Configuration API

Runtime configuration resolves with environment values taking precedence over encrypted setup values.

## Setup Environment

| Variable | Required | Description |
| --- | --- | --- |
| `IRONLOOM_CONFIG_KEY` | Yes | Base64-encoded 32-byte key material. Required before setup inputs are shown. |
| `IRONLOOM_INSTALLER_TOKEN` | Yes | Operator-generated token required to submit setup changes. |
| `IRONLOOM_STATE_ROOT` | Yes | State root for `.ironloom` data and encrypted setup storage. |

## Runtime Environment

| Variable | Required For Readiness | Description |
| --- | --- | --- |
| `IRONLOOM_PUBLIC_URL` | Yes | Public runtime URL. |
| `IRONLOOM_DISCORD_APPLICATION_ID` | Yes | Discord application ID used for server authorization. |
| `IRONLOOM_DISCORD_TOKEN` | Yes | Discord token or secret reference. |
| `IRONLOOM_DISCORD_PUBLIC_KEY` | Yes | Discord public key or secret reference. |
| `IRONLOOM_GITHUB_TOKEN` | Yes | GitHub token or secret reference. |
| `IRONLOOM_SONARCLOUD_TOKEN` | Yes | SonarCloud token or secret reference. |
| `IRONLOOM_SONARCLOUD_ORGANIZATION` | Yes | SonarCloud organization. |
| `IRONLOOM_SONARCLOUD_PROJECT_KEY` | Yes | SonarCloud project key. |
| `IRONLOOM_OPENAI_API_KEY` | One OpenAI method required | OpenAI API key. |
| `IRONLOOM_OPENAI_OAUTH_SESSION` | One OpenAI method required | OpenAI OAuth session reference. |

## Resolution Order

1. Environment variables.
2. Encrypted setup file at `${IRONLOOM_STATE_ROOT}/setup/config.enc.json`.
3. Missing runtime field error.

Empty required values fail closed.
