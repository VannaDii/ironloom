#!/usr/bin/env sh
set -eu

cleanup_act() {
  ids="$(docker ps -aq --filter 'name=^act-' 2>/dev/null || true)"
  if [ -n "$ids" ]; then
    docker rm -f $ids >/dev/null 2>&1 || true
  fi

  rm -rf .artifacts/act
}

run_act_workflow() {
  cleanup_act
  act pull_request -W "$1" -e .github/act/pull_request.json
}

run_with_cleanup() {
  status=0
  trap 'status=$?; cleanup_act; exit "$status"' EXIT INT TERM

  case "${1:-}" in
    ci)
      run_act_workflow .github/workflows/ci.yml
      npm run test:openclaw:deep
      ;;
    cleanup)
      cleanup_act
      ;;
    pr)
      run_act_workflow .github/workflows/ci.yml
      npm run test:openclaw:deep
      run_act_workflow .github/workflows/typescript-matrix.yml
      ;;
    typescript)
      run_act_workflow .github/workflows/typescript-matrix.yml
      ;;
    *)
      printf '%s\n' 'Usage: sh scripts/run-act.sh {ci|cleanup|pr|typescript}' >&2
      exit 64
      ;;
  esac
}

run_with_cleanup "$@"
