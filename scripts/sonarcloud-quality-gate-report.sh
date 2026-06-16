#!/usr/bin/env bash
set -euo pipefail

SONAR_HOST_URL="${SONAR_HOST_URL:-https://sonarcloud.io}"
SONAR_PROJECT_PROPERTIES="${SONAR_PROJECT_PROPERTIES:-sonar-project.properties}"
SONAR_MAIN_BRANCH="${SONAR_MAIN_BRANCH:-main}"

property_value() {
  local key="$1"
  awk -F= -v key="${key}" '
    {
      candidate = $1
      gsub(/^[ \t]+|[ \t]+$/, "", candidate)
      if (candidate == key) {
        value = substr($0, index($0, "=") + 1)
        gsub(/^[ \t]+|[ \t\r]+$/, "", value)
        print value
        exit
      }
    }
  ' "${SONAR_PROJECT_PROPERTIES}"
}

require_value() {
  local name="$1"
  local value="$2"
  if [[ -z "${value}" ]]; then
    echo "${name} is required" >&2
    exit 1
  fi
}

if [[ -z "${SONAR_TOKEN:-}" ]]; then
  echo "SONAR_TOKEN is required to report SonarCloud quality gate status" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required to report SonarCloud quality gate status" >&2
  exit 1
fi

project_key="$(property_value sonar.projectKey)"
require_value "sonar.projectKey" "${project_key}"

tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT
gate_body="${tmp_dir}/quality-gate.json"

status="$(
  curl -sS -G \
    -o "${gate_body}" \
    -w "%{http_code}" \
    -H "Authorization: Bearer ${SONAR_TOKEN}" \
    --data-urlencode "projectKey=${project_key}" \
    --data-urlencode "branch=${SONAR_MAIN_BRANCH}" \
    "${SONAR_HOST_URL%/}/api/qualitygates/project_status"
)"

case "${status}" in
  2*)
    ;;
  *)
    echo "Failed to read SonarCloud quality gate status; status ${status}" >&2
    cat "${gate_body}" >&2
    exit 1
    ;;
esac

jq -r '
  "SonarCloud quality gate status: \(.projectStatus.status)",
  (.projectStatus.conditions[]? |
    "- \(.metricKey): status=\(.status) actual=\(.actualValue // "n/a") comparator=\(.comparator // "n/a") threshold=\(.errorThreshold // "n/a")"
  )
' "${gate_body}"
