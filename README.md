# HeyVera

HeyVera ist eine deutschsprachige Voice-First-Anwendung auf Basis von LiveKit. Die Anwendung nimmt Schadensmeldungen, Terminwünsche und Nebenkostenanfragen per Sprache auf, speichert bestätigte Vorgänge in PostgreSQL und macht Conversations samt Tool-Aufrufen nachvollziehbar. Sämtliche App-Routen sind durch eine Admin-Anmeldung geschützt.

Die Voice-Pipeline verwendet LiveKit für Transport und Orchestrierung, das direkte Deepgram-Plugin für STT und TTS sowie das direkte OpenAI-Plugin für das LLM. Für Deepgram Flux STT und Aura‑2 TTS wird derselbe API-Key verwendet. LiveKit Inference und ElevenLabs sind im initialen Pfad bewusst nicht Bestandteil der Architektur, damit vorhandene Provider-Guthaben genutzt werden.

## Lokale Entwicklung

Voraussetzungen: Node.js 22+, pnpm 11, Docker und ein LiveKit-Cloud-Projekt.

1. `.env.example` nach `.env.local` kopieren, `APP_URL` auf die öffentliche Origin der Web-App setzen und die Provider-Werte, `POSTGRES_PASSWORD` sowie ein mindestens 32 Zeichen langes `SESSION_SECRET` setzen. Mit `pnpm auth:hash '<langes-admin-passwort>'` außerdem `ADMIN_PASSWORD_HASH` erzeugen.
2. `pnpm install` ausführen.
3. PostgreSQL und die Migration mit `./scripts/compose-local.sh up -d postgres migrate` starten.
4. Für Prozesse auf dem Host in `.env.local` `DATABASE_URL=postgresql://heyvera:<passwort>@localhost:5433/heyvera` setzen; alternativ Web und Agent vollständig über Compose starten.
5. Web und Agent gemeinsam mit `pnpm dev` starten.
6. `http://localhost:3000` öffnen und den Mikrofonzugriff erlauben. Die technische Liste liegt geschützt unter `/conversations`.
7. Unter `http://localhost:3000/login` mit `ADMIN_USERNAME` und dem zum Hash gehörenden Passwort anmelden. Danach kann Vera unter `/settings` konfiguriert werden; Änderungen gelten ab dem nächsten neu gestarteten Gespräch.

Ohne echte Credentials kann die UI deterministisch über `http://localhost:3000/?voiceTransport=fake` geprüft werden.

Für eine reproduzierbare Demo können nach der Migration zwei ausschließlich als Demo markierte Conversations angelegt werden:

```sh
pnpm db:seed
```

`pnpm db:reset-demo` entfernt nur die Conversations mit den festen Room-Namen `demo-damage-report` und `demo-appointment-request` samt abhängigen Datensätzen. Echte Conversations bleiben unberührt. Ein erneutes `pnpm db:seed` ersetzt die Demo-Daten idempotent.

## Architektur

- `apps/web`: Next.js-Oberfläche, Admin-Session, Voice-Session-Endpunkte und serverseitige History-/Settings-Seiten.
- `apps/agent`: langlebiger LiveKit-Worker für Deepgram STT/TTS, OpenAI und die fachlichen Tools.
- `packages/core`: Provider-unabhängige Schemas, Services, Prompt-Regeln und Conversation-Typen.
- `packages/db`: Drizzle-Schema, Migrationen und PostgreSQL-Repositories.
- `packages/config`: zentrale Zod-Validierung aller Runtime-Konfigurationen.

Der Browser erhält nur kurzlebige, minimal berechtigte LiveKit-Tokens. Fachliche Schreibvorgänge laufen transaktional und idempotent über den Agent-Worker. Jede Conversation speichert Agent- und Runtime-Snapshots, damit ältere Gespräche auch nach einer Einstellungsänderung reproduzierbar bleiben.

## Coolify

Das Repository wird als Docker-Compose-Service-Stack deployt. In Coolify:

1. Git-Repository als neue Docker-Compose-Ressource auswählen.
2. Nur dem Service `web` eine HTTPS-Domain auf Container-Port 3000 zuweisen.
3. `APP_URL` auf die öffentliche HTTPS-Origin setzen. `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `SESSION_SECRET`, `ADMIN_PASSWORD_HASH`, `DEEPGRAM_API_KEY`, `OPENAI_API_KEY` und `POSTGRES_PASSWORD` als Runtime-Secrets setzen. `ADMIN_USERNAME`, `LIVEKIT_AGENT_NAME`, `POSTGRES_DB` und `POSTGRES_USER` sind optional. `ADMIN_PASSWORD_HASH` wird mit `pnpm auth:hash '<passwort>'` erzeugt.
4. Den Agent-Service nicht öffentlich exponieren. Sein interner LiveKit-Healthcheck läuft auf Port 8081.
5. Das benannte Volume `postgres_data` sichern und in Coolify geplante PostgreSQL-Backups auf S3-kompatiblen Storage konfigurieren.
6. Für Production ein eigenes LiveKit-Projekt verwenden. Preview- und lokale Worker dürfen nicht dieselben Credentials verwenden.

Der Agent ist ein langlebiger Worker und keine serverless Function. Er öffnet ausgehend eine WebSocket-Verbindung zu LiveKit Cloud. `stop_grace_period: 11m` gibt laufenden Calls beim Deployment Zeit zum sauberen Abschluss.

`EMERGENCY` ist ausschließlich eine Dringlichkeitsstufe im gespeicherten Damage Report. HeyVera löst keinen Notruf aus und leitet keine Meldung automatisch weiter. Bei akuter Gefahr weist Vera zuerst auf das Verlassen des Gebäudes und den Notruf 112 hin; die Meldung ersetzt diesen Notruf nicht.

Die Compose-Datei verwendet Coolifys unterstützte `${VARIABLE:?}`-Syntax, Healthchecks und `exclude_from_hc` für den einmaligen Migrationsjob. Da `exclude_from_hc` eine Coolify-Erweiterung und kein Docker-Compose-Standardfeld ist, entfernt `scripts/compose-local.sh` ausschließlich dieses Feld für lokale Compose-Aufrufe. `docker-compose.local.yml` veröffentlicht lokal Web-Port 3000 und PostgreSQL-Port 5433; in Coolify bleiben beide privaten Services unveröffentlicht.

## Datenbankbetrieb

- `pnpm db:migrate` führt ausstehende Drizzle-Migrationen gegen `DATABASE_URL` aus.
- `pnpm db:sweep` markiert verwaiste `STARTING`/`ACTIVE`-Conversations nach Maximaldauer plus Reconnect-Karenz als `ABANDONED`.
- `pnpm db:prune` löscht ausschließlich terminale Conversations samt abhängigen Nachrichten, Tool-Aufrufen und Vorgängen, deren letzte Änderung länger als `DATA_RETENTION_DAYS` zurückliegt (Default: 90 Tage).
- Für Production sollte `pnpm db:sweep` mindestens alle fünf Minuten als geplanter Coolify-Task laufen.
- `pnpm db:prune` sollte in Production täglich als geplanter Task laufen. Einzelne Conversations können Admins zusätzlich in der Detailansicht löschen.
- Migrationen laufen im Compose-Stack vor `web` und `agent`; beide starten erst nach erfolgreichem Abschluss.

## Phase-1-Verifikation

- `pnpm typecheck`
- `pnpm build`
- `docker compose config` mit gesetzten Pflichtvariablen
- `GET /api/health`
- Manueller Smoke-Test: Browser verbindet sich, Mikrofontrack wird publiziert und der Agent erscheint in derselben Room.

## Phase-2-Verifikation

- `pnpm test` prüft Max-Dauer, Idle-Timeout, Max-Turns, Agent-State-Mapping und Session-Nachrichten.
- `pnpm typecheck` und `pnpm build` prüfen alle Workspace-Pakete.
- Der manuelle Voice-Gate besteht aus zwei aufeinanderfolgenden deutschen Turns, hörbarer Antwort und Live-Transkript.
- Strukturierte Logs `agent_voice_latency`, `agent_eou_metrics`, `agent_llm_metrics` und `agent_tts_metrics` machen die Zeit bis zum ersten Audio und die Provider-Latenzen messbar.
- `agent_barge_in_detected` weist eine erkannte Unterbrechung nach.

Session-Enden durch `MAX_SESSION_MS`, `IDLE_TIMEOUT_MS` oder `MAX_TURNS` werden dem Browser vor dem Disconnect zuverlässig übermittelt. Aura‑2 Viktoria ist die primäre Stimme; Aura‑2 Elara dient als automatischer Qualitäts-Fallback.

## Phase-3-Verifikation

- `pnpm test`, `pnpm typecheck` und `pnpm build` prüfen den gesamten Workspace.
- Der Datenbank-Integrationstest prüft Lifecycle, Reihenfolge und Idempotenz der finalen Messages sowie den `ABANDONED`-Sweeper. In CI ist `DATABASE_URL` Pflicht; ein Lauf ohne Datenbank muss mit `SKIP_DATABASE_INTEGRATION_TESTS=1` ausdrücklich freigegeben werden.
- Partielle Transkripte bleiben ausschließlich im Browser; nur finale User- und Assistant-Items gelangen in PostgreSQL. Fehlgeschlagene Intake-Schreibvorgänge werden nach einem Rollback bestmöglich als `FAILED`-Tool-Aufruf auditiert.
- Der Agent fängt Persistenzfehler pro Schreibvorgang ab, protokolliert sie strukturiert und lässt die Voice-Pipeline weiterlaufen.

## Phase-4-Verifikation

- `/settings` lädt und speichert Name, Tonalität und System-Prompt serverseitig in PostgreSQL; Deutsch bleibt in dieser Phase fest eingestellt. Die Seite und ihre Server-Action verlangen eine gültige Admin-Session.
- Zod validiert Formulareingaben und gespeicherte Snapshots. Nicht überschreibbare Sprach- und Sicherheitsregeln werden dem konfigurierbaren Prompt immer vorangestellt.
- Ein neues Gespräch speichert die zu diesem Zeitpunkt aktive Agent-Konfiguration als versionierten Snapshot. Der Agent lädt genau diesen Snapshot für den Voice-Job.
- Der Datenbank-Integrationstest belegt, dass eine Einstellungsänderung nur neue Gespräche betrifft.
- `pnpm test`, `pnpm typecheck`, `pnpm build` sowie ein Container-Neustart prüfen Verhalten, Build und Persistenz.

## Phase-5-Verifikation

- `create_damage_report` verlangt den Namen der meldenden Person, Kategorie, konkrete Beschreibung, Dringlichkeit sowie Straße/Hausnummer, PLZ und Ort des betroffenen Objekts und darf erst nach ausdrücklicher Bestätigung aufgerufen werden.
- Vera leitet die Dringlichkeit aus den geschilderten Fakten ab und fragt nicht nach einer technischen Stufe. Nur bei unklarer Auswirkung oder Gefahr stellt sie eine konkrete Rückfrage.
- Termin- und Nebenkostenanfragen lösen ausdrücklich keine Schadensmeldung aus, sondern werden als eigene strukturierte Vorgänge gespeichert.
- `create_service_request` speichert bestätigte Termin- und Nebenkostenanfragen als eigene Vorgänge. Ein Terminwunsch ist keine verbindliche Buchung; individuelle Abrechnungen werden ohne angebundene Fachdaten nicht beantwortet.
- `providerCallId` schützt den Schreibpfad gegen Wiederholungen. Tool Call und Damage Report werden gemeinsam in einer PostgreSQL-Transaktion gespeichert.
- Das Tool liefert ausschließlich strukturierte Erfolgs- oder Fehlercodes; Vera bestätigt Erfolg erst nach einem erfolgreichen Commit.
- Der Live-Status wird über `heyvera.tool-status` im Voice Screen als eigenes Badge angezeigt.
- Unit-Tests prüfen Validierung, stabile Results und Toolstatus. Der echte PostgreSQL-Integrationstest prüft Transaktion, Relation und Idempotenz.

## Phase-6-Verifikation

- `/conversations` verlinkt jede Session auf eine serverseitig geladene Detailansicht.
- Das Transcript wird nach persistierter Sequenz mit relativem Zeitstempel angezeigt; unterbrochene Assistant-Nachrichten sind markiert und der vollständig generierte Text bleibt optional aufklappbar.
- Tool Calls zeigen Argumente, Ergebnis, Status und Laufzeit. Verknüpfte Damage Reports zeigen Kategorie, Dringlichkeit, Beschreibung und Status.
- Agent-Name und Tonalität stammen aus dem unveränderlichen Conversation-Snapshot. Unbekannte Snapshot-Versionen werden mit Hinweis und Rohdaten dargestellt.
- Eigene Loading-, Empty-, Not-Found- und Error-Zustände halten die History auch bei fehlenden oder ungültigen Daten verständlich.
- Nach einer erfolgreichen Meldung fragt Vera, ob noch etwas offen ist. Bei einer klaren Verneinung spielt LiveKits `end_call`-Tool die Verabschiedung aus und beendet anschließend den Room.

## Intake-Erweiterung nach Phase 6

- Die Conversation-Detailseite zeigt das fachliche Ergebnis direkt oberhalb des Transkripts; technische Tool-Details bleiben weiter unten verfügbar.
- `/requests` fasst Schadensmeldungen, Terminwünsche und Nebenkostenanfragen in einer gemeinsamen Übersicht zusammen und verlinkt auf die jeweilige Conversation.
- Name und Objektadresse werden für alle neuen Vorgänge strukturiert gespeichert. Terminanfragen enthalten zusätzlich den gewünschten Termin oder Zeitraum.
- Schäden verwenden weiterhin `create_damage_report`; Termin- und Nebenkostenanfragen verwenden getrennt davon `create_service_request`.

## Phase-7-Verifikation

- LiveKit übernimmt kurze Netzwerkunterbrechungen automatisch und zeigt währenddessen einen verständlichen Reconnect-Zustand.
- Nach einem terminalen Transportabbruch fordert der Browser über `/api/voice-sessions/reconnect` einen frischen 120-Sekunden-Token für dieselbe Conversation und denselben Room an. Der Endpunkt verlängert das signierte Session-Handle nicht und verbindet nur, wenn Room und Agent noch aktiv sind.
- Abgelaufene Handles oder bereits abgeschlossene Conversations werden nicht wieder verbunden; der nächste Versuch startet bewusst eine neue Session.
- Finale Transkripte können nicht durch verspätete Partial-Updates überschrieben oder in der Live-Ansicht umsortiert werden. Unterbrochene Assistant-Nachrichten bleiben in der History markiert.
- Barge-in bleibt adaptiv aktiv. `INTERRUPTION_MIN_DURATION_MS` und `INTERRUPTION_MIN_WORDS` erlauben kontrolliertes Tuning ohne Codeänderung.
- Deepgram-EOT ist über `DEEPGRAM_EOT_THRESHOLD` und `DEEPGRAM_EOT_TIMEOUT_MS` konfigurierbar. Die Defaults `0.75` und `5000 ms` bleiben bis zum manuellen deutschen Voice-Smoke-Test unverändert.
- Strukturierte Latenzlogs enthalten Conversation-, Turn- und Korrelations-ID. Providerfehler unterscheiden Rate-Limits, Timeouts und sonstige Fehler, ohne interne Details im Browser offenzulegen.
- Deepgram-TTS verwendet weiterhin genau einen Retry pro TTS-Instanz und anschließend das konfigurierte Fallback-Modell.
- Initialer Connect und SDK-Reconnect warten höchstens zehn Sekunden auf den Agent; eine agentlose Room endet sichtbar als Fehler statt dauerhaft als „Vera hört zu“.

## Zugriffsschutz und Rate-Limits

- `/conversations`, `/requests` und `/settings` werden durch eine signierte, acht Stunden gültige HTTP-only Admin-Session geschützt. Sensible Server-Actions prüfen die Session zusätzlich zum Route-Proxy.
- Der Login akzeptiert ausschließlich den als Scrypt-Hash hinterlegten Admin-Zugang und ist gegen wiederholte Versuche begrenzt.
- Voice-Session und Reconnect besitzen getrennte Limits. Als Client-IP wird ausschließlich `TRUSTED_CLIENT_IP_HEADER` gelesen (Default `x-real-ip`); der vorgeschaltete Ingress muss diesen Header überschreiben. Vom Browser kontrollierbare Fallback-Header werden nicht vertraut.
- Die Limits sind bewusst pro Web-Prozess. Bei mehreren Web-Replikaten ist vor horizontaler Skalierung ein gemeinsamer TTL-Store erforderlich.

Manueller Voice-Smoke-Test für Phase 7:

1. Vera während einer längeren Antwort mit „Moment“ unterbrechen; die Audioausgabe muss stoppen und der neue Nutzerturn vollständig erscheinen.
2. Innerhalb eines Satzes ein bis zwei Sekunden pausieren; Vera darf die Pause nicht als sicheren Abschluss behandeln.
3. Eine normale kurze Antwort wie „ja“ geben; sie muss als finaler Turn ankommen, ohne einen laufenden Vera-Turn fälschlich zu unterbrechen.
4. Während eines aktiven Gesprächs die Netzwerkverbindung kurz trennen. Zuerst muss der automatische SDK-Reconnect erscheinen; nach einem terminalen Abbruch muss „Verbindung wiederherstellen“ dieselbe Conversation fortsetzen.
5. In der Conversation-History prüfen, dass unterbrochene Vera-Texte markiert sind und der vollständig generierte Resttext nur aufklappbar erscheint.

## Release-Verifikation

- `pnpm quality` prüft Formatierung, Lint und TypeScript.
- `pnpm test` führt Unit- und PostgreSQL-Integrationstests aus. Die Integrationstests enthalten ausdrücklich die transaktionale und idempotente Speicherung eines Terminwunsches samt gewünschtem Zeitraum.
- `pnpm test:e2e` prüft im Browser den Login-Schutz, die Weiterleitung auf `/`, den Fake-Voice-Start-/Stop-Flow und einen sichtbaren Verbindungsfehler.
- `pnpm build` baut alle Workspace-Pakete produktionsnah.
- GitHub Actions führt Migration, Quality, Tests, Build und Chromium-E2E bei jedem Pull Request sowie bei Pushes auf `main` aus.

Das manuelle Demo-Drehbuch, der echte Provider-Smoke-Test und die Coolify-Abnahme stehen in [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md).
