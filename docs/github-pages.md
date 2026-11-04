# GitHub-Website für MacBook und andere Rechner

Die Browserfassung in `browser/` verarbeitet Aufnahmen direkt im Browser. GitHub Pages liefert nur HTML, JavaScript, WebAssembly und das englische OCR-Modell. Es gibt keinen Analyse-Server und keine API-Schlüssel. Tesseract.js ist die lokale OCR-Engine, IndexedDB speichert die eigenen Videos, Profile, Ereignisse und Notizen. Die Python-/Docker-Version bleibt als Alternative vorhanden.

## Veröffentlichung

Repository: `vieto1/Apex-Legends-Coach-`. Das Build-Skript erzeugt `dist/` und berücksichtigt den Unterpfad einer GitHub-Projektwebsite. Der Branch `gh-pages` enthält ausschließlich die gebaute Website, öffentliches OCR-Modell, Lizenzen und eine ausdrücklich synthetische Demo, keine privaten Aufnahmen.

Der Workflow `.github/workflows/pages.yml` testet und baut Änderungen auf `main`, aktualisiert `gh-pages` und fordert bei aktivierten Pages einen neuen Build an. Wenn GitHub die erste Aktivierung nicht automatisch übernimmt, muss ein Repository-Administrator einmal unter **Settings → Pages → Deploy from a branch → gh-pages → /(root)** speichern. Die Standardadresse ist anschließend `https://vieto1.github.io/Apex-Legends-Coach-/`. Eine bestätigte Git-Veröffentlichung allein beweist nicht, dass Pages aktiviert oder die öffentliche Adresse erreichbar ist.

Die erstmalige Pages-Aktivierung braucht Administrationsrechte. Der normale Actions-Token darf sie laut offizieller `actions/configure-pages`-Dokumentation nicht eigenständig durchführen. Die Cloud-Umgebung kann Git lesen/schreiben, aber die GitHub-REST-API ist durch die Netzwerkrichtlinie blockiert; das ist kein Beleg für fehlende Git-Berechtigung. Nie Tokenwerte in Chat, Dateien oder Workflowcode schreiben.

## Nutzung

Website öffnen, kurz die automatische Vorbereitung der Texterkennung abwarten und **Beispiel ausprobieren** oder ein eigenes Video auswählen. Keine Docker-, Python- oder App-Installation auf dem Mac erforderlich. Ein aktueller Chrome oder Edge ist empfohlen. Safari wird durch standardisierte Browser-APIs unterstützt, wurde in dieser Linux-Umgebung jedoch nicht nativ geprüft.

Die erste Seite lädt ungefähr einige Megabyte für die tatsächlich unterstützte WebAssembly-Engine und die OCR-Gewichte. Alles kommt von derselben Website; es werden keine Videos oder Notizen an GitHub oder Drittanbieter gesendet. Der vollständige Modellkatalog im Build ist größer, geladen wird nur die zum Browser passende Variante.

## Funktionsumfang

Aufnahme/Dateiauswahl, Kalibrierung, gespeicherte HUD-Profile, OCR-/Balken-/Bewegungsanalyse, Kampfphasen und Review-Fragen, Bestätigen/Verwerfen, eigene bearbeitbare Markierungen, Notizen, manuelle Antwortintervalle, Original-/JSON-/ZIP-Download und Clip-Aufnahme laufen lokal. Mit der Web-Locks-API wird paralleles Bearbeiten in zwei Tabs verhindert. Nach Schließen einer laufenden Analyse lässt sie sich erneut starten.

Browser-Clips werden im Vordergrund in Echtzeit aufgenommen, maximal zwei Minuten pro Clip. Audio hängt von den Browserfähigkeiten ab. MP4 mit H.264 und WebM werden direkt verarbeitet; andere Codecs benötigen vorab einen kompatiblen Export. Die Browserfassung konvertiert keine beliebigen Videoformate wie die FFmpeg-Version. Automatische Analyse nutzt weiterhin 1-Hz-Stichproben und heuristische HUD-Signale, keine trainierte taktische Bewertung.

**Aufbewahrung:** Daten liegen in diesem Browserprofil auf diesem Rechner. Löschen von Website-Daten, privates Browsen, Speicherbereinigung oder ein Wechsel des Geräts/der Website-Adresse können den Zugriff verlieren lassen. Benötigte Videos, Clips und Berichte exportieren. Kein synchroner Mehrbenutzerdienst; Freunde besprechen exportierte Dateien oder reviewen gemeinsam am Rechner. Die Website selbst ist öffentlich erreichbar, die eigenen Aufnahmen werden nicht veröffentlicht.

## Entwicklung und Prüfungen

```bash
npm ci
npm test
npm run build
python -m http.server 8787 --directory dist
node scripts/pages-smoke.cjs
node scripts/pages-recording-smoke.cjs
```

Die Browser-Smoketests benötigen Playwright/Chromium nur für die Entwicklung. Sie prüfen echte lokale WebAssembly-OCR, 90 Schadenszuwachs in der synthetischen Demo, Persistenz über Neuladen, Notizen, Profile, Review, erneute Analyse, ZIP- und Clip-Export, die Dauer einer Browser-Aufnahme und Mehr-Tab-Schutz. Netzwerkbeobachtung stellt sicher, dass nur GET-Anfragen an denselben Website-Host gehen. Das ist kein Precision-/Recall-Benchmark für echte Apex-Matches.
