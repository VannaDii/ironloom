#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

properties_file="${tmp_dir}/sonar-project.properties"
curl_log="${tmp_dir}/curl.log"
curl_state="${tmp_dir}/curl.state"
fake_bin="${tmp_dir}/bin"
mkdir -p "${fake_bin}"

cat >"${properties_file}" <<'PROPERTIES'
sonar.organization=vannadii
sonar.projectKey=vannadii_ironloom
sonar.projectName=Ironloom
PROPERTIES

cat >"${curl_state}" <<'STATE'
main_branch=master
desired_branch_exists=true
STATE

cat >"${fake_bin}/curl" <<'FAKE_CURL'
#!/usr/bin/env bash
set -euo pipefail

output_file=""
url=""
branch_name=""
rename_name=""

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
        branch=*)
          branch_name="${2#branch=}"
          ;;
        name=*)
          rename_name="${2#name=}"
          ;;
      esac
      shift 2
      ;;
    -G|-sS|-X|-H)
      if [[ "$1" == "-X" || "$1" == "-H" ]]; then
        shift 2
      else
        shift
      fi
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

if [[ -z "${output_file}" ]]; then
  echo "fake curl requires -o" >&2
  exit 2
fi

source "${IRONLOOM_TEST_CURL_STATE}"

write_body() {
  printf '%s\n' "$1" >"${output_file}"
}

case "${url}" in
  */api/components/show)
    echo "component-show" >>"${IRONLOOM_TEST_CURL_LOG}"
    write_body '{"component":{"key":"vannadii_ironloom"}}'
    printf '200'
    ;;
  */api/project_branches/list)
    echo "branch-list" >>"${IRONLOOM_TEST_CURL_LOG}"
    if [[ "${main_branch}" == "main" ]]; then
      write_body '{"branches":[{"name":"main","isMain":true}]}'
    elif [[ "${desired_branch_exists}" == "true" ]]; then
      write_body '{"branches":[{"name":"master","isMain":true},{"name":"main","isMain":false}]}'
    else
      write_body '{"branches":[{"name":"master","isMain":true}]}'
    fi
    printf '200'
    ;;
  */api/project_branches/delete)
    echo "branch-delete:${branch_name}" >>"${IRONLOOM_TEST_CURL_LOG}"
    if [[ "${branch_name}" != "main" ]]; then
      write_body '{"errors":[{"msg":"wrong branch deleted"}]}'
      printf '400'
      exit 0
    fi
    {
      echo "main_branch=${main_branch}"
      echo "desired_branch_exists=false"
    } >"${IRONLOOM_TEST_CURL_STATE}"
    write_body '{}'
    printf '204'
    ;;
  */api/project_branches/rename)
    echo "branch-rename:${rename_name}" >>"${IRONLOOM_TEST_CURL_LOG}"
    if [[ "${desired_branch_exists}" == "true" ]]; then
      write_body '{"errors":[{"msg":"Impossible to update branch name: a branch with name \"main\" already exists in the project."}]}'
      printf '400'
      exit 0
    fi
    {
      echo "main_branch=${rename_name}"
      echo "desired_branch_exists=true"
    } >"${IRONLOOM_TEST_CURL_STATE}"
    write_body '{}'
    printf '204'
    ;;
  *)
    echo "unexpected-url:${url}" >>"${IRONLOOM_TEST_CURL_LOG}"
    write_body '{"errors":[{"msg":"unexpected url"}]}'
    printf '500'
    ;;
esac
FAKE_CURL
chmod +x "${fake_bin}/curl"

export IRONLOOM_TEST_CURL_LOG="${curl_log}"
export IRONLOOM_TEST_CURL_STATE="${curl_state}"
export PATH="${fake_bin}:${PATH}"
export SONAR_TOKEN="test-token"
export SONAR_PROJECT_PROPERTIES="${properties_file}"
export SONAR_MAIN_BRANCH="main"

if ! output="$("${repo_root}/scripts/sonarcloud-project-bootstrap.sh" 2>&1)"; then
  printf '%s\n' "${output}" >&2
  exit 1
fi

grep -q "Deleting existing non-main SonarCloud branch main before renaming" <<<"${output}"
grep -q "SonarCloud main branch renamed to main" <<<"${output}"
grep -q '^branch-delete:main$' "${curl_log}"
grep -q '^branch-rename:main$' "${curl_log}"
