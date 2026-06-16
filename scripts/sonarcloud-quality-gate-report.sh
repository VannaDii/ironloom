#!/usr/bin/env bash
set -euo pipefail

SONAR_HOST_URL="${SONAR_HOST_URL:-https://sonarcloud.io}"
SONAR_PROJECT_PROPERTIES="${SONAR_PROJECT_PROPERTIES:-sonar-project.properties}"
SONAR_MAIN_BRANCH="${SONAR_MAIN_BRANCH:-main}"
SONAR_REPORT_TASK_FILE="${SONAR_REPORT_TASK_FILE:-.scannerwork/report-task.txt}"
SONAR_CE_TIMEOUT_SECONDS="${SONAR_CE_TIMEOUT_SECONDS:-300}"
SONAR_CE_POLL_INTERVAL_SECONDS="${SONAR_CE_POLL_INTERVAL_SECONDS:-5}"

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
organization="$(property_value sonar.organization)"
require_value "sonar.projectKey" "${project_key}"
require_value "sonar.organization" "${organization}"

tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT
ce_body="${tmp_dir}/ce-task.json"
gate_body="${tmp_dir}/quality-gate.json"
quality_gates_body="${tmp_dir}/quality-gates.json"
measures_body="${tmp_dir}/measures.json"
fallback_lines="${tmp_dir}/fallback-lines.txt"

report_task_value() {
  local key="$1"
  if [[ ! -f "${SONAR_REPORT_TASK_FILE}" ]]; then
    return
  fi

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
  ' "${SONAR_REPORT_TASK_FILE}"
}

wait_for_compute_engine() {
  local task_id
  local status
  local task_status
  local deadline

  task_id="$(report_task_value ceTaskId)"
  if [[ -z "${task_id}" ]]; then
    return
  fi

  deadline=$((SECONDS + SONAR_CE_TIMEOUT_SECONDS))
  while true; do
    status="$(
      curl -sS -G \
        -o "${ce_body}" \
        -w "%{http_code}" \
        -H "Authorization: Bearer ${SONAR_TOKEN}" \
        --data-urlencode "id=${task_id}" \
        "${SONAR_HOST_URL%/}/api/ce/task"
    )"

    case "${status}" in
      2*)
        ;;
      *)
        echo "Failed to read SonarCloud compute engine task ${task_id}; status ${status}" >&2
        cat "${ce_body}" >&2
        exit 1
        ;;
    esac

    task_status="$(jq -r '.task.status // empty' "${ce_body}")"
    case "${task_status}" in
      SUCCESS)
        echo "SonarCloud compute engine task succeeded: ${task_id}"
        return
        ;;
      FAILED|CANCELED)
        echo "SonarCloud compute engine task ${task_id} ended with status ${task_status}" >&2
        cat "${ce_body}" >&2
        exit 1
        ;;
      PENDING|IN_PROGRESS)
        ;;
      *)
        echo "Unexpected SonarCloud compute engine status for ${task_id}: ${task_status}" >&2
        cat "${ce_body}" >&2
        exit 1
        ;;
    esac

    if ((SECONDS >= deadline)); then
      echo "Timed out waiting for SonarCloud compute engine task ${task_id}" >&2
      cat "${ce_body}" >&2
      exit 1
    fi
    sleep "${SONAR_CE_POLL_INTERVAL_SECONDS}"
  done
}

print_project_gate() {
  jq -r '
    "SonarCloud quality gate status: \(.projectStatus.status)",
    (.projectStatus.conditions[]? |
      "- \(.metricKey): status=\(.status) actual=\(.actualValue // "n/a") comparator=\(.comparator // "n/a") threshold=\(.errorThreshold // "n/a")"
    )
  ' "${gate_body}"
}

condition_source_metrics() {
  local gate_id="$1"

  jq -r \
    --argjson gate_id "${gate_id}" \
    '
      def source_metric:
        if . == "new_security_rating" then "security_rating"
        elif . == "new_reliability_rating" then "reliability_rating"
        elif . == "new_maintainability_rating" then "sqale_rating"
        elif . == "new_coverage" then "coverage"
        elif . == "new_duplicated_lines_density" then "duplicated_lines_density"
        elif . == "new_security_hotspots_reviewed" then "security_hotspots_reviewed"
        else .
        end;

      [
        .qualitygates[]?
        | select(.id == $gate_id)
        | .conditions[]?
        | .metric
        | source_metric
      ]
      | reduce .[] as $metric ([]; if index($metric) then . else . + [$metric] end)
      | join(",")
    ' "${quality_gates_body}"
}

