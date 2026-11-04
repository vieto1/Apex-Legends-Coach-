# syntax=docker/dockerfile:1
FROM python:3.12-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 APEX_DATA_DIR=/data OMP_THREAD_LIMIT=1
WORKDIR /app
RUN --mount=type=secret,id=proxy_ca,required=false \
    if [ -f /run/secrets/proxy_ca ]; then export SSL_CERT_FILE=/run/secrets/proxy_ca; fi; \
    apt-get update && apt-get install -y --no-install-recommends ffmpeg tesseract-ocr tesseract-ocr-eng ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt ./
RUN --mount=type=secret,id=proxy_ca,required=false \
    if [ -f /run/secrets/proxy_ca ]; then export PIP_CERT=/run/secrets/proxy_ca; fi; \
    pip install --no-cache-dir -r requirements.txt
COPY --chown=10001:10001 apexcoach/ ./apexcoach/
COPY --chown=10001:10001 scripts/demo.py ./scripts/demo.py
RUN useradd --uid 10001 --create-home coach && mkdir /data && chown coach:coach /data
USER coach
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=6 \
    CMD python -c "import json,urllib.request; r=json.load(urllib.request.urlopen('http://127.0.0.1:8000/api/health',timeout=3)); assert all(r['tools'].values())"
CMD ["uvicorn","apexcoach.app:app","--host","0.0.0.0","--port","8000"]
