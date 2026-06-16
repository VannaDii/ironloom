#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

fake_bin="${tmp_dir}/bin"
curl_log="${tmp_dir}/curl.log"
mkdir -p "${fake_bin}"

cat >"${fake_bin}/curl" <<'FAKE_CURL'
#!/usr/bin/env bash
set -euo pipefail

method="GET"
data=""
url=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    -X)
      method="$2"
      shift 2
      ;;
    --data)
      data="$2"
      shift 2
      ;;
    -H)
      shift 2
      ;;
    -f|-s|-S|-fsS)
      shift
      ;;
    http*)
      url="$1"
      shift
      ;;
    *)
      shift
      ;;
  esac
done

printf '%s %s %s\n' "${method}" "${url}" "${data}" >>"${IRONLOOM_TEST_CURL_LOG}"

case "${method} ${url}" in
  "GET https://discord.test/api/v10/applications/@me")
    cat <<'BODY'
{
  "id": "123456789012345678",
  "interactions_endpoint_url": null
}
BODY
    ;;
  "PATCH https://discord.test/api/v10/applications/@me")
    python3 - "${data}" <<'PY'
import json
import sys

payload = json.loads(sys.argv[1])
print(json.dumps({
    "id": "123456789012345678",
    "interactions_endpoint_url": payload.get("interactions_endpoint_url"),
}))
PY
    ;;
  *)
    echo "unexpected curl call: ${method} ${url}" >&2
    exit 2
    ;;
esac
FAKE_CURL
chmod +x "${fake_bin}/curl"

cat >"${fake_bin}/docker" <<'FAKE_DOCKER'
#!/usr/bin/env bash
echo "docker should not be called when endpoint URL is supplied" >&2
exit 2
FAKE_DOCKER
chmod +x "${fake_bin}/docker"

cat >"${fake_bin}/ngrok" <<'FAKE_NGROK'
#!/usr/bin/env bash
echo "ngrok should not be called when endpoint URL is supplied" >&2
exit 2
FAKE_NGROK
chmod +x "${fake_bin}/ngrok"

export PATH="${fake_bin}:${PATH}"
export IRONLOOM_TEST_CURL_LOG="${curl_log}"
export IRONLOOM_DISCORD_TOKEN="discord-token"
export IRONLOOM_DISCORD_APPLICATION_ID="123456789012345678"
export IRONLOOM_DISCORD_PUBLIC_KEY="discord-public-key"
export IRONLOOM_DISCORD_ACCEPTANCE_ENDPOINT_URL="https://example.test/discord/interactions"
export DISCORD_API_BASE_URL="https://discord.test/api/v10"

output="$("${repo_root}/scripts/discord-endpoint-acceptance.sh" 2>&1)"

grep -q "Discord endpoint validation passed" <<<"${output}"
grep -q "application_id=123456789012345678" <<<"${output}"
grep -qx 'GET https://discord.test/api/v10/applications/@me ' "${curl_log}"
grep -q 'PATCH https://discord.test/api/v10/applications/@me {"interactions_endpoint_url":"https://example.test/discord/interactions"}' "${curl_log}"
grep -q 'PATCH https://discord.test/api/v10/applications/@me {"interactions_endpoint_url":null}' "${curl_log}"

if output="$(
  unset IRONLOOM_DISCORD_TOKEN
  unset LIVE_TEST_DISCORD_BOT_TOKEN
  "${repo_root}/scripts/discord-endpoint-acceptance.sh" 2>&1
)"; then
  echo "expected missing Discord token to fail" >&2
  exit 1
fi

grep -q "IRONLOOM_DISCORD_TOKEN is required" <<<"${output}"
