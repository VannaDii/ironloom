#!/bin/sh
set -eu

cd /app

exec node ./node_modules/openclaw/openclaw.mjs gateway run "$@"
