# Cossa's KI — visuelle Umsetzung

Die neue Gestaltung übernimmt die Bildhierarchie der bereitgestellten Referenz: dunkle, ruhige Szene, roter Vollmond, leuchtendes Zentrum, großer heller Schriftzug hinter einem grasbewachsenen Vordergrund und rotes Laub. Die eigenständig gezeichnete Architektur ist ein stilisiertes Signal-Observatorium; Kyoto-Inhalte und fremde Marken wurden nicht übernommen.

## Struktur

- **01 / Entdecken:** Vollbild-Szene, Kapitel 00, „Scroll to enter“, Einstieg in die Analyse.
- **02 / Analysieren:** Aufnahme, Demo, Kalibrierung und lokale Auswertung.
- **03 / Archiv:** Gespeicherte Aufnahmen und Suche.
- **04 / Squad:** Player, belegte Timeline, Review, Clips und Notizen.

## Dateien

```text
apexcoach/static/
  index.html                 Semantische Kapitel und unveränderte Analyse-Steuerelemente
  style.css                  Dunkle Farbwelt, responsives Layout und weiche Übergänge
  cossa-motion.js            Scroll-Parallax, Kapitelstatus, mobile Navigation, Bewegungspause
  cossa-sky.svg               Himmel und gestaffelte Hügel
  cossa-sanctum.svg           Eigenes leuchtendes Signal-Observatorium
  cossa-foreground.svg        Gras und rotes Laub vor dem Schriftzug
  cossas-ki-social.png        Eigene Vorschau für Open Graph / Linkfreigaben
  fonts/                     Lokal bereitgestellte Schriften samt OFL-Lizenzen
```

Manrope prägt die moderne, weite Typografie; Bebas Neue setzt kompakte Marken- und Zahlenakzente. Keine externen Schrift- oder Bilddienste im Betrieb.

## Bewegung und Performance

Scrollen bleibt vollständig nativ. Passive Scroll-Listener bündeln Transform-Updates in `requestAnimationFrame`; außerhalb der Hero-Szene werden Updates und dekorative Animationen pausiert. Vier Ebenen erzeugen räumliche Tiefe. Dreizehn Blätter und langsame Licht-/Nebelbewegung liefern die Anime-Akzente ohne dauerhaft laufenden JavaScript-Renderloop. Hover- und Klickreaktionen nutzen weiche Easing-Kurven. Die Bildwelt besteht aus skalierbaren SVGs; Fonts sind selbst gehostete WOFF2-Dateien.

`prefers-reduced-motion: reduce` deaktiviert Parallax, Blätter, weiches Scrollen und Übergangsanimationen. Ein zusätzlicher Schalter pausiert die dekorative Bewegung. Inhalt bleibt ohne Animationsskript sichtbar.

## Barrierefreiheit und Daten

Skip-Link, semantische Navigation, vier beschriftete Kapitel, sichtbare Tastaturfokusse, Escape-Steuerung im mobilen Menü und beschriftete Eingabefelder. Das automatisierte WCAG-A/AA-Audit auf Desktop und Mobil meldet keine Verstöße; dies ersetzt keine vollständige manuelle Prüfung mit allen assistiven Technologien.

Die Marke wurde in Titeln, Metadaten, Navigation, Texten, Exporten, Startdateien und Paketnamen auf **Cossa's KI** umgestellt. Persistente Datenbank- und Sperrkennungen bleiben intern kompatibel, damit bereits gespeicherte private Aufnahmen und Notizen nicht verloren gehen. Der bestehende GitHub-Website-Pfad bleibt ebenfalls unverändert.

## Prüfung

```bash
npm ci
npm test
npm run build
# statischer Server auf dem gewünschten Port, z. B. 8789
python -m http.server 8789 --directory dist
APEX_PAGES_URL=http://127.0.0.1:8789 node scripts/design-smoke.cjs
APEX_PAGES_URL=http://127.0.0.1:8789 node scripts/pages-smoke.cjs
APEX_PAGES_URL=http://127.0.0.1:8789 node scripts/pages-recording-smoke.cjs
```

Die Browserprüfungen benötigen Chromium/Playwright als Entwicklungswerkzeuge; die veröffentlichte Website benötigt keine App-Installation.
