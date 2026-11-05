#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
command -v docker >/dev/null || { echo 'Docker mit Compose installieren und starten.' >&2; exit 1; }
# Retain existing installations' persistent storage and project identity.
legacy_project="apex""-review"
if [[ -z "${COSSA_DATA_VOLUME:-}" ]] && docker volume inspect "${legacy_project}_reviews" >/dev/null 2>&1; then
  export COSSA_DATA_VOLUME="${legacy_project}_reviews"
  export COMPOSE_PROJECT_NAME="$legacy_project"
fi
docker compose up -d --build --wait --wait-timeout 180
apex_url="http://localhost:${APEX_PORT:-8000}"
echo "Cossa's KI bereit: $apex_url"
if command -v xdg-open >/dev/null; then xdg-open "$apex_url" >/dev/null 2>&1 || true
elif command -v open >/dev/null; then open "$apex_url" || true
fi
