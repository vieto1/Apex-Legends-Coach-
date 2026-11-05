#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
legacy_project="apex""-review"
if [[ -z "${COSSA_DATA_VOLUME:-}" ]] && docker volume inspect "${legacy_project}_reviews" >/dev/null 2>&1; then
  export COSSA_DATA_VOLUME="${legacy_project}_reviews"
  export COMPOSE_PROJECT_NAME="$legacy_project"
fi
docker compose stop
