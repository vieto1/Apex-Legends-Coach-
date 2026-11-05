# Validierung des fertigen lokalen Review-Ablaufs

## Automatisierte Tests

`.venv/bin/python -m pytest -q`: **27 bestanden**, keine fehlgeschlagenen oder übersprungenen Tests. Eine nicht blockierende DeprecationWarning kommt aus Starlette/AnyIO. `.venv/bin/pip check`: keine defekten Abhängigkeiten.

Geprüft werden:

- Counter-Deltas, OCR-Lücken, unplausible Sprünge, Rücksprünge und zeitliche Lücken.
- Kampf-Debounce, Bewegung über mehrere Samples, Unterbrechung bei Bildschnitten.
- Relative Gesundheits-/Schildänderungen, Munitionsauffüllung, Kampfphasen und kontextbezogene Review-Punkte.
- Echte Tesseract-OCR, Balkenmessung und Unterdrückung rotierender Minimap-Texturen.
- Vollständige 15-s-HUD-Demo mit sieben grundlegenden Ereignistypen und insgesamt 90 abgelesenen Schadenspunkten.
- Upload, H.264/AAC-Konvertierung, Audio-Erhalt, Range-Wiedergabe und tatsächliche Clip-Kodierung.
- WebM ohne Dauer-Header, wie es der Browser-Recorder erzeugt.
- Notizen, Profile, eigene Markierungen, Bearbeiten, Bestätigen/Verwerfen, Exportarchiv und Löschen.
- Erhalt eigener Markierungen und Notizen bei erneuter Analyse.
- Ungültige Profile/Videos/Zeitfenster, fehlende IDs, Neustart unterbrochener Jobs und Ablehnung konkurrierender Lösch-/Analyseaktionen.
- Ablehnung schreibender Browser-Anfragen mit fremdem Origin.
- Uploadgrenzen vor dem Multipart-Parsing und für Requests ohne Größenangabe.
- Wiederherstellung nach fehlgeschlagener Konvertierung, ungerade Videoabmessungen und Warteschlangenfehler ohne verwaiste Aufnahmen.
- Ein-Klick-Demo ohne manuelle Kalibrierung, einzelne OCR-Zeitüberschreitungen als dokumentierte unbekannte Samples.
- Auslieferungsarchiv mit geprüften SHA-256-Prüfsummen ohne private Daten.

## Echter Browser

`node scripts/browser-smoke.cjs` gegen den lokalen Server mit Headless Chromium. Der Test nutzt einen **synthetischen Canvas-Stream**, keinen Zugriff auf einen echten Bildschirm. Er prüft den realen MediaRecorder-Code der Anwendung, Upload, Kalibrierung, Profil speichern, eigene Zeitmarken, Bearbeiten, Review-Status, erneute Analyse, Erhalt der Notizen, ZIP-Download, Video-Dekodierung und Löschen seiner eigenen Testaufnahme. Desktop (1360 px) und Mobilansicht (390 px) wurden geprüft: keine JavaScript-Laufzeitfehler, kein horizontales Overflow.

Die interaktive Betriebssystem-Quellenfreigabe und echtes Systemaudio sind browser-/betriebssystemspezifisch und wurden nicht mit einer echten Apex-Sitzung getestet. Audio-Erhalt einer hochgeladenen Datei ist separat durch FFmpeg/ffprobe abgesichert.

## Eigenständige Auslieferung

Das Docker-Image wurde mit den echten Systemprogrammen gebaut und als unprivilegierter Benutzer gestartet. Docker Compose meldet den Container als **healthy**. Der vollständige Browser-Test wurde auch gegen diesen Container ausgeführt. Das Entwickler-Setup und das Container-Setup verwenden getrennte Datenverzeichnisse; private Entwicklungsaufnahmen wurden nicht ins Image übernommen.

Die vollständige synthetische HUD-Analyse wurde zusätzlich mit `docker run --network none` geprüft: erfolgreich, alle grundlegenden Ereignistypen und 90 beobachtete Schadenspunkte. Für CPU-begrenzte Rechner sind OCR auf einen OpenMP-Thread und OpenCV auf zwei Threads begrenzt. Ein einzelner OCR-Timeout verwirft nur den betroffenen Messwert und erscheint mit Zeitstempel in den Rohbeobachtungen sowie als Anzahl in der Qualitätsanzeige.

Der Linux-Start und die Docker-Compose-Befehle wurden praktisch ausgeführt. Die Windows-Batchdatei wurde in dieser Linux-Umgebung nicht nativ ausgeführt. Sie nutzt dieselben geprüften Compose-Befehle und öffnet nach erfolgreichem Healthcheck den lokalen Browser. Docker Desktop muss auf dem Nutzerrechner laufen.

