#!/usr/bin/env bash
set -euo pipefail

SONAR_HOST_URL="${SONAR_HOST_URL:-https://sonarcloud.io}"
SONAR_PROJECT_PROPERTIES="${SONAR_PROJECT_PROPERTIES:-sonar-project.properties}"
SONAR_PROJECT_VISIBILITY="${SONAR_PROJECT_VISIBILITY:-public}"

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
  echo "SONAR_TOKEN is required to verify or create the SonarCloud project" >&2
  exit 1
fi

organization="$(property_value sonar.organization)"
project_key="$(property_value sonar.projectKey)"
project_name="$(property_value sonar.projectName)"

require_value "sonar.organization" "${organization}"
require_value "sonar.projectKey" "${project_key}"
require_value "sonar.projectName" "${project_name}"

tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

component_body="${tmp_dir}/component.json"
create_body="${tmp_dir}/create.json"

component_status() {
  curl -sS -G \
    -o "${component_body}" \
    -w "%{http_code}" \
    -H "Authorization: Bearer ${SONAR_TOKEN}" \
    --data-urlencode "component=${project_key}" \
    "${SONAR_HOST_URL%/}/api/components/show"
}

status="$(component_status)"
case "${status}" in
  2*)
    echo "SonarCloud project exists: ${project_key}"
    exit 0
    ;;
  404)
    echo "SonarCloud project ${project_key} does not exist; creating it in ${organization}"
    ;;
  401|403)
    echo "SONAR_TOKEN cannot read SonarCloud project ${project_key}" >&2
    cat "${component_body}" >&2
    exit 1
    ;;
  *)
    echo "Unexpected SonarCloud project lookup status ${status}" >&2
    cat "${component_body}" >&2
    exit 1
    ;;
esac

create_status="$(
  curl -sS \
    -o "${create_body}" \
    -w "%{http_code}" \
    -H "Authorization: Bearer ${SONAR_TOKEN}" \
    -X POST \
    --data-urlencode "organization=${organization}" \
    --data-urlencode "project=${project_key}" \
    --data-urlencode "name=${project_name}" \
    --data-urlencode "visibility=${SONAR_PROJECT_VISIBILITY}" \
    "${SONAR_HOST_URL%/}/api/projects/create"
)"

case "${create_status}" in
  2*)
    ;;
  *)
    echo "Failed to create SonarCloud project ${project_key}; status ${create_status}" >&2
    cat "${create_body}" >&2
    exit 1
    ;;
esac

status="$(component_status)"
case "${status}" in
  2*)
    echo "SonarCloud project created and verified: ${project_key}"
    ;;
  *)
    echo "SonarCloud project ${project_key} was created but could not be verified; status ${status}" >&2
    cat "${component_body}" >&2
    exit 1
    ;;
esac
