#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

properties_file="${tmp_dir}/sonar-project.properties"
fake_bin="${tmp_dir}/bin"
mkdir -p "${fake_bin}"

cat >"${properties_file}" <<'PROPERTIES'
sonar.organization=vannadii
sonar.projectKey=vannadii_ironloom
sonar.projectName=Ironloom
PROPERTIES

cat >"${fake_bin}/curl" <<'FAKE_CURL'
#!/usr/bin/env bash
set -euo pipefail

output_file=""
url=""
project_key=""
branch_name=""

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

if [[ "${url}" != */api/qualitygates/project_status ]]; then
  echo "unexpected url ${url}" >&2
  exit 2
fi
if [[ "${project_key}" != "vannadii_ironloom" || "${branch_name}" != "main" ]]; then
  echo "unexpected project or branch" >&2
  exit 2
fi

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
printf '200'
FAKE_CURL
chmod +x "${fake_bin}/curl"

export PATH="${fake_bin}:${PATH}"
export SONAR_TOKEN="test-token"
export SONAR_PROJECT_PROPERTIES="${properties_file}"
export SONAR_MAIN_BRANCH="main"

output="$("${repo_root}/scripts/sonarcloud-quality-gate-report.sh" 2>&1)"

grep -q "SonarCloud quality gate status: ERROR" <<<"${output}"
grep -q "coverage: status=ERROR actual=77.5 comparator=LT threshold=80" <<<"${output}"
grep -q "duplicated_lines_density: status=OK actual=0.0 comparator=GT threshold=3" <<<"${output}"
