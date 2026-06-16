#!/usr/bin/env bash
set -euo pipefail

SONAR_HOST_URL="${SONAR_HOST_URL:-https://sonarcloud.io}"
SONAR_PROJECT_PROPERTIES="${SONAR_PROJECT_PROPERTIES:-sonar-project.properties}"
SONAR_PROJECT_VISIBILITY="${SONAR_PROJECT_VISIBILITY:-public}"
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
branches_body="${tmp_dir}/branches.json"
rename_body="${tmp_dir}/rename.json"
delete_body="${tmp_dir}/delete.json"

component_status() {
  curl -sS -G \
    -o "${component_body}" \
    -w "%{http_code}" \
    -H "Authorization: Bearer ${SONAR_TOKEN}" \
    --data-urlencode "component=${project_key}" \
    "${SONAR_HOST_URL%/}/api/components/show"
}

branch_status() {
  curl -sS -G \
    -o "${branches_body}" \
    -w "%{http_code}" \
    -H "Authorization: Bearer ${SONAR_TOKEN}" \
    --data-urlencode "project=${project_key}" \
    "${SONAR_HOST_URL%/}/api/project_branches/list"
}

rename_main_branch() {
  curl -sS \
    -o "${rename_body}" \
    -w "%{http_code}" \
    -H "Authorization: Bearer ${SONAR_TOKEN}" \
    -X POST \
    --data-urlencode "project=${project_key}" \
    --data-urlencode "name=${SONAR_MAIN_BRANCH}" \
    "${SONAR_HOST_URL%/}/api/project_branches/rename"
}

delete_branch() {
  local branch="$1"

  curl -sS \
    -o "${delete_body}" \
    -w "%{http_code}" \
    -H "Authorization: Bearer ${SONAR_TOKEN}" \
    -X POST \
    --data-urlencode "project=${project_key}" \
    --data-urlencode "branch=${branch}" \
    "${SONAR_HOST_URL%/}/api/project_branches/delete"
}

ensure_main_branch() {
  local status
  local current_main_branch
  local desired_branch_exists

  if ! command -v jq >/dev/null 2>&1; then
    echo "jq is required to verify the SonarCloud main branch" >&2
    exit 1
  fi

  status="$(branch_status)"
  case "${status}" in
    2*)
      ;;
    401|403)
      echo "SONAR_TOKEN cannot list SonarCloud project branches for ${project_key}" >&2
      cat "${branches_body}" >&2
      exit 1
      ;;
    *)
      echo "Unexpected SonarCloud branch lookup status ${status}" >&2
      cat "${branches_body}" >&2
      exit 1
      ;;
  esac

  current_main_branch="$(jq -r '.branches[] | select(.isMain == true) | .name' "${branches_body}")"
  desired_branch_exists="$(
    jq -r \
      --arg branch "${SONAR_MAIN_BRANCH}" \
      'any(.branches[]; .name == $branch)' \
      "${branches_body}"
  )"
  require_value "SonarCloud main branch" "${current_main_branch}"
  if [[ "${current_main_branch}" == "${SONAR_MAIN_BRANCH}" ]]; then
    echo "SonarCloud main branch is ${SONAR_MAIN_BRANCH}"
    return
  fi

  if [[ "${desired_branch_exists}" == "true" ]]; then
    echo "Deleting existing non-main SonarCloud branch ${SONAR_MAIN_BRANCH} before renaming"
    status="$(delete_branch "${SONAR_MAIN_BRANCH}")"
    case "${status}" in
      2*)
        ;;
      *)
        echo "Failed to delete existing non-main SonarCloud branch ${SONAR_MAIN_BRANCH}; status ${status}" >&2
        cat "${delete_body}" >&2
        exit 1
        ;;
    esac
  fi

  echo "Renaming SonarCloud main branch from ${current_main_branch} to ${SONAR_MAIN_BRANCH}"
  status="$(rename_main_branch)"
  case "${status}" in
    2*)
      ;;
    *)
      echo "Failed to rename SonarCloud main branch; status ${status}" >&2
      cat "${rename_body}" >&2
      exit 1
      ;;
  esac

  status="$(branch_status)"
  case "${status}" in
    2*)
      ;;
    *)
      echo "Failed to verify renamed SonarCloud main branch; status ${status}" >&2
      cat "${branches_body}" >&2
      exit 1
      ;;
  esac

  current_main_branch="$(jq -r '.branches[] | select(.isMain == true) | .name' "${branches_body}")"
  if [[ "${current_main_branch}" != "${SONAR_MAIN_BRANCH}" ]]; then
    echo "SonarCloud main branch is ${current_main_branch}, expected ${SONAR_MAIN_BRANCH}" >&2
    cat "${branches_body}" >&2
    exit 1
  fi

  echo "SonarCloud main branch renamed to ${SONAR_MAIN_BRANCH}"
}

status="$(component_status)"
case "${status}" in
  2*)
    echo "SonarCloud project exists: ${project_key}"
    ensure_main_branch
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
    ensure_main_branch
    ;;
  *)
    echo "SonarCloud project ${project_key} was created but could not be verified; status ${status}" >&2
    cat "${component_body}" >&2
    exit 1
    ;;
esac
