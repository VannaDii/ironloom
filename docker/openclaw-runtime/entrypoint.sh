#!/bin/sh
set -eu

cd /app

if [ "${DISCORD_GATEWAY_ENABLED:-false}" != "true" ]; then
  exec node ${OPENCLAW_GATEWAY_NODE_OPTIONS:-} ./node_modules/openclaw/openclaw.mjs gateway run "$@"
fi

node ${DISCORD_GATEWAY_NODE_OPTIONS:-} --input-type=module -e "import('./packages/discord/dist/interaction-gateway/runtime.js').then(({ startDiscordInteractionGatewayRuntimeFromEnvironment }) => startDiscordInteractionGatewayRuntimeFromEnvironment())" &
discord_gateway_pid="$!"

node ${OPENCLAW_GATEWAY_NODE_OPTIONS:-} ./node_modules/openclaw/openclaw.mjs gateway run "$@" &
openclaw_gateway_pid="$!"

cleanup() {
  kill "$discord_gateway_pid" "$openclaw_gateway_pid" 2>/dev/null || true
  wait "$discord_gateway_pid" "$openclaw_gateway_pid" 2>/dev/null || true
}

trap cleanup INT TERM

while kill -0 "$discord_gateway_pid" 2>/dev/null && kill -0 "$openclaw_gateway_pid" 2>/dev/null; do
  sleep 1
done

if kill -0 "$discord_gateway_pid" 2>/dev/null; then
  wait "$openclaw_gateway_pid"
  exit_status="$?"
else
  wait "$discord_gateway_pid"
  exit_status="$?"
fi

cleanup
exit "$exit_status"
