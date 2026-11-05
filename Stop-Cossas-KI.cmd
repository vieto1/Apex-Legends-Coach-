@echo off
setlocal
cd /d "%~dp0"
set legacyPrefix=apex
set legacyProject=%legacyPrefix%-review
if not defined COSSA_DATA_VOLUME (
 docker volume inspect "%legacyProject%_reviews" >nul 2>nul
 if not errorlevel 1 (
  set COSSA_DATA_VOLUME=%legacyProject%_reviews
  set COMPOSE_PROJECT_NAME=%legacyProject%
 )
)
docker compose stop
pause
