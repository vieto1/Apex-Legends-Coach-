# Cossa's KI

Lokale, private Review-Anwendung für Apex-Legends-Aufnahmen: Bildschirm aufnehmen oder Video hochladen, HUD auswerten, Momente im Video prüfen und mit dem Squad besprechen. Eigenständiger Funktionsentwurf ohne Omnic-Inhalte oder proprietäre Modelle.

## Was funktioniert?

- **Aufnahme und Ingestion:** Browser-Bildschirmaufnahme mit Quellenfreigabe, Systemaudio soweit die Quelle es anbietet, Datei-Upload (MP4/MOV/MKV/WebM), H.264/AAC-Konvertierung und Download des Originals. Browser-WebM ohne Dauer-Header werden unterstützt.
- **Kalibrierung:** Markieren von Schadenszähler, Minimap, Gesundheits-/Schildbalken und Magazinzahl auf einem Videoframe; alternativ exakte JSON-Koordinaten. Profile speichern, laden und löschen. Auch gespeicherte Videos lassen sich nachträglich kalibrieren und erneut analysieren.
- **Analyse:** Kampfbeginn-Signale, Schadenszuwächse, mögliche Positionswechsel, Gesundheits-/Schildänderungen, mögliche Munitionsauffüllungen und zusammenhängende Kampfphasen. Bildsprünge unterbrechen die zeitliche Zuordnung; Minimap-Rotation und Zoom werden nach Möglichkeit verworfen.
- **Konkrete Review-Fragen:** Verknüpfte Signale weisen auf Bewegung bei Ressourcenverlust, Munitionsauffüllung unter Druck oder niedrige Gesundheit in Kampfphasen hin. Jeder Befund enthält Videozeiten, Messwerte, Herkunft und Grenzen.
- **Squad-Review:** Timeline-Filter, Bestätigen/Verwerfen, eigene Momente für Positionierung, Rotation, Ressourcen und Entscheidungen, Bearbeiten/Löschen eigener Markierungen, zeitgestempelte Notizen, Clips mit Vor-/Nachlauf.
- **Manuelle Antwortintervalle:** „Gegner sichtbar“ und „erster Schuss“ markieren und ihre Zeitdifferenz vergleichen. Das ist kein automatisch gemessener kognitiver Reaktionswert.
- **Speicherung und Export:** SQLite, Rohbeobachtungen als JSON, JSON-Bericht und ZIP mit Markdown-Bericht, Ereignissen, Profil, Notizen und Rohbeobachtungen. Videos und Clips werden separat heruntergeladen. Aufnahmen lassen sich mit allen zugehörigen Daten löschen.

**Genauigkeit:** Die Software ist funktional getestet, aber noch nicht auf echtem Apex-Gameplay evaluiert. Automatische Ereignisse sind heuristische Review-Kandidaten, keine verifizierte Telemetrie oder automatisch bewiesenen Fehler. Sie erkennt nicht zuverlässig die Spielidentität, Gegner, Weltkoordinaten, Ringzustand oder Deckung. Keine erfundenen Match-Scores, vollständigen Schadensbilanzen oder taktischen Gewissheiten. Keine Analyse während einer laufenden Aufnahme.

## Website im Browser — empfohlen für dein MacBook

Die neue GitHub-Pages-Fassung benötigt auf dem Mac keine Docker-, Python- oder App-Installation. Die Texterkennung lädt beim Öffnen der Website automatisch. Videos, Notizen und Analyse laufen lokal im Browser, ohne Upload an einen Analyse-Server. Eine kalibrierte Demo ist per Knopfdruck verfügbar.

Veröffentlichung und vollständige Hinweise: [GitHub-Pages-Anleitung](docs/github-pages.md). Die Website wird aus `browser/` und der gemeinsamen Oberfläche gebaut. **Website: https://vieto1.github.io/Apex-Legends-Coach-/**. GitHub hat Build und Deployment erfolgreich abgeschlossen: [Veröffentlichungsnachweis](https://github.com/vieto1/Apex-Legends-Coach-/actions/runs/41932147126).

**Unterschiede:** Direkt unterstützte Browser-Codecs statt universeller FFmpeg-Konvertierung; Clip-Export im Vordergrund und in Echtzeit bis zwei Minuten. Speicherung nur in diesem Browserprofil. Die Website selbst ist öffentlich, deine Videos werden nicht an GitHub gesendet. Keine auf echten Apex-Matches validierte taktische KI.

## Alternative: lokale Python-/Docker-Version

Das vollständige Startpaket enthält `Start-Cossas-KI.cmd` für Windows und `start-local.sh` für macOS/Linux. Mit laufendem Docker Desktop bzw. Docker mit Compose übernimmt es Installation und Start der benötigten Programme. [Kurzanleitung](SO-STARTEN.md).

