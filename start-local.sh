#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
command -v docker >/dev/null || { echo 'Docker mit Compose installieren und starten.' >&2; exit 1; }
docker compose up -d --build --wait --wait-timeout 180
apex_url="http://localhost:${APEX_PORT:-8000}"
echo "Apex Review bereit: $apex_url"
if command -v xdg-open >/dev/null; then xdg-open "$apex_url" >/dev/null 2>&1 || true
elif command -v open >/dev/null; then open "$apex_url" || true
fi
