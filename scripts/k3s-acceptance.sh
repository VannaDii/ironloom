#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE="${IRONLOOM_IMAGE:-ironloom:local}"
K3S_CONTAINER="${IRONLOOM_K3S_CONTAINER:-ironloom-k3s-acceptance}"
K3S_IMAGE="${IRONLOOM_K3S_IMAGE:-rancher/k3s:v1.32.6-k3s1}"
K3S_API_PORT="${IRONLOOM_K3S_API_PORT:-16443}"
HTTP_PORT="${IRONLOOM_K3S_HTTP_PORT:-18081}"
NAMESPACE="${IRONLOOM_K3S_NAMESPACE:-ironloom-acceptance}"
RELEASE="${IRONLOOM_K3S_RELEASE:-ironloom}"
STATE_DIR="${ROOT_DIR}/.ironloom/k3s-acceptance"
KUBECONFIG_PATH="${STATE_DIR}/kubeconfig"
PORT_FORWARD_LOG="${STATE_DIR}/port-forward.log"
SIGNING_SEED="${IRONLOOM_K3S_SIGNING_SEED:-0707070707070707070707070707070707070707070707070707070707070707}"
TIMESTAMP="${IRONLOOM_K3S_SIGNATURE_TIMESTAMP:-1700000000}"
THREAD_ID="${IRONLOOM_K3S_THREAD_ID:-thread-acceptance}"
WORK_ITEM_ID="${IRONLOOM_K3S_WORK_ITEM_ID:-work-acceptance}"
PING_BODY='{"type":1}'
COMMAND_BODY="{\"type\":2,\"id\":\"interaction-acceptance\",\"channel_id\":\"${THREAD_ID}\",\"member\":{\"user\":{\"id\":\"operator-acceptance\"}},\"data\":{\"name\":\"runtime_banner\"}}"
PORT_FORWARD_PID=""

cleanup() {
  if [[ -n "${PORT_FORWARD_PID}" ]]; then
    kill "${PORT_FORWARD_PID}" >/dev/null 2>&1 || true
    wait "${PORT_FORWARD_PID}" >/dev/null 2>&1 || true
  fi
  if [[ "${IRONLOOM_K3S_KEEP:-0}" != "1" ]]; then
    docker rm -f "${K3S_CONTAINER}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "missing required command: $1" >&2
    exit 1
  }
}

wait_for_http() {
  local url="$1"
  for _ in $(seq 1 90); do
    if curl -fsS "${url}" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "timed out waiting for ${url}" >&2
  return 1
}

wait_for_port_forward() {
  local log_path="$1"
  for _ in $(seq 1 30); do
    if ! kill -0 "${PORT_FORWARD_PID}" >/dev/null 2>&1; then
      cat "${log_path}" >&2 || true
      echo "port-forward exited before becoming ready" >&2
      return 1
    fi
    if grep -q "Forwarding from 127.0.0.1:${HTTP_PORT}" "${log_path}"; then
      return 0
    fi
    sleep 1
  done
  cat "${log_path}" >&2 || true
  echo "timed out waiting for port-forward to become ready" >&2
  return 1
}

sign_body() {
  local body="$1"
  docker run --rm "${IMAGE}" sign-discord-fixture "${SIGNING_SEED}" "${TIMESTAMP}" "${body}"
}

signed_post() {
  local body="$1"
  local signature="$2"
  curl -fsS \
    -X POST "http://127.0.0.1:${HTTP_PORT}/discord/interactions" \
    -H "x-signature-ed25519: ${signature}" \
    -H "x-signature-timestamp: ${TIMESTAMP}" \
    -H "content-type: application/json" \
    --data "${body}"
}

need curl
need docker
need helm
need kubectl
need openssl

cd "${ROOT_DIR}"
mkdir -p "${STATE_DIR}"

echo "Building ${IMAGE}"
IRONLOOM_IMAGE="${IMAGE}" ./scripts/docker-build-runtime.sh

echo "Starting disposable k3s container ${K3S_CONTAINER}"
docker rm -f "${K3S_CONTAINER}" >/dev/null 2>&1 || true
docker run -d \
  --name "${K3S_CONTAINER}" \
  --privileged \
  -p "127.0.0.1:${K3S_API_PORT}:6443" \
  "${K3S_IMAGE}" \
  server \
  --disable=traefik \
  --disable=servicelb \
  --write-kubeconfig-mode=644 >/dev/null

echo "Waiting for k3s API"
for _ in $(seq 1 120); do
  if docker exec "${K3S_CONTAINER}" sh -c 'test -f /etc/rancher/k3s/k3s.yaml && kubectl get nodes -o name | grep -q .'; then
    break
  fi
  sleep 1
done
docker exec "${K3S_CONTAINER}" sh -c 'kubectl get nodes -o name | grep -q .'
docker exec "${K3S_CONTAINER}" cat /etc/rancher/k3s/k3s.yaml \
  | sed "s/127.0.0.1:6443/127.0.0.1:${K3S_API_PORT}/" \
  > "${KUBECONFIG_PATH}"
export KUBECONFIG="${KUBECONFIG_PATH}"
for _ in $(seq 1 180); do
  if kubectl get nodes -o name | grep -q . \
    && kubectl wait node --all --for=condition=Ready --timeout=1s >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
kubectl get nodes -o name | grep -q .
kubectl wait node --all --for=condition=Ready --timeout=180s

echo "Importing ${IMAGE} into k3s containerd"
docker save "${IMAGE}" | docker exec -i "${K3S_CONTAINER}" ctr -n k8s.io images import -

