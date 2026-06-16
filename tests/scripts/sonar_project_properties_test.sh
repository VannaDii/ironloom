#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
properties_file="${repo_root}/sonar-project.properties"

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
  ' "${properties_file}"
}

coverage_exclusions="$(property_value sonar.coverage.exclusions)"
case ",${coverage_exclusions}," in
  *",site/guide-docs/**,"*)
    ;;
  *)
    echo "sonar.coverage.exclusions must exclude site/guide-docs/** so docs-site files do not reduce Rust coverage gates" >&2
    exit 1
    ;;
esac
