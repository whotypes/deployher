#!/usr/bin/env bash
set -euo pipefail
# Requires Bun on host (migrate + build:client). For migrations only without Bun: deployher migrate (Docker).

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "==> Applying database migrations"
bun run migrate

echo "==> Rebuilding client assets"
bun run build:client

echo "==> Rebuilding and restarting app + deployment-worker only"
docker compose up -d --build app deployment-worker

echo "==> Current service status"
docker compose ps app deployment-worker postgres redis garage

echo
echo "Preview upgrade applied without resetting infra."
