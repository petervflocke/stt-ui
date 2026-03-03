#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "Stopping old containers (if any)..."
docker compose down

echo "Building and starting (force recreate for fresh NVIDIA runtime mounts)..."
docker compose up -d --build --force-recreate

echo "Status:"
docker compose ps

echo "GPU sanity check in container..."
docker exec stt-ui python3 -c "import ctranslate2; c=ctranslate2.get_cuda_device_count(); print(f'cuda_device_count={c}'); raise SystemExit(0 if c > 0 else 1)"

echo "API warmup check..."
docker exec stt-ui python3 -c "import urllib.request; req=urllib.request.Request('http://127.0.0.1:8010/api/warmup', method='POST'); print(urllib.request.urlopen(req, timeout=180).read().decode())"

echo "Cleaning dangling images..."
docker image prune -f >/dev/null || true

echo "Done."
