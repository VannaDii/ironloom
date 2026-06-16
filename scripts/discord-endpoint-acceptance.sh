#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DISCORD_API_BASE_URL="${DISCORD_API_BASE_URL:-https://discord.com/api/v10}"
DISCORD_TOKEN="${IRONLOOM_DISCORD_TOKEN:-${LIVE_TEST_DISCORD_BOT_TOKEN:-}}"
DISCORD_APPLICATION_ID="${IRONLOOM_DISCORD_APPLICATION_ID:-${LIVE_TEST_DISCORD_APPLICATION_ID:-}}"
DISCORD_PUBLIC_KEY="${IRONLOOM_DISCORD_PUBLIC_KEY:-${LIVE_TEST_DISCORD_PUBLIC_KEY:-}}"
ENDPOINT_URL="${IRONLOOM_DISCORD_ACCEPTANCE_ENDPOINT_URL:-}"
RESTORE_ENDPOINT="${IRONLOOM_DISCORD_ACCEPTANCE_RESTORE_ENDPOINT:-1}"
IMAGE="${IRONLOOM_IMAGE:-ironloom:local}"
CONTAINER="${IRONLOOM_DISCORD_ACCEPTANCE_CONTAINER:-ironloom-discord-acceptance}"
HTTP_PORT="${IRONLOOM_DISCORD_ACCEPTANCE_HTTP_PORT:-18082}"
STATE_DIR="${ROOT_DIR}/.ironloom/discord-endpoint-acceptance"
NGROK_API_URL="${IRONLOOM_NGROK_API_URL:-http://127.0.0.1:4040/api/tunnels}"
NGROK_LOG="${STATE_DIR}/ngrok.log"
NGROK_PID=""
RUNTIME_STARTED=0
PREVIOUS_ENDPOINT_SET=0
PREVIOUS_ENDPOINT=""

cleanup() {
  if [[ "${RESTORE_ENDPOINT}" == "1" && "${PREVIOUS_ENDPOINT_SET}" == "1" ]]; then
    if ! patch_discord_endpoint "${PREVIOUS_ENDPOINT}" >/dev/null 2>&1; then
      echo "warning: failed to restore previous Discord interactions endpoint" >&2
    fi
  fi
  if [[ -n "${NGROK_PID}" ]]; then
    kill "${NGROK_PID}" >/dev/null 2>&1 || true
    wait "${NGROK_PID}" >/dev/null 2>&1 || true
  fi
  if [[ "${RUNTIME_STARTED}" == "1" && "${IRONLOOM_DISCORD_ACCEPTANCE_KEEP_RUNTIME:-0}" != "1" ]]; then
    docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "missing required command: $1" >&2
    exit 1
  }
}

require_value() {
  local name="$1"
  local value="$2"
  if [[ -z "${value}" ]]; then
    echo "${name} is required" >&2
    exit 1
  fi
}

json_get_string_or_empty() {
  python3 - "$1" "$2" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    value = json.load(handle)
for key in sys.argv[2].split("."):
    value = value.get(key) if isinstance(value, dict) else None
if value is None:
    print("")
else:
    print(value)
PY
}

endpoint_payload() {
  local endpoint="$1"
  ENDPOINT="${endpoint}" python3 - <<'PY'
import json
import os

endpoint = os.environ["ENDPOINT"]
value = endpoint if endpoint else None
print(json.dumps({"interactions_endpoint_url": value}, separators=(",", ":")))
PY
}

discord_api() {
  local method="$1"
  local path="$2"
  local data="${3:-}"
  if [[ -n "${data}" ]]; then
    curl -fsS \
      -X "${method}" \
      -H "Authorization: Bot ${DISCORD_TOKEN}" \
      -H "Content-Type: application/json" \
      --data "${data}" \
      "${DISCORD_API_BASE_URL}${path}"
  else
    curl -fsS \
      -X "${method}" \
      -H "Authorization: Bot ${DISCORD_TOKEN}" \
      "${DISCORD_API_BASE_URL}${path}"
  fi
}

patch_discord_endpoint() {
  local endpoint="$1"
  discord_api "PATCH" "/applications/@me" "$(endpoint_payload "${endpoint}")"
}

wait_for_http() {
  local url="$1"
  for _ in $(seq 1 90); do
    if curl -fsS "${url}" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "timed out waiting for ${url}" >&2
  return 1
}

