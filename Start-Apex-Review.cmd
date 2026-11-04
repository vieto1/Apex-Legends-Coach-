@echo off
setlocal
cd /d "%~dp0"
where docker >nul 2>nul
if errorlevel 1 (
 echo Bitte Docker Desktop installieren und starten: https://www.docker.com/products/docker-desktop/
 pause
 exit /b 1
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
echo Apex Review laeuft. Zum Stoppen: Stop-Apex-Review.cmd
pause
