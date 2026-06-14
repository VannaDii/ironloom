# शुरू करना

यह guide Ironloom runtime को locally start करती है, existing HTTP port verify करती है, और first-run setup gate दिखाती है।

## Requirements

- `rust-toolchain.toml` से Rust toolchain
- Cargo
- `openssl` access वाला shell

## Runtime Start करें

```sh
IRONLOOM_BIND_ADDR=127.0.0.1:8080 \
IRONLOOM_PUBLIC_URL=https://ironloom.dev \
IRONLOOM_STATE_ROOT=/tmp/ironloom/.ironloom \
IRONLOOM_CONFIG_KEY="$(openssl rand -base64 32)" \
IRONLOOM_INSTALLER_TOKEN="$(openssl rand -base64 32)" \
IRONLOOM_DISCORD_TOKEN=local-discord-token \
IRONLOOM_DISCORD_PUBLIC_KEY=local-discord-public-key \
IRONLOOM_GITHUB_TOKEN=local-github-token \
IRONLOOM_SONARCLOUD_TOKEN=local-sonar-token \
IRONLOOM_SONARCLOUD_ORGANIZATION=local-sonar-org \
IRONLOOM_SONARCLOUD_PROJECT_KEY=local-sonar-project \
IRONLOOM_OPENAI_API_KEY=local-openai-key \
cargo run -p ironloom-runtime --bin ironloom -- serve
```

## Health और Readiness Check करें

```sh
curl -fsS http://127.0.0.1:8080/healthz
curl -fsS http://127.0.0.1:8080/readyz
```

`/healthz` बताता है कि HTTP server alive है या नहीं। `/readyz` तब तक `503` return करता है जब तक required runtime configuration environment variables या encrypted local setup से resolve नहीं होती।

## Setup खोलें

`http://127.0.0.1:8080/setup` पर जाएं।

अगर `IRONLOOM_CONFIG_KEY` missing या invalid है, page केवल उसे add करने के instructions दिखाता है। Config key और installer token उपलब्ध होने के बाद, page missing runtime inputs accept करता है और उन्हें `IRONLOOM_STATE_ROOT` के अंतर्गत encrypted रूप में save करता है।
