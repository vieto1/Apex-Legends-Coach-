#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
for tool in ffmpeg ffprobe tesseract; do
  command -v "$tool" >/dev/null || { echo "Fehlt: $tool. Siehe README.md." >&2; exit 1; }
done
if [[ ! -x .venv/bin/uvicorn ]]; then
  echo 'Zuerst: python -m venv .venv && .venv/bin/pip install -r requirements.txt' >&2
  exit 1
fi
exec .venv/bin/uvicorn apexcoach.app:app --host 127.0.0.1 --port "${APEX_PORT:-8000}"
