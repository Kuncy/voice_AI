# HeyVera

HeyVera ist eine deutschsprachige Voice-First-Anwendung auf Basis von LiveKit. Phase 5 ergänzt mit `create_damage_report` die erste persistente Business-Aktion: Vera sammelt Kategorie, Beschreibung und Dringlichkeit, bittet um Bestätigung und speichert anschließend genau eine Schadensmeldung. Agent-Einstellungen bleiben persistent und jedes Gespräch verwendet weiterhin einen unveränderlichen Konfigurations-Snapshot.

Die Voice-Pipeline verwendet LiveKit für Transport und Orchestrierung, das direkte Deepgram-Plugin für STT und TTS sowie das direkte OpenAI-Plugin für das LLM. Für Deepgram Flux STT und Aura‑2 TTS wird derselbe API-Key verwendet. LiveKit Inference und ElevenLabs sind im initialen Pfad bewusst nicht Bestandteil der Architektur, damit vorhandene Provider-Guthaben genutzt werden.

## Lokale Entwicklung

Voraussetzungen: Node.js 22+, pnpm 11, Docker und ein LiveKit-Cloud-Projekt.

1. `.env.example` nach `.env.local` kopieren und die Provider-Werte, `POSTGRES_PASSWORD` sowie ein mindestens 32 Zeichen langes `SESSION_SECRET` setzen.
2. `pnpm install` ausführen.
3. PostgreSQL und die Migration mit `./scripts/compose-local.sh up -d postgres migrate` starten.
4. Für Prozesse auf dem Host in `.env.local` `DATABASE_URL=postgresql://heyvera:<passwort>@localhost:5433/heyvera` setzen; alternativ Web und Agent vollständig über Compose starten.
5. Web und Agent gemeinsam mit `pnpm dev` starten.
6. `http://localhost:3000` öffnen und den Mikrofonzugriff erlauben. Die technische Liste liegt unter `/conversations`.
7. Unter `http://localhost:3000/settings` Vera konfigurieren. Änderungen gelten ab dem nächsten neu gestarteten Gespräch.

Ohne echte Credentials kann die UI deterministisch über `http://localhost:3000/?voiceTransport=fake` geprüft werden.

## Coolify

Das Repository wird als Docker-Compose-Service-Stack deployt. In Coolify:

1. Git-Repository als neue Docker-Compose-Ressource auswählen.
2. Nur dem Service `web` eine HTTPS-Domain auf Container-Port 3000 zuweisen.
3. `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `SESSION_SECRET`, `DEEPGRAM_API_KEY`, `OPENAI_API_KEY` und `POSTGRES_PASSWORD` als Runtime-Secrets setzen. `LIVEKIT_AGENT_NAME`, `POSTGRES_DB` und `POSTGRES_USER` sind optional.
4. Den Agent-Service nicht öffentlich exponieren. Sein interner LiveKit-Healthcheck läuft auf Port 8081.
5. Das benannte Volume `postgres_data` sichern und in Coolify geplante PostgreSQL-Backups auf S3-kompatiblen Storage konfigurieren.
6. Für Production ein eigenes LiveKit-Projekt verwenden. Preview- und lokale Worker dürfen nicht dieselben Credentials verwenden.

Der Agent ist ein langlebiger Worker und keine serverless Function. Er öffnet ausgehend eine WebSocket-Verbindung zu LiveKit Cloud. `stop_grace_period: 11m` gibt laufenden Calls beim Deployment Zeit zum sauberen Abschluss.

`EMERGENCY` ist ausschließlich eine Dringlichkeitsstufe im gespeicherten Damage Report. HeyVera löst keinen Notruf aus und leitet keine Meldung automatisch weiter. Bei akuter Gefahr weist Vera zuerst auf das Verlassen des Gebäudes und den Notruf 112 hin; die Meldung ersetzt diesen Notruf nicht.

Die Compose-Datei verwendet Coolifys unterstützte `${VARIABLE:?}`-Syntax, Healthchecks und `exclude_from_hc` für den einmaligen Migrationsjob. Da `exclude_from_hc` eine Coolify-Erweiterung und kein Docker-Compose-Standardfeld ist, entfernt `scripts/compose-local.sh` ausschließlich dieses Feld für lokale Compose-Aufrufe. `docker-compose.local.yml` veröffentlicht lokal Web-Port 3000 und PostgreSQL-Port 5433; in Coolify bleiben beide privaten Services unveröffentlicht.

## Datenbankbetrieb

- `pnpm db:migrate` führt ausstehende Drizzle-Migrationen gegen `DATABASE_URL` aus.
- `pnpm db:sweep` markiert verwaiste `STARTING`/`ACTIVE`-Conversations nach Maximaldauer plus Reconnect-Karenz als `ABANDONED`.
- Für Production sollte `pnpm db:sweep` mindestens alle fünf Minuten als geplanter Coolify-Task laufen.
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
- Der Datenbank-Integrationstest prüft Lifecycle, Reihenfolge und Idempotenz der finalen Messages sowie den `ABANDONED`-Sweeper.
- Partielle Transkripte bleiben ausschließlich im Browser; nur finale User- und Assistant-Items gelangen in PostgreSQL.
- Der Agent fängt Persistenzfehler pro Schreibvorgang ab, protokolliert sie strukturiert und lässt die Voice-Pipeline weiterlaufen.

## Phase-4-Verifikation

- `/settings` lädt und speichert Name, Tonalität und System-Prompt serverseitig in PostgreSQL; Deutsch bleibt in dieser Phase fest eingestellt.
- Zod validiert Formulareingaben und gespeicherte Snapshots. Nicht überschreibbare Sprach- und Sicherheitsregeln werden dem konfigurierbaren Prompt immer vorangestellt.
- Ein neues Gespräch speichert die zu diesem Zeitpunkt aktive Agent-Konfiguration als versionierten Snapshot. Der Agent lädt genau diesen Snapshot für den Voice-Job.
- Der Datenbank-Integrationstest belegt, dass eine Einstellungsänderung nur neue Gespräche betrifft.
- `pnpm test`, `pnpm typecheck`, `pnpm build` sowie ein Container-Neustart prüfen Verhalten, Build und Persistenz.

## Phase-5-Verifikation

- `create_damage_report` verlangt Kategorie, konkrete Beschreibung und Dringlichkeit und darf erst nach ausdrücklicher Bestätigung aufgerufen werden.
- `providerCallId` schützt den Schreibpfad gegen Wiederholungen. Tool Call und Damage Report werden gemeinsam in einer PostgreSQL-Transaktion gespeichert.
- Das Tool liefert ausschließlich strukturierte Erfolgs- oder Fehlercodes; Vera bestätigt Erfolg erst nach einem erfolgreichen Commit.
- Der Live-Status wird über `heyvera.tool-status` im Voice Screen als eigenes Badge angezeigt.
- Unit-Tests prüfen Validierung, stabile Results und Toolstatus. Der echte PostgreSQL-Integrationstest prüft Transaktion, Relation und Idempotenz.