PUBLIC_KEY="$(sign_body "${PING_BODY}" | awk -F= '/^public_key=/{print $2}')"
PING_SIGNATURE="$(sign_body "${PING_BODY}" | awk -F= '/^signature=/{print $2}')"
COMMAND_SIGNATURE="$(sign_body "${COMMAND_BODY}" | awk -F= '/^signature=/{print $2}')"
CONFIG_KEY="$(openssl rand -base64 32)"
INSTALLER_TOKEN="$(openssl rand -base64 32)"

echo "Creating acceptance namespace and secrets"
kubectl create namespace "${NAMESPACE}" >/dev/null
kubectl -n "${NAMESPACE}" create secret generic ironloom-setup \
  --from-literal=config-key="${CONFIG_KEY}" \
  --from-literal=installer-token="${INSTALLER_TOKEN}" >/dev/null
kubectl -n "${NAMESPACE}" create secret generic ironloom-discord \
  --from-literal=application-id=123456789012345678 \
  --from-literal=token=acceptance-discord-token \
  --from-literal=public-key="${PUBLIC_KEY}" >/dev/null
kubectl -n "${NAMESPACE}" create secret generic ironloom-github \
  --from-literal=token=acceptance-github-token >/dev/null
kubectl -n "${NAMESPACE}" create secret generic ironloom-sonarcloud \
  --from-literal=token=acceptance-sonar-token >/dev/null
kubectl -n "${NAMESPACE}" create secret generic ironloom-openai \
  --from-literal=api-key=acceptance-openai-key \
  --from-literal=oauth-session=acceptance-openai-oauth-session >/dev/null

echo "Installing Ironloom Helm chart"
helm upgrade --install "${RELEASE}" deploy/helm/ironloom \
  --namespace "${NAMESPACE}" \
  --set image.repository=ironloom \
  --set image.tag=local \
  --set image.pullPolicy=Never \
  --set runtime.publicUrl="http://127.0.0.1:${HTTP_PORT}" \
  --set sonarcloud.organization=acceptance-sonar-org \
  --set sonarcloud.projectKey=acceptance-sonar-project \
  --wait \
  --timeout=240s >/dev/null
kubectl -n "${NAMESPACE}" rollout status deployment/ironloom --timeout=180s

POD="$(kubectl -n "${NAMESPACE}" get pod -l app.kubernetes.io/name=ironloom -o jsonpath='{.items[0].metadata.name}')"
echo "Seeding persisted thread binding in ${POD}"
kubectl -n "${NAMESPACE}" exec "${POD}" -- sh -c \
  "mkdir -p /var/lib/ironloom/.ironloom/indexes/thread-bindings && printf '%s\n' '${WORK_ITEM_ID}' > /var/lib/ironloom/.ironloom/indexes/thread-bindings/${THREAD_ID}.binding"

echo "Port-forwarding service"
if curl -fsS "http://127.0.0.1:${HTTP_PORT}/healthz" >/dev/null 2>&1; then
  echo "local port ${HTTP_PORT} is already serving /healthz before port-forward starts" >&2
  exit 1
fi
kubectl -n "${NAMESPACE}" port-forward --address 127.0.0.1 svc/ironloom "${HTTP_PORT}:8080" >"${PORT_FORWARD_LOG}" 2>&1 &
PORT_FORWARD_PID="$!"
wait_for_port_forward "${PORT_FORWARD_LOG}"
wait_for_http "http://127.0.0.1:${HTTP_PORT}/healthz"
READY_RESPONSE="$(curl -fsS "http://127.0.0.1:${HTTP_PORT}/readyz")"
[[ "${READY_RESPONSE}" == "ok" ]]

echo "Verifying signed Discord ping"
PING_RESPONSE="$(signed_post "${PING_BODY}" "${PING_SIGNATURE}")"
[[ "${PING_RESPONSE}" == '{"type":1}' ]]

echo "Verifying signed thread-bound Discord command"
COMMAND_RESPONSE="$(signed_post "${COMMAND_BODY}" "${COMMAND_SIGNATURE}")"
echo "${COMMAND_RESPONSE}" | grep -q '"type":4'
echo "${COMMAND_RESPONSE}" | grep -q 'Gate completed through run_gate_worker'

ARTIFACT_INDEX="$(kubectl -n "${NAMESPACE}" exec "${POD}" -- sh -c "cat /var/lib/ironloom/.ironloom/indexes/threads/${THREAD_ID}.index")"
ARTIFACT_COUNT="$(printf '%s\n' "${ARTIFACT_INDEX}" | sed '/^$/d' | wc -l | tr -d ' ')"
[[ "${ARTIFACT_COUNT}" == "1" ]]

echo "Restarting deployment and verifying PVC-backed artifact index persists"
kubectl -n "${NAMESPACE}" rollout restart deployment/ironloom >/dev/null
kubectl -n "${NAMESPACE}" rollout status deployment/ironloom --timeout=180s
NEW_POD="$(kubectl -n "${NAMESPACE}" get pod -l app.kubernetes.io/name=ironloom -o jsonpath='{.items[0].metadata.name}')"
PERSISTED_INDEX="$(kubectl -n "${NAMESPACE}" exec "${NEW_POD}" -- sh -c "cat /var/lib/ironloom/.ironloom/indexes/threads/${THREAD_ID}.index")"
[[ "${PERSISTED_INDEX}" == "${ARTIFACT_INDEX}" ]]

echo "k3s acceptance passed"
echo "namespace=${NAMESPACE}"
echo "release=${RELEASE}"
echo "artifact_count=${ARTIFACT_COUNT}"
echo "pod_before_restart=${POD}"
echo "pod_after_restart=${NEW_POD}"
