# Cossa's KI direkt starten

## MacBook: Website ohne Installation

Öffne **https://vieto1.github.io/Apex-Legends-Coach-/** in einem aktuellen Browser (Chrome/Edge empfohlen). Die Website ist auf GitHub veröffentlicht. Die automatische Vorbereitung der Texterkennung abwarten und **Beispiel ausprobieren** klicken. [Veröffentlichung und Adresse](docs/github-pages.md).

Videos und Notizen bleiben in deinem Browserprofil. Kein Docker oder Python nötig. Unterstützte Videoformate: MP4 (H.264) und WebM. Die folgenden Startdateien sind nur für die alternative lokale Serverfassung.

## Windows

1. **Docker Desktop muss installiert sein und laufen.** Linux-Container verwenden (Docker-Desktop-Standard).
2. Dieses ZIP vollständig entpacken.
3. Im Ordner **Start-Cossas-KI.cmd** doppelklicken.
4. Der Browser öffnet die lokale Website automatisch, sobald sie bereit ist.
5. Zum Kennenlernen **Beispiel ausprobieren** anklicken. Anschließend eigenes Video hochladen oder das Spielfenster aufnehmen.

Beim ersten Start lädt Docker die benötigten Programme herunter. Danach sind Python, FFmpeg und die OCR bereits im Anwendungsimage enthalten. Die laufende Analyse benötigt keine Internetverbindung, keine API-Schlüssel und keine Anmeldung.

## macOS oder Linux

Docker mit Compose starten. Im entpackten Ordner ausführen:

```sh
./start-local.sh
```

Alternativ auf allen Plattformen:

```sh
docker compose up -d --build --wait
```

Die lokale Website läuft auf `http://localhost:8000`. Bei belegtem Port z. B. `APEX_PORT=8008` setzen (Windows cmd: `set APEX_PORT=8008`, PowerShell: `$env:APEX_PORT=8008`), dann erneut starten. Zum Stoppen `Stop-Cossas-KI.cmd` oder `docker compose stop` verwenden.

## Daten und Privatsphäre

Aufnahmen, Notizen und Ergebnisse bleiben im Docker-Volume `cossas-ki_reviews` auf deinem Rechner. Ein Update oder normaler Neustart löscht sie nicht. **Kein `docker compose down -v` ausführen**, wenn die Daten erhalten bleiben sollen. Einzelne Aufnahmen lassen sich in der Website löschen. Das Startpaket enthält keine privaten Aufnahmen aus der Entwicklungsumgebung.

Die Website ist standardmäßig nur auf deinem Rechner erreichbar. Für gemeinsames Review Dateien/Clips exportieren oder zusammen am Rechner ansehen. Öffentliches Hosting und Nutzerverwaltung sind nicht eingerichtet.

## Was du beachten musst

- Für echte Gameplay-Auswertung die sichtbaren HUD-Bereiche kalibrieren; die Demo bringt ein passendes Profil mit.
- Browser-Aufnahme benötigt eine Quellenfreigabe und einen unterstützten Browser, z. B. Chrome/Edge. Systemaudio ist von der ausgewählten Quelle und dem Betriebssystem abhängig.
- Automatische Befunde im Video prüfen. Die Erkennung ist heuristisch, noch nicht auf echten Apex-Matches evaluiert.
- Bei Startproblemen zeigt das Startfenster den Fehler. Diagnose: `docker compose logs --tail=80`. Die vollständige Anleitung steht in `README.md`.