condition_rows() {
  local gate_id="$1"

  jq -r \
    --argjson gate_id "${gate_id}" \
    '
      def source_metric:
        if . == "new_security_rating" then "security_rating"
        elif . == "new_reliability_rating" then "reliability_rating"
        elif . == "new_maintainability_rating" then "sqale_rating"
        elif . == "new_coverage" then "coverage"
        elif . == "new_duplicated_lines_density" then "duplicated_lines_density"
        elif . == "new_security_hotspots_reviewed" then "security_hotspots_reviewed"
        else .
        end;

      .qualitygates[]?
      | select(.id == $gate_id)
      | .conditions[]?
      | [.metric, .op, .error, (.metric | source_metric)]
      | @tsv
    ' "${quality_gates_body}"
}

measure_value() {
  local metric="$1"

  jq -r \
    --arg metric "${metric}" \
    '(.component.measures[]? | select(.metric == $metric) | .value) // empty' \
    "${measures_body}"
}

condition_is_failing() {
  local actual="$1"
  local comparator="$2"
  local threshold="$3"

  awk \
    -v actual="${actual}" \
    -v comparator="${comparator}" \
    -v threshold="${threshold}" \
    'BEGIN {
      actual_value = actual + 0
      threshold_value = threshold + 0
      if (comparator == "LT") {
        exit !(actual_value < threshold_value)
      }
      if (comparator == "GT") {
        exit !(actual_value > threshold_value)
      }
      if (comparator == "EQ") {
        exit !(actual_value == threshold_value)
      }
      if (comparator == "NE") {
        exit !(actual_value != threshold_value)
      }
      exit 2
    }'
}

enforce_default_gate_fallback() {
  local status
  local gate_id
  local metric_keys
  local fallback_status="OK"
  local metric
  local comparator
  local threshold
  local source_metric
  local actual
  local condition_status

  status="$(
    curl -sS -G \
      -o "${quality_gates_body}" \
      -w "%{http_code}" \
      -H "Authorization: Bearer ${SONAR_TOKEN}" \
      --data-urlencode "organization=${organization}" \
      "${SONAR_HOST_URL%/}/api/qualitygates/list"
  )"

  case "${status}" in
    2*)
      ;;
    *)
      echo "Failed to list SonarCloud quality gates for ${organization}; status ${status}" >&2
      cat "${quality_gates_body}" >&2
      exit 1
      ;;
  esac

  gate_id="$(jq -r '.default // (.qualitygates[]? | select(.isDefault == true) | .id) // empty' "${quality_gates_body}")"
  require_value "SonarCloud default quality gate" "${gate_id}"

  metric_keys="$(condition_source_metrics "${gate_id}")"
  require_value "SonarCloud quality gate metrics" "${metric_keys}"

  status="$(
    curl -sS -G \
      -o "${measures_body}" \
      -w "%{http_code}" \
      -H "Authorization: Bearer ${SONAR_TOKEN}" \
      --data-urlencode "component=${project_key}" \
      --data-urlencode "metricKeys=${metric_keys}" \
      --data-urlencode "branch=${SONAR_MAIN_BRANCH}" \
      "${SONAR_HOST_URL%/}/api/measures/component"
  )"

  case "${status}" in
    2*)
      ;;
    *)
      echo "Failed to read SonarCloud measures for ${project_key}; status ${status}" >&2
      cat "${measures_body}" >&2
      exit 1
      ;;
  esac

  : >"${fallback_lines}"
  while IFS=$'\t' read -r metric comparator threshold source_metric; do
    actual="$(measure_value "${source_metric}")"
    condition_status="OK"
    if [[ -z "${actual}" ]]; then
      actual="missing"
      condition_status="ERROR"
    elif condition_is_failing "${actual}" "${comparator}" "${threshold}"; then
      condition_status="ERROR"
    fi

    if [[ "${condition_status}" == "ERROR" ]]; then
      fallback_status="ERROR"
    fi

    echo "- ${metric}: status=${condition_status} actual=${actual} comparator=${comparator} threshold=${threshold} source=${source_metric}" >>"${fallback_lines}"
  done < <(condition_rows "${gate_id}")

  echo "SonarCloud default quality gate fallback status: ${fallback_status}"
  cat "${fallback_lines}"

  if [[ "${fallback_status}" != "OK" ]]; then
    exit 1
  fi
}

wait_for_compute_engine

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

print_project_gate

gate_status="$(jq -r '.projectStatus.status // empty' "${gate_body}")"
case "${gate_status}" in
  OK)
    ;;
  ERROR)
    exit 1
    ;;
  NONE)
    enforce_default_gate_fallback
    ;;
  *)
    echo "Unexpected SonarCloud quality gate status: ${gate_status}" >&2
    exit 1
    ;;
esac
