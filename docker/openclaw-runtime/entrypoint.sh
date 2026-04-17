#!/bin/sh
set -eu

cd /app

exec node ./packages/openclaw/node_modules/openclaw/openclaw.mjs gateway run "$@"
