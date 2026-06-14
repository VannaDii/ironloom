# Initial Setup

Ironloom accepts setup values from environment variables and from an encrypted local setup file. Environment variables always take precedence.

## Setup Resolution Flow

```mermaid
flowchart TD
  start[Runtime starts] --> key{IRONLOOM_CONFIG_KEY present and valid?}
  key -- No --> keyHelp[Show config key instructions]
  key -- Yes --> token{IRONLOOM_INSTALLER_TOKEN present?}
  token -- No --> tokenHelp[Show installer-token instructions]
  token -- Yes --> env{All required runtime values in environment?}
  env -- Yes --> ready[Runtime is ready]
  env -- No --> saved{Encrypted setup file exists?}
  saved -- Yes --> merge[Merge env values over encrypted setup]
  saved -- No --> form[Show setup form]
  form --> submit[Submit installer token and missing values]
  submit --> encrypt[Encrypt and save setup file]
  encrypt --> merge
  merge --> complete{Required values resolved?}
  complete -- Yes --> ready
  complete -- No --> blocked[Readiness remains blocked]
```

## Required Setup Variables

| Variable | Purpose |
| --- | --- |
| `IRONLOOM_CONFIG_KEY` | Base64-encoded 32-byte key used to encrypt and decrypt the local setup file. |
| `IRONLOOM_INSTALLER_TOKEN` | Operator-generated token required to submit setup changes. |
| `IRONLOOM_STATE_ROOT` | Runtime state directory that contains encrypted setup state and `.ironloom` artifacts. |

Generate the key and installer token with:

```sh
openssl rand -base64 32
```

## Runtime Variables

| Variable | Purpose |
| --- | --- |
| `IRONLOOM_PUBLIC_URL` | Public runtime base URL. |
| `IRONLOOM_DISCORD_TOKEN` | Discord token or secret reference. |
| `IRONLOOM_DISCORD_PUBLIC_KEY` | Discord public key or secret reference. |
| `IRONLOOM_GITHUB_TOKEN` | GitHub token or secret reference. |
| `IRONLOOM_SONARCLOUD_TOKEN` | SonarCloud token or secret reference. |
| `IRONLOOM_SONARCLOUD_ORGANIZATION` | SonarCloud organization. |
| `IRONLOOM_SONARCLOUD_PROJECT_KEY` | SonarCloud project key. |
| `IRONLOOM_OPENAI_API_KEY` | OpenAI API key for API-key authentication. |
| `IRONLOOM_OPENAI_OAUTH_SESSION` | OpenAI OAuth session reference for OAuth authentication. |

Provide either `IRONLOOM_OPENAI_API_KEY` or `IRONLOOM_OPENAI_OAUTH_SESSION`.

## Local Encrypted Setup

When required runtime values are not present in the environment, `/setup` accepts them after the installer token is supplied. Ironloom writes encrypted setup state to:

```text
${IRONLOOM_STATE_ROOT}/setup/config.enc.json
```

The file is encrypted with AES-GCM and written with owner-only permissions on Unix systems.

## Precedence

Configuration resolution is:

1. Environment variable.
2. Encrypted setup file under `IRONLOOM_STATE_ROOT`.
3. Missing configuration error.

This lets Kubernetes and Docker secrets override local state without deleting the encrypted setup file.
