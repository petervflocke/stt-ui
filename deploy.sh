#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "Stopping old containers (if any)..."
docker compose down

echo "Building and starting..."
docker compose up -d --build

echo "Status:"
docker compose ps

echo "Cleaning dangling images..."
docker image prune -f >/dev/null || true

echo "Done."

