# Configuration API

Runtime configuration environment values को encrypted setup values पर प्राथमिकता देकर resolve करता है।

## Setup Environment

| Variable | Required | Description |
| --- | --- | --- |
| `IRONLOOM_CONFIG_KEY` | Yes | Base64-encoded 32-byte key material. Setup inputs दिखाने से पहले required. |
| `IRONLOOM_INSTALLER_TOKEN` | Yes | Operator-generated token जो setup changes submit करने के लिए required है। |
| `IRONLOOM_STATE_ROOT` | Yes | `.ironloom` data और encrypted setup storage के लिए state root. |

## Runtime Environment

| Variable | Required For Readiness | Description |
| --- | --- | --- |
| `IRONLOOM_PUBLIC_URL` | Yes | Public runtime URL. |
| `IRONLOOM_DISCORD_TOKEN` | Yes | Discord token या secret reference. |
| `IRONLOOM_DISCORD_PUBLIC_KEY` | Yes | Discord public key या secret reference. |
| `IRONLOOM_GITHUB_TOKEN` | Yes | GitHub token या secret reference. |
| `IRONLOOM_SONARCLOUD_TOKEN` | Yes | SonarCloud token या secret reference. |
| `IRONLOOM_SONARCLOUD_ORGANIZATION` | Yes | SonarCloud organization. |
| `IRONLOOM_SONARCLOUD_PROJECT_KEY` | Yes | SonarCloud project key. |
| `IRONLOOM_OPENAI_API_KEY` | One OpenAI method required | OpenAI API key. |
| `IRONLOOM_OPENAI_OAUTH_SESSION` | One OpenAI method required | OpenAI OAuth session reference. |

## Resolution Order

1. Environment variables.
2. `${IRONLOOM_STATE_ROOT}/setup/config.enc.json` पर encrypted setup file.
3. Missing runtime field error.

खाली required values fail closed करती हैं।
