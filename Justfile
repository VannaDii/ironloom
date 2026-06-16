set shell := ["bash", "-euo", "pipefail", "-c"]

image := env_var_or_default("IRONLOOM_IMAGE", "ironloom:local")
container := env_var_or_default("IRONLOOM_CONTAINER", "ironloom-local")
http_port := env_var_or_default("IRONLOOM_HTTP_PORT", "8080")
local_state := env_var_or_default("IRONLOOM_LOCAL_STATE", ".ironloom/local-dev")
setup_env := local_state + "/setup.env"
github_repository := env_var_or_default("IRONLOOM_GITHUB_REPOSITORY", "VannaDii/ironloom")

default:
    @just --list

fmt:
    cargo fmt --check

clippy:
    cargo clippy --workspace --all-targets --all-features -- -D warnings

test:
    cargo test --workspace --all-features

schemas:
    cargo run -p ironloom-schemas -- --check

docs:
    npm run docs:build

helm:
    helm lint deploy/helm/ironloom
    helm template ironloom deploy/helm/ironloom >/dev/null

deny:
    cargo deny check

audit:
    cargo audit

security: deny audit

gates: fmt clippy test schemas docs helm security

ensure-local-env:
    @mkdir -p "{{local_state}}"
    @chmod 700 "{{local_state}}"
    @if [ ! -f "{{setup_env}}" ]; then \
      umask 077; \
      { \
        printf 'IRONLOOM_CONFIG_KEY=%s\n' "$(openssl rand -base64 32)"; \
        printf 'IRONLOOM_INSTALLER_TOKEN=%s\n' "$(openssl rand -base64 32)"; \
      } > "{{setup_env}}"; \
      echo "created {{setup_env}}"; \
    else \
      echo "using {{setup_env}}"; \
    fi

docker-build:
    docker build -f docker/ironloom-runtime/Dockerfile -t "{{image}}" .

docker-up: docker-build ensure-local-env
    @mkdir -p "{{local_state}}/state" "{{local_state}}/worktrees"
    @docker rm -f "{{container}}" >/dev/null 2>&1 || true
    docker run -d \
      --name "{{container}}" \
      --env-file "{{setup_env}}" \
      -e IRONLOOM_PUBLIC_URL="http://127.0.0.1:{{http_port}}" \
      -e IRONLOOM_STATE_ROOT=/var/lib/ironloom/.ironloom \
      -p "{{http_port}}:8080" \
      -v "$PWD/{{local_state}}/state:/var/lib/ironloom/.ironloom" \
      -v "$PWD/{{local_state}}/worktrees:/var/lib/ironloom/worktrees" \
      "{{image}}"
    @echo "Ironloom is starting at http://127.0.0.1:{{http_port}}/setup"

docker-wait:
    @for attempt in {1..60}; do \
      if curl -fsS "http://127.0.0.1:{{http_port}}/healthz" >/dev/null 2>&1; then \
        echo "Ironloom health check passed"; \
        exit 0; \
      fi; \
      sleep 1; \
    done; \
    echo "Ironloom health check did not pass" >&2; \
    exit 1

setup-url: ensure-local-env
    @. "{{setup_env}}"; \
    echo "Setup URL: http://127.0.0.1:{{http_port}}/setup"; \
    echo "Installer token: $IRONLOOM_INSTALLER_TOKEN"

setup-local: docker-wait
    @. "{{setup_env}}"; \
    curl -fsS -X POST "http://127.0.0.1:{{http_port}}/setup" \
      --data-urlencode "installer_token=$IRONLOOM_INSTALLER_TOKEN" \
      --data-urlencode "runtime_url=http://127.0.0.1:{{http_port}}" \
      --data-urlencode "discord_application_id=123456789012345678" \
      --data-urlencode "discord_token_ref=local-discord-token" \
      --data-urlencode "discord_public_key_ref=local-discord-public-key" \
      --data-urlencode "github_token_ref=local-github-token" \
      --data-urlencode "sonarcloud_token_ref=local-sonar-token" \
      --data-urlencode "sonarcloud_organization=local-sonar-org" \
      --data-urlencode "sonarcloud_project_key=local-sonar-project" \
      --data-urlencode "openai_auth_method=api_key" \
      --data-urlencode "openai_api_key_ref=local-openai-key"
    @curl -fsS "http://127.0.0.1:{{http_port}}/readyz"
    @echo
    @echo "Local setup saved"

proof: docker-up setup-local
    docker exec -w /var/lib/ironloom "{{container}}" \
      ironloom proof /var/lib/ironloom/worktrees/ironloom-proof-app
    @echo
    @echo "Proof project: {{local_state}}/worktrees/ironloom-proof-app"

k3s-acceptance:
    ./scripts/k3s-acceptance.sh

external-probe:
    cargo run -p ironloom-runtime --bin ironloom -- external-probe "{{github_repository}}"

docker-logs:
    docker logs -f "{{container}}"

docker-stop:
    @docker rm -f "{{container}}" >/dev/null 2>&1 || true
    @echo "Stopped {{container}}"

clean-local: docker-stop
    rm -rf "{{local_state}}"
