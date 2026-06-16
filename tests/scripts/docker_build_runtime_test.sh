#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

fake_bin="${tmp_dir}/bin"
docker_log="${tmp_dir}/docker.log"
mkdir -p "${fake_bin}"

cat >"${fake_bin}/docker" <<'FAKE_DOCKER'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$@" >"${IRONLOOM_TEST_DOCKER_LOG}"
FAKE_DOCKER
chmod +x "${fake_bin}/docker"

export PATH="${fake_bin}:${PATH}"
export IRONLOOM_TEST_DOCKER_LOG="${docker_log}"

IRONLOOM_IMAGE="ironloom:test" "${repo_root}/scripts/docker-build-runtime.sh"
grep -qx -- "build" "${docker_log}"
grep -qx -- "--network=host" "${docker_log}"
grep -qx -- "-f" "${docker_log}"
grep -qx -- "${repo_root}/docker/ironloom-runtime/Dockerfile" "${docker_log}"
grep -qx -- "-t" "${docker_log}"
grep -qx -- "ironloom:test" "${docker_log}"
grep -qx -- "${repo_root}" "${docker_log}"

IRONLOOM_IMAGE="ironloom:test" \
IRONLOOM_DOCKER_BUILD_NETWORK="default" \
  "${repo_root}/scripts/docker-build-runtime.sh"
grep -qx -- "--network=default" "${docker_log}"