```bash
docker compose up -d --build --wait
```

Python, FFmpeg, OCR und Laufzeitabhängigkeiten sind im Image enthalten. Das persistente Volume `cossas-ki_reviews` speichert die Daten. Die Anwendung läuft im Container ohne Root-Rechte und ist nur über die lokale Loopback-Portfreigabe erreichbar. Keine privaten Entwicklungsdaten werden ins Image kopiert. Nach dem Start kann **Beispiel ausprobieren** ein vollständig kalibriertes synthetisches Beispiel anlegen.

## Start ohne Docker

Python 3.12, FFmpeg/ffprobe und Tesseract 5 mit englischen OCR-Daten benötigen Zugriff über PATH. Auf Debian/Ubuntu: `sudo apt-get install ffmpeg tesseract-ocr tesseract-ocr-eng`. In der eingerichteten Cloud-Umgebung sind diese Programme vorhanden.

```bash
cd /workspace/Apex-Legends-Coach-
python -m venv .venv
.venv/bin/pip install -r requirements.txt
./scripts/start.sh
```

Die Oberfläche ist lokal unter `http://127.0.0.1:8000` erreichbar. Alternativ direkt:

```bash
.venv/bin/uvicorn apexcoach.app:app --host 127.0.0.1 --port 8000
```

Nur **einen Worker** verwenden. Eine Analyse läuft gleichzeitig, maximal vier Jobs werden angenommen. `APEX_PORT` steuert den Port im Startskript; `APEX_DATA_DIR` ein anderes Datenverzeichnis. Bildschirmaufnahme braucht einen unterstützten Browser (z. B. Chrome/Edge), localhost oder HTTPS und die ausdrückliche Quellenfreigabe. Nicht jeder Browser bietet Systemaudio an; Mikrofonaufnahme ist nicht implementiert. OBS-Aufnahmen lassen sich immer als Datei importieren.

Die Anwendung hat bewusst keine Nutzerkonten. Standardmäßig bindet sie nur an Loopback. Freunde können gemeinsam am Rechner reviewen und Berichte/Clips austauschen. Entfernter Mehrbenutzerzugriff oder öffentliches Hosting sind nicht Teil dieses privaten Betriebsmodells.

## Ein Gameplay auswerten

1. Datei auswählen oder **Bildschirm / Spielfenster aufnehmen** starten. Nach dem Beenden liegt die Aufnahme im Dateifeld bereit; optional direkt lokal speichern.
2. **HUD kalibrieren** öffnen, zu einem gut lesbaren Zeitpunkt gehen und **Aktuelles Bild kalibrieren** wählen.
3. Ziffern des **kumulierten Schadenszählers** markieren, nicht Kill-Zähler oder schwebende Trefferzahlen. Minimap ohne Rand/Icons, Gesundheits-/Schildbalken nur innen und Magazinzahl ohne Reservemunition markieren. Nicht benötigte Bereiche bleiben unbekannt.
4. Profil bei Bedarf speichern und **Aufnahme analysieren** wählen. Fehlende OCR-Werte bleiben unbekannt; der Fortschritt erscheint in der Aufnahmeliste.
5. Momente im Originalvideo prüfen, Befunde bestätigen oder verwerfen und eigene Beobachtungen hinzufügen. Zeitfenster sind anklickbar; Clips enthalten 3 s Vorlauf und 4 s Nachlauf.
6. Bei schlechten Ergebnissen **Diese Aufnahme kalibrieren** und **Mit aktuellem HUD-Profil neu analysieren** nutzen. Automatische Befunde und deren Bewertungen werden ersetzt; eigene Markierungen und Notizen bleiben erhalten. Ein Neustart markiert unterbrochene Jobs als fehlgeschlagen; sie lassen sich genauso erneut starten.
7. JSON oder Berichtarchiv exportieren, Clips herunterladen und mit Freunden besprechen. **Aufnahme löschen** entfernt die lokale Aufnahme samt Original, normalisiertem Video, Clips, Befunden und Notizen nach ausdrücklicher Bestätigung.

Grenzen: 2 GiB pro Upload, 2 Stunden, maximal 3840×2160. Browser-Aufnahmen stoppen spätestens nach zwei Stunden bzw. vor rund 1,9 GiB und belegen bis dahin Arbeitsspeicher. Große Dateien benötigen zusätzlich Platz für Original, Konvertierung und Clips. Keine automatische Löschung. Nur eigene vertrauenswürdige Mediendateien verarbeiten. Bei Wechsel von HUD, Sprache, Auflösung oder Spectator-Sicht sind getrennte Aufnahmen und passende Profile sinnvoll.

## Architektur und Stack

