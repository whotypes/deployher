#!/usr/bin/env sh
set -eu

if [ "${RUN_MIGRATIONS:-1}" = "1" ]; then
  echo "Running database migrations..."
  bun migrate.ts
fi

exec bun src/index.ts
