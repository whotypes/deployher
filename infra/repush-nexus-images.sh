#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_ENV_FILE="${BACKEND_ENV_FILE:-$SCRIPT_DIR/../.env}"

if [[ ! -f "$BACKEND_ENV_FILE" ]]; then
  echo "Error: .env not found at $BACKEND_ENV_FILE"
  exit 1
fi

NEXUS_REGISTRY="$(grep -E '^NEXUS_REGISTRY=' "$BACKEND_ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'" || true)"
NEXUS_USER="$(grep -E '^NEXUS_USER=' "$BACKEND_ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'" || true)"
NEXUS_PASSWORD="$(grep -E '^NEXUS_PASSWORD=' "$BACKEND_ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'" || true)"

if [[ -z "$NEXUS_REGISTRY" ]] || [[ -z "$NEXUS_USER" ]] || [[ -z "$NEXUS_PASSWORD" ]]; then
  echo "Error: NEXUS_REGISTRY, NEXUS_USER, and NEXUS_PASSWORD must be set in .env"
  exit 1
fi

echo "Repushing all images to Nexus ($NEXUS_REGISTRY)..."
echo "Logging in..."
echo "$NEXUS_PASSWORD" | docker login "$NEXUS_REGISTRY" -u "$NEXUS_USER" --password-stdin

images=(
  "node:22-bookworm"
  "oven/bun:1"
  "python:3.12-bookworm"
  "nginx:alpine"
)

for img in "${images[@]}"; do
  echo "Pushing $img..."
  docker pull "$img"
  docker tag "$img" "$NEXUS_REGISTRY/$img"
  docker push "$NEXUS_REGISTRY/$img"
done

echo "Building pdploy-node-build-image..."
docker build \
  -f "$SCRIPT_DIR/../docker/node-builder.Dockerfile" \
  --build-arg "NEXUS_REGISTRY=$NEXUS_REGISTRY" \
  -t "$NEXUS_REGISTRY/pdploy-node-build-image:latest" \
  "$SCRIPT_DIR/.."

echo "Pushing pdploy-node-build-image..."
docker push "$NEXUS_REGISTRY/pdploy-node-build-image:latest"

echo "Building pdploy-bun-build-image..."
docker build \
  -f "$SCRIPT_DIR/../docker/bun-builder.Dockerfile" \
  --build-arg "NEXUS_REGISTRY=$NEXUS_REGISTRY" \
  -t "$NEXUS_REGISTRY/pdploy-bun-build-image:latest" \
  "$SCRIPT_DIR/.."

echo "Pushing pdploy-bun-build-image..."
docker push "$NEXUS_REGISTRY/pdploy-bun-build-image:latest"

echo "Done. All images repushed to $NEXUS_REGISTRY"
