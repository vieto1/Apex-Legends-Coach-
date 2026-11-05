@echo off
setlocal
cd /d "%~dp0"
where docker >nul 2>nul
if errorlevel 1 (
 echo Bitte Docker Desktop installieren und starten: https://www.docker.com/products/docker-desktop/
 pause
 exit /b 1
)
rem Preserve an existing installation's storage, if present.
set legacyPrefix=apex
set legacyProject=%legacyPrefix%-review
if not defined COSSA_DATA_VOLUME (
 docker volume inspect "%legacyProject%_reviews" >nul 2>nul
 if not errorlevel 1 (
  set COSSA_DATA_VOLUME=%legacyProject%_reviews
  set COMPOSE_PROJECT_NAME=%legacyProject%
 )
)
docker compose up -d --build --wait --wait-timeout 180
if errorlevel 1 (
 echo Start fehlgeschlagen. Diagnose:
 docker compose logs --tail=60
 pause
 exit /b 1
)
if not defined APEX_PORT set APEX_PORT=8000
start "" "http://localhost:%APEX_PORT%"
echo Cossa's KI laeuft. Zum Stoppen: Stop-Cossas-KI.cmd
pause
