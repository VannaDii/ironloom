#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE="${IRONLOOM_IMAGE:-ironloom:local}"
BUILD_NETWORK="${IRONLOOM_DOCKER_BUILD_NETWORK:-host}"

docker build \
  --network="${BUILD_NETWORK}" \
  -f "${ROOT_DIR}/docker/ironloom-runtime/Dockerfile" \
  -t "${IMAGE}" \
  "${ROOT_DIR}"
