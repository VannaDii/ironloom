#!/bin/sh
set -eu

if [ "$#" -gt 0 ]; then
  exec ironloom "$@"
fi

exec ironloom serve
