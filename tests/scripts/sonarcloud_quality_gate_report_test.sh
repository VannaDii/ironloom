#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

properties_file="${tmp_dir}/sonar-project.properties"
report_task_file="${tmp_dir}/report-task.txt"
fake_bin="${tmp_dir}/bin"
mkdir -p "${fake_bin}"

cat >"${properties_file}" <<'PROPERTIES'
sonar.organization=vannadii
sonar.projectKey=vannadii_ironloom
sonar.projectName=Ironloom
PROPERTIES

cat >"${report_task_file}" <<'TASK'
ceTaskId=test-task
TASK

cat >"${fake_bin}/curl" <<'FAKE_CURL'
#!/usr/bin/env bash
set -euo pipefail

output_file=""
url=""
project_key=""
branch_name=""
component_key=""
metric_keys=""
organization=""
task_id=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    -o)
      output_file="$2"
      shift 2
      ;;
    -w)
      shift 2
      ;;
    --data-urlencode)
      case "$2" in
        projectKey=*)
          project_key="${2#projectKey=}"
          ;;
        branch=*)
          branch_name="${2#branch=}"
          ;;
        component=*)
          component_key="${2#component=}"
          ;;
        metricKeys=*)
          metric_keys="${2#metricKeys=}"
          ;;
        organization=*)
          organization="${2#organization=}"
          ;;
        id=*)
          task_id="${2#id=}"
          ;;
      esac
      shift 2
      ;;
    -G|-sS)
      shift
      ;;
    -H)
      shift 2
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

case "${url}" in
  */api/ce/task)
    if [[ "${task_id}" != "test-task" ]]; then
      echo "unexpected task id" >&2
      exit 2
    fi
    cat >"${output_file}" <<'BODY'
{
  "task": {
    "id": "test-task",
    "status": "SUCCESS"
  }
}
BODY
    printf '200'
    ;;
  */api/qualitygates/project_status)
    if [[ "${project_key}" != "vannadii_ironloom" || "${branch_name}" != "main" ]]; then
      echo "unexpected project or branch" >&2
      exit 2
    fi
    case "${IRONLOOM_TEST_SONAR_SCENARIO}" in
      project_error)
        cat >"${output_file}" <<'BODY'
{
  "projectStatus": {
    "status": "ERROR",
    "conditions": [
      {
        "status": "ERROR",
        "metricKey": "coverage",
        "comparator": "LT",
        "errorThreshold": "80",
        "actualValue": "77.5"
      },
      {
        "status": "OK",
        "metricKey": "duplicated_lines_density",
        "comparator": "GT",
        "errorThreshold": "3",
        "actualValue": "0.0"
      }
    ]
  }
}
BODY
        ;;
      fallback_ok|fallback_fail)
        cat >"${output_file}" <<'BODY'
{
  "projectStatus": {
    "status": "NONE",
    "conditions": [],
    "periods": []
  }
}
BODY
        ;;
      *)
        echo "unexpected scenario ${IRONLOOM_TEST_SONAR_SCENARIO}" >&2
        exit 2
        ;;
    esac
    printf '200'
    ;;
  */api/qualitygates/list)
    if [[ "${organization}" != "vannadii" ]]; then
      echo "unexpected organization" >&2
      exit 2
    fi
    cat >"${output_file}" <<'BODY'
{
  "default": 9,
  "qualitygates": [
    {
      "id": 9,
      "name": "Sonar way",
      "isDefault": true,
      "conditions": [
        {
          "metric": "new_security_rating",
          "op": "GT",
          "error": "1"
        },
        {
          "metric": "new_coverage",
          "op": "LT",
          "error": "80"
        }
      ]
    }
  ]
}
BODY
    printf '200'
    ;;
  */api/measures/component)
    if [[ "${component_key}" != "vannadii_ironloom" || "${branch_name}" != "main" ]]; then
      echo "unexpected component or branch" >&2
      exit 2
    fi
    if [[ "${metric_keys}" != "security_rating,coverage" ]]; then
      echo "unexpected metric keys ${metric_keys}" >&2
      exit 2
    fi
    case "${IRONLOOM_TEST_SONAR_SCENARIO}" in
      fallback_ok)
        cat >"${output_file}" <<'BODY'
{
  "component": {
    "measures": [
      {
        "metric": "security_rating",
        "value": "1.0"
      },
      {
        "metric": "coverage",
        "value": "81.9"
      }
    ]
  }
}
BODY
        ;;
      fallback_fail)
        cat >"${output_file}" <<'BODY'
{
  "component": {
    "measures": [
      {
        "metric": "security_rating",
        "value": "1.0"
      },
      {
        "metric": "coverage",
        "value": "77.5"
      }
    ]
  }
}
BODY
        ;;
      *)
        echo "unexpected measures scenario ${IRONLOOM_TEST_SONAR_SCENARIO}" >&2
        exit 2
        ;;
    esac
    printf '200'
    ;;
  *)
    echo "unexpected url ${url}" >&2
    exit 2
    ;;
esac
FAKE_CURL
chmod +x "${fake_bin}/curl"

export PATH="${fake_bin}:${PATH}"
export SONAR_TOKEN="test-token"
export SONAR_PROJECT_PROPERTIES="${properties_file}"
export SONAR_REPORT_TASK_FILE="${report_task_file}"
export SONAR_MAIN_BRANCH="main"

if output="$(IRONLOOM_TEST_SONAR_SCENARIO=project_error "${repo_root}/scripts/sonarcloud-quality-gate-report.sh" 2>&1)"; then
  echo "expected project quality gate error to fail" >&2
  exit 1
fi

grep -q "SonarCloud compute engine task succeeded: test-task" <<<"${output}"
grep -q "SonarCloud quality gate status: ERROR" <<<"${output}"
grep -q "coverage: status=ERROR actual=77.5 comparator=LT threshold=80" <<<"${output}"
grep -q "duplicated_lines_density: status=OK actual=0.0 comparator=GT threshold=3" <<<"${output}"

output="$(IRONLOOM_TEST_SONAR_SCENARIO=fallback_ok "${repo_root}/scripts/sonarcloud-quality-gate-report.sh" 2>&1)"

grep -q "SonarCloud quality gate status: NONE" <<<"${output}"
grep -q "SonarCloud default quality gate fallback status: OK" <<<"${output}"
grep -q "new_coverage: status=OK actual=81.9 comparator=LT threshold=80 source=coverage" <<<"${output}"

if output="$(IRONLOOM_TEST_SONAR_SCENARIO=fallback_fail "${repo_root}/scripts/sonarcloud-quality-gate-report.sh" 2>&1)"; then
  echo "expected fallback quality gate error to fail" >&2
  exit 1
fi

grep -q "SonarCloud default quality gate fallback status: ERROR" <<<"${output}"
grep -q "new_coverage: status=ERROR actual=77.5 comparator=LT threshold=80 source=coverage" <<<"${output}"