FastAPI liefert API und statische Oberfläche ohne Frontend-Build. SQLite spart einen Datenbankdienst. OpenCV verarbeitet Frames und Minimap-Bewegung; das offene Tesseract-Modell liest HUD-Ziffern lokal. Keine GPU, externe API, API-Schlüssel oder Modell-Downloads im Betrieb erforderlich. Die Empfehlungslogik besteht aus überprüfbaren Regeln und verwendet kein Sprachmodell.

```text
apexcoach/
  app.py          Upload, Job-Warteschlange, Review-/Profil-/Export-API
  pipeline.py     Konvertierung, 1-Hz-Sampling, Analyse, Wiederholungsanalyse
  vision.py       Perception-Schnittstelle, OCR, Balken, Minimap-Bewegung
  domain.py       Ereignisse, Kampfphasen, kontextbezogene Review-Fragen
  review.py       Manuelle Antwortintervalle und portabler Markdown-Bericht
  store.py        SQLite, additive Schemamigration, Status, Wiederanlauf
  static/         Aufnahme, Kalibrierung, Player, Timeline, Review
scripts/
  start.sh        Start mit Prüfung der Systemprogramme
  demo.py         Synthetische HUD-Aufnahme und Kalibrierungsprofil
  browser-smoke.cjs Optionaler Browser-Test mit künstlicher Videoquelle
tests/            Regeln, Wahrnehmung, vollständige API-/Video-Abläufe
docs/             Architektur, API, Validierung und REA-Nachweis
```

[Architektur und Erweiterung](docs/architecture.md) · [API](docs/api.md) · [Validierung](docs/validation.md)

## Ereignisregeln und Grenzen

| Typ | Erkennung | Grenze |
| --- | --- | --- |
| `combat_start` | Plausibler Schadenszuwachs nach >8 s ohne erkannten Zuwachs | Kein Kampf ohne verursachten Schaden erkennbar. |
| `damage_delta` | Zwei OCR-Werte mit Konfidenz ≥0,65, Abstand ≤3 s, Zuwachs 1–300 | OCR-Fehler bleiben möglich; Lücken, Rücksprünge und große Sprünge zählen nicht. Kein eingehender Schaden in Punkten. |
| `position_change` | ≥3 aufeinanderfolgende Minimap-Samples mit Bewegung >1,8 px auf 160×160 | Feature-Tracking und RANSAC unterdrücken erkennbaren Zoom/Rotation; keine Weltposition oder sichere Routenbewertung. |
| `resource_loss`, `resource_recovery` | Sichtbarer Balkenfüllstand ändert sich um ≥15 Prozentpunkte | Relative Farbbelegung, keine exakten HP; leere/verdeckte Balken unbekannt. Heilung und Schildwechsel nicht unterscheidbar. |
| `ammo_refill` | OCR-Magazinzahl steigt um ≥5 | Nachladen, Waffenwechsel und Magazinwechsel nicht unterscheidbar. |
| `fight` | Schaden-/Ressourcenverlustsignale mit höchstens 8 s Abstand gruppiert | Unvollständige Kampfphase; Ausgang, Gegnerzahl und genaue Bilanz unbekannt. |
| `exposure_review`, `reload_pressure`, `low_health_fight` | Zeitlich verknüpfte Messsignale | Konkreter Prüfpunkt; keine bewiesene Fehlentscheidung oder Kausalität. |

1-Hz-Sampling bedeutet ungefähr sekundengenaue automatische Zeitfenster und verpasst kurze Ereignisse. OCR-/Heuristik-Prozentwerte sind **nicht statistisch kalibrierte Wahrscheinlichkeiten**. Angezeigter Schaden ist nur die Summe beobachteter, nicht verworfener Zuwächse und keine verlässliche Match-Gesamtsumme. Qualitätshinweise zeigen, in welchem Anteil der Samples der Counter lesbar war.

## Minimales Datenmodell

- `matches`: ID, Name, Status, Dauer, Fortschritt, Fehler, Profil, automatische Analysezusammenfassung, Erstellungszeit.
- `events`: ID, Match-Fremdschlüssel; JSON mit Typ, Start/Ende, Titel, Messbelegen, Empfehlung, Konfidenz; bei eigenen Markierungen `origin=manual`; Review `unreviewed/confirmed/dismissed`.
- `notes`: ID, Match-Fremdschlüssel, Videozeit, Text, Erstellungszeit.
- `profiles`: ID, Name, wiederverwendbares HUD-Profil als JSON.
- `data/<id>/`: Original `source`, browserfähiges `video.mp4`, `observations.json`, Vorschau und erzeugte Clips.

## Tests und Demo

```bash
.venv/bin/python -m pytest -q
.venv/bin/python scripts/demo.py
```