## REA

REA 6.8.0 analysierte die eigene JavaScript-Oberfläche statisch. Die erweiterte Version ergab 10 Graphknoten ohne Integrity-Kontradiktionen. Das ersetzt weder Browser-Tests noch die Qualitätsmessung der Bildanalyse.

## Aussagegrenzen

Keine echte Apex-Aufnahme lag vor. Precision, Recall, Fehlalarmrate und taktische Richtigkeit auf echtem Gameplay sind nicht validiert. Die synthetische Demo ist ein Integrationstest, kein Benchmark für echte Matches. OCR kann trotz Konfidenz falsche Ziffern liefern; Balkenmessung und Kartenbewegung bleiben empfindlich gegenüber HUD-Änderungen und Verdeckung. Leere Balken gelten bewusst als unbekannt. Prozentwerte sind keine kalibrierten Wahrscheinlichkeiten.

Keine Spielspeicher-/Netzwerktelemetrie, keine vollständige Schadensbilanz in HP, keine automatische Messung kognitiver Reaktionszeit, keine trainierte Deckungs-/Entscheidungsbewertung und keine Echtzeitanalyse während der Aufnahme.

## Browserfassung und GitHub Pages

Zusätzlich bestehen sieben reine JavaScript-Ereignistests (`npm test`). Die Browserfassung wurde mit echter WebAssembly-OCR auf statischem Hosting ohne Python-Backend geprüft, einschließlich GitHub-Projektunterpfad. Demo-Schadenszuwachs: 90, Zähler vollständig lesbar. Profile, lokale Notizen, eigene Markierungen, Review, Neuladen, erneute Analyse, ZIP und Clip-Export erfolgreich. Netzwerkprüfung: nur GET an dieselbe Website, kein Video-Upload.

Ein separater Browser-Test prüft lokale Bildschirmaufnahme mit einer künstlichen Canvas-Quelle, lesbare WebM-Dauer und Schutz vor Bearbeitung in zwei Tabs. Die benötigten Browserfunktionen wurden unter Chromium geprüft; Safari wurde auf dieser Linux-Maschine nicht nativ ausgeführt.

Die Website wurde auf GitHub veröffentlicht. Der echte Pages-Workflow bestätigt Build und Deployment für `3bc8b6d`: https://github.com/vieto1/Apex-Legends-Coach-/actions/runs/41932147126. Sie ist unter https://vieto1.github.io/Apex-Legends-Coach-/ vorgesehen und laut GitHub erfolgreich bereitgestellt. Der direkte Abruf dieser Domain ist aus der Cloud durch die Netzwerkrichtlinie gesperrt; die Veröffentlichung wurde anhand des GitHub-Status geprüft.

## Cossa's KI — Design und Rebranding

Die neue Hero-Szene und die Kapitelstruktur sind mit eigener SVG-Illustration, selbst gehosteten WOFF2-Schriften, Parallax und sanften Interaktionen implementiert. Die vorherige Produktbezeichnung ist aus Titeln, Navigation, Metadaten, Texten, Downloads und Startdateien entfernt. Dauerhafte Speicherkennungen bleiben kompatibel; die Browserprüfung lädt eine zuvor gespeicherte Aufnahme samt Notiz erfolgreich wieder.

`scripts/design-smoke.cjs` prüft vier Kapitel, funktionierende mobile Navigation und Escape-Fokus, Parallax, Bewegungspause, `prefers-reduced-motion`, Fokus nach automatischer Aktualisierung und Layoutbreiten 320/360/390/768/1024/1440 px. Automatisierte Axe-Prüfungen nach WCAG A/AA und WCAG 2.1 AA melden auf Desktop und Mobil keine Verstöße. Text wird bei Kapitel-Eintritten nicht abgedunkelt; ein dunkler Grund der fixierten Navigation hält ihren Kontrast auch während des Scrollens stabil.

Die vollständigen Browserabläufe mit OCR, Notizen, Profilen, Review, erneuter Analyse, ZIP-/Clip-Export und Aufnahme sind im neuen Layout erfolgreich. 27 Python-Tests und sieben JavaScript-Regeltests bestehen weiterhin; Clip- und Paketnamen wurden zusätzlich gezielt geprüft. Keine JavaScript-Laufzeitfehler. Die optische Gestaltung wurde anhand von Desktop- und Mobil-Screenshots kontrolliert.
