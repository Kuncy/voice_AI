# HeyVera Release-Checkliste

## Automatisches Gate

Vor dem Merge müssen lokal oder in GitHub Actions erfolgreich sein:

```sh
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm quality
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

Die Tests verwenden keine externen AI-Provider. PostgreSQL muss für die Integrationstests erreichbar sein.

## Demo vorbereiten

1. `.env.local` vollständig befüllen und `DATABASE_URL` für Host-Prozesse auf `localhost:5433` setzen.
2. `./scripts/compose-local.sh up -d postgres migrate` ausführen.
3. Optional `pnpm db:seed` ausführen, um reproduzierbare History- und Vorgangsdaten anzulegen.
4. `pnpm dev` starten und unter `/login` anmelden.
5. Prüfen, dass `/`, `/conversations`, `/requests` und `/settings` ohne Session zu `/login` führen.

## Demo-Drehbuch

### Schadensmeldung

1. „Hallo Vera, ich bin Erika Muster. Unter meinem Waschbecken tritt Wasser aus.“
2. Als Objektadresse „Musterstraße 12, 10115 Berlin“ nennen.
3. Verifizieren, dass Vera fehlende Angaben einzeln erfragt, die Dringlichkeit selbst ableitet und vor dem Speichern zusammenfasst.
4. Die Zusammenfassung ausdrücklich bestätigen.
5. Nach Gesprächsende unter `/requests` und in der Conversation-Detailansicht genau eine Schadensmeldung prüfen.

### Terminwunsch

1. „Ich brauche einen Termin zur Prüfung der Heizkörper.“
2. Name, vollständige Objektadresse und „Montagvormittag“ als gewünschten Zeitraum nennen.
3. Die Zusammenfassung ausdrücklich bestätigen.
4. Vera darf keine verbindliche Buchung behaupten, sondern nur eine gespeicherte Anfrage bestätigen.
5. Unter `/requests` einen Vorgang vom Typ „Termin“ mit „Montagvormittag“ prüfen.
6. In der Ursprungskonversation einen erfolgreichen `create_service_request`-Tool-Aufruf und denselben Zeitraum prüfen.

## Echter Voice-/Provider-Smoke-Test

1. Zwei normale deutsche Turns nacheinander führen und Transcript sowie hörbare Antworten prüfen.
2. Innerhalb eines Satzes ein bis zwei Sekunden pausieren; Vera darf nicht zuverlässig zu früh übernehmen.
3. Vera während einer längeren Antwort mit „Moment“ unterbrechen; Audio und gespeicherter gesprochener Text müssen korrekt enden.
4. Netzwerk kurz trennen und den SDK-Reconnect prüfen. Nach einem terminalen Abbruch muss der Reconnect dieselbe Conversation fortsetzen.
5. Einen Providerfehler simulieren oder mit ungültigen Test-Credentials in einer isolierten Umgebung prüfen; die UI darf keine internen Providerdetails zeigen.
6. Den Call regulär beenden und sicherstellen, dass keine Conversation dauerhaft `STARTING` oder `ACTIVE` bleibt.

## Coolify-Abnahme

1. Den exakten Release-Commit mit dem Docker-Compose-Build-Pack deployen.
2. Nur `web:3000` über eine HTTPS-Domain exponieren; Agent und PostgreSQL bleiben privat.
3. Prüfen, dass Migration und anschließend Web- sowie Agent-Healthcheck grün sind.
4. Login, Startseite und einen echten Voice-Call über die öffentliche Domain testen.
5. Schadensmeldung und Terminwunsch in PostgreSQL sowie über `/requests` verifizieren.
6. Einen geplanten `db:sweep`-Task und einen täglichen `db:prune`-Task konfigurieren.
7. PostgreSQL-Backupziel und Restore-Verfahren prüfen.
8. Während eines Agent-Redeployments sicherstellen, dass die konfigurierte Drain-Zeit laufende Calls nicht sofort beendet.

Ein Release ist erst freigegeben, wenn das automatische Gate und die für die Zielumgebung relevanten manuellen Checks dokumentiert erfolgreich sind.