Für die Tests vorher `.venv/bin/pip install -r requirements-dev.txt` ausführen. Laufzeit- und Testabhängigkeiten sind getrennt.

Die 15-s-Demo enthält synthetische Zahlen (100 → 145 → 190), Balkenänderungen, Magazinzahl und bewegte Textur. Sie ist ausdrücklich **kein echtes Apex-Match**. Das Skript schreibt `data/demo.mp4` und `data/demo.profile.json`. Optionaler HTTP-Upload bei laufendem Server:

```bash
curl -F 'file=@data/demo.mp4' \
  -F 'profile=<data/demo.profile.json' \
  http://127.0.0.1:8000/api/matches
```

Der optionale Browser-Test benötigt Node.js, Playwright (`npm install --prefix /tmp/apex-browser-test playwright`, danach `NODE_PATH=/tmp/apex-browser-test/node_modules`) und Chromium. Diese Werkzeuge sind keine Laufzeitabhängigkeiten der Anwendung. In dieser Cloud-Umgebung sind sie bereits vorhanden:

```bash
node scripts/browser-smoke.cjs
```

Er verwendet einen künstlichen Canvas-Videostream anstelle deines echten Bildschirms, testet den Aufnahme-/Upload-/Review-/Export-/Löschablauf und entfernt seine eigenen Testdaten. `APEX_TEST_URL` und `CHROMIUM_PATH` sind überschreibbar. Manuelle Quellenfreigabe und echtes Systemaudio bleiben browser-/betriebssystemspezifisch.

## Modelle austauschen und reale Qualität messen

`vision.Perception.observe(frame, timestamp) -> Observation` ist die Schnittstelle. `pipeline.analyze(..., perception_factory=MeinAdapter)` akzeptiert einen eigenen lokalen Detektor, etwa ein selbst trainiertes ONNX-HUD-Modell. Fehlende Werte bleiben `None`. Tesseract-Gewichte stammen aus der Systeminstallation. Neue Detektoren sollen Zeitbezug, Herkunft und geprüfte Konfidenzen liefern; UI und Speicherung bleiben unabhängig vom Modell.

Exportierte manuelle Markierungen und bestätigte/verworfene Befunde können beim Aufbau eines gelabelten Apex-Datensatzes helfen; ungeprüfte automatische Events sind keine Ground Truth. Für eine belastbare automatische Coaching-Aussage sind echte Aufnahmen, annotierte Zeitfenster und Precision/Recall je HUD-/Ereignistyp nötig. Gegner-/Deckungsmodelle, Welt-/Ringkoordinaten und automatische kognitive Reaktionszeitmessung sind nicht implementiert. Diese Fähigkeiten lassen sich nicht aus einer synthetischen Demo oder unbekanntem proprietären Modell ableiten.

## REA

REA 6.8.0 analysierte die eigene JavaScript-Oberfläche, zuletzt mit 10 Graphknoten ohne Integrity-Kontradiktionen. Die Referenzseite lieferte HTTP 403; ihre internen Modelle oder Funktionen wurden nicht reverse-engineert. [Nachweis und Wiederholungsbefehl](docs/rea-review.md).

## Auslieferung und Offline-Prüfung

`scripts/package.py` erstellt `artifacts/Cossas-KI.zip` mit Startdateien, Quellcode, Tests und Anleitung sowie einem SHA-256-Manifest. Private Daten, `.venv`, `.git`, Caches und Zugangsdaten werden nicht aufgenommen.

```bash
.venv/bin/python scripts/package.py
# Mit gebautem Docker-Image vollständige Analyse ohne Netzwerk prüfen:
docker run --rm -i --network none cossas-ki:local python - < scripts/offline-smoke.py
```

Die Windows-Batchdatei öffnet die Website nach erfolgreichem Docker-Healthcheck. Docker muss auf dem jeweiligen Rechner installiert und gestartet sein; diese Cloud-Sitzung kann keine Programme auf deinem privaten PC installieren. Die Batchdatei wurde hier unter Linux nicht nativ ausgeführt; dieselben Compose-Befehle und der Container wurden praktisch geprüft.

## Gestaltung von Cossa's KI

Die Website bietet eine eigenständige, anime-inspirierte Bildwelt mit rotem Mond, leuchtendem Observatorium, großem überlagertem Schriftzug, Gras und roten Blättern. Vier Kapitel führen von der Szene in Analyse, Archiv und Squad-Review. Scroll-Parallax, dezente Partikel und weiche Interaktionen respektieren reduzierte Bewegung; die Schriften liegen lokal. [Dateistruktur, Bewegung und Barrierefreiheit](docs/design.md).

Bereits gespeicherte Browserdaten bleiben durch kompatible interne Speicherkennungen erhalten. Auch die bestehende GitHub-Adresse bleibt unverändert.
