# Lokale API

Keine Anmeldung; nur für lokalen privaten Betrieb. Alle Zeitangaben sind Sekunden im Video. JSON für schreibende Requests außer Multipart-Upload. Fehler verwenden HTTP 404/409/413/422/429/503 mit `detail`; schreibende Anfragen mit fremdem Browser-Origin werden mit 403 abgelehnt.

| Methode / Pfad | Zweck |
| --- | --- |
| `POST /api/demo` | Vollständig kalibrierte synthetische HUD-Demo anlegen; 202 |
| `GET /api/health` | Systemprogramme und Analyseversion |
| `GET /api/matches` | Aufnahmeübersicht und Jobfortschritt |
| `POST /api/matches` | Multipart `file` und optional `profile` (JSON); 202 mit ID |
| `GET /api/matches/{id}` | Aufnahme mit Events, Notizen, Zusammenfassung und Review-Metriken |
| `POST /api/matches/{id}/analyze` | HUD-Profil als JSON; erneute Analyse, 202 |
| `DELETE /api/matches/{id}` | Aufnahme und zugehörige Daten löschen, 204 |
| `GET /api/matches/{id}/video` | Normalisierte MP4; Range-Requests für Wiedergabe |
| `GET /api/matches/{id}/source` | Originaldatei herunterladen |
| `GET /api/matches/{id}/observations` | Zeitgestempelte Rohbeobachtungen |
| `GET /api/matches/{id}/report` | JSON-Bericht |
| `GET /api/matches/{id}/export` | ZIP: `report.md`, `report.json`, ggf. `observations.json`; keine Videos |
| `GET /api/matches/{id}/clips/{event-id}` | MP4-Clip mit 3 s Vorlauf / 4 s Nachlauf |
| `POST /api/matches/{id}/notes` | `{timestamp, body}`; 201 |
| `DELETE /api/matches/{id}/notes/{note-id}` | Notiz löschen, 204 |
| `POST /api/matches/{id}/events` | Eigene Markierung `{kind,start,end,title,advice}`; 201 |
| `PUT /api/matches/{id}/events/{event-id}` | Eigene Markierung bearbeiten; automatische Befunde nicht überschreiben |
| `PATCH /api/matches/{id}/events/{event-id}` | `{review:"unreviewed"\|"confirmed"\|"dismissed"}` |
| `DELETE /api/matches/{id}/events/{event-id}` | Befund löschen, 204 |
| `GET /api/profiles` | HUD-Profile |
| `POST /api/profiles` | `{name,profile}` speichern; 201 |
| `DELETE /api/profiles/{id}` | Profil löschen, 204 |

HUD-Profilfelder: `damage_roi`, `minimap_roi`, `health_roi`, `shield_roi`, `ammo_roi`. Jeder Wert ist `null` oder `[x,y,Breite,Höhe]` in relativen Koordinaten 0–1 innerhalb des Bildes. Unbekannte Felder und ungültige Rechtecke werden abgelehnt. `{}` deaktiviert automatische HUD-Auswertung; Video und manuelles Review funktionieren weiterhin.

Manuelle Ereigniskategorien: `manual`, `enemy_visible`, `first_shot`, `positioning`, `rotation`, `resources`, `decision`. Zeitfenster müssen geordnet und innerhalb der Aufnahme sein. Eigene Markierungen erhalten `origin=manual` und bleiben bei erneuter Analyse erhalten. Automatische Befunde werden erneuert und ihre Bewertungen zurückgesetzt.