start_local_runtime() {
  need docker
  need openssl
  mkdir -p "${STATE_DIR}/state" "${STATE_DIR}/worktrees"
  IRONLOOM_IMAGE="${IMAGE}" "${ROOT_DIR}/scripts/docker-build-runtime.sh"
  docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true
  docker run -d \
    --name "${CONTAINER}" \
    -e IRONLOOM_PUBLIC_URL="http://127.0.0.1:${HTTP_PORT}" \
    -e IRONLOOM_STATE_ROOT=/var/lib/ironloom/.ironloom \
    -e IRONLOOM_CONFIG_KEY="$(openssl rand -base64 32)" \
    -e IRONLOOM_INSTALLER_TOKEN="$(openssl rand -base64 32)" \
    -e IRONLOOM_DISCORD_APPLICATION_ID="${DISCORD_APPLICATION_ID}" \
    -e IRONLOOM_DISCORD_TOKEN="${DISCORD_TOKEN}" \
    -e IRONLOOM_DISCORD_PUBLIC_KEY="${DISCORD_PUBLIC_KEY}" \
    -e IRONLOOM_GITHUB_TOKEN="${IRONLOOM_GITHUB_TOKEN:-discord-acceptance-github-token}" \
    -e IRONLOOM_SONARCLOUD_TOKEN="${IRONLOOM_SONARCLOUD_TOKEN:-discord-acceptance-sonar-token}" \
    -e IRONLOOM_SONARCLOUD_ORGANIZATION="${IRONLOOM_SONARCLOUD_ORGANIZATION:-discord-acceptance}" \
    -e IRONLOOM_SONARCLOUD_PROJECT_KEY="${IRONLOOM_SONARCLOUD_PROJECT_KEY:-discord-acceptance}" \
    -e IRONLOOM_OPENAI_API_KEY="${IRONLOOM_OPENAI_API_KEY:-discord-acceptance-openai-key}" \
    -p "127.0.0.1:${HTTP_PORT}:8080" \
    -v "${STATE_DIR}/state:/var/lib/ironloom/.ironloom" \
    -v "${STATE_DIR}/worktrees:/var/lib/ironloom/worktrees" \
    "${IMAGE}" >/dev/null
  RUNTIME_STARTED=1
  wait_for_http "http://127.0.0.1:${HTTP_PORT}/healthz"
  wait_for_http "http://127.0.0.1:${HTTP_PORT}/readyz"
}

start_ngrok() {
  need ngrok
  mkdir -p "${STATE_DIR}"
  ngrok http --log=stdout --log-format=logfmt "http://127.0.0.1:${HTTP_PORT}" \
    >"${NGROK_LOG}" 2>&1 &
  NGROK_PID="$!"
  for _ in $(seq 1 60); do
    if ! kill -0 "${NGROK_PID}" >/dev/null 2>&1; then
      cat "${NGROK_LOG}" >&2 || true
      echo "ngrok exited before publishing a tunnel" >&2
      exit 1
    fi
    local tunnels_json
    local public_url
    tunnels_json="$(curl -fsS "${NGROK_API_URL}" 2>/dev/null || true)"
    public_url="$(
      TUNNELS_JSON="${tunnels_json}" python3 - <<'PY' || true
import json
import os
import sys

try:
    payload = json.loads(os.environ["TUNNELS_JSON"])
except Exception:
    sys.exit(1)
for tunnel in payload.get("tunnels", []):
    public_url = tunnel.get("public_url", "")
    if public_url.startswith("https://"):
        print(public_url)
        sys.exit(0)
sys.exit(1)
PY
    )"
    if [[ -n "${public_url}" ]]; then
      ENDPOINT_URL="${public_url%/}/discord/interactions"
      return 0
    fi
    sleep 1
  done
  cat "${NGROK_LOG}" >&2 || true
  echo "timed out waiting for ngrok public URL" >&2
  exit 1
}

need curl
need python3
require_value "IRONLOOM_DISCORD_TOKEN" "${DISCORD_TOKEN}"
require_value "IRONLOOM_DISCORD_APPLICATION_ID" "${DISCORD_APPLICATION_ID}"
require_value "IRONLOOM_DISCORD_PUBLIC_KEY" "${DISCORD_PUBLIC_KEY}"

current_application="$(mktemp)"
updated_application="$(mktemp)"
discord_api "GET" "/applications/@me" >"${current_application}"
actual_application_id="$(json_get_string_or_empty "${current_application}" "id")"
if [[ "${actual_application_id}" != "${DISCORD_APPLICATION_ID}" ]]; then
  echo "Discord application id mismatch: expected ${DISCORD_APPLICATION_ID}, got ${actual_application_id}" >&2
  exit 1
fi
PREVIOUS_ENDPOINT="$(json_get_string_or_empty "${current_application}" "interactions_endpoint_url")"
PREVIOUS_ENDPOINT_SET=1

if [[ -z "${ENDPOINT_URL}" ]]; then
  start_local_runtime
  start_ngrok
fi

patch_discord_endpoint "${ENDPOINT_URL}" >"${updated_application}"
updated_url="$(json_get_string_or_empty "${updated_application}" "interactions_endpoint_url")"
if [[ "${updated_url}" != "${ENDPOINT_URL}" ]]; then
  echo "Discord did not persist the requested interactions endpoint URL" >&2
  exit 1
fi

echo "Discord endpoint validation passed"
echo "application_id=${actual_application_id}"
echo "endpoint_url=${ENDPOINT_URL}"
