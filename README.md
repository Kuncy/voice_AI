# HeyVera

HeyVera ist eine deutschsprachige Voice-First-Anwendung auf Basis von LiveKit. Phase 1 stellt die sichere Browser-zu-Room-Verbindung, den benannten Agent-Dispatch und das Coolify-fähige Deployment-Grundgerüst bereit.

Die Voice-Pipeline verwendet LiveKit für Transport und Orchestrierung, das direkte Deepgram-Plugin für STT und TTS sowie das direkte OpenAI-Plugin für das LLM. Für Deepgram Flux STT und Aura‑2 TTS wird derselbe API-Key verwendet. LiveKit Inference und ElevenLabs sind im initialen Pfad bewusst nicht Bestandteil der Architektur, damit vorhandene Provider-Guthaben genutzt werden.

## Lokale Entwicklung

Voraussetzungen: Node.js 22+, pnpm 11 und ein LiveKit-Cloud-Projekt.

1. `.env.example` nach `.env.local` kopieren und die LiveKit-Werte sowie ein mindestens 32 Zeichen langes `SESSION_SECRET` setzen.
2. `pnpm install` ausführen.
3. Web und Agent gemeinsam mit `pnpm dev` starten.
4. `http://localhost:3000` öffnen und den Mikrofonzugriff erlauben.

Ohne echte Credentials kann die UI deterministisch über `http://localhost:3000/?voiceTransport=fake` geprüft werden.

## Coolify

Das Repository wird als Docker-Compose-Service-Stack deployt. In Coolify:

1. Git-Repository als neue Docker-Compose-Ressource auswählen.
2. Nur dem Service `web` eine HTTPS-Domain auf Container-Port 3000 zuweisen.
3. `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `SESSION_SECRET`, `DEEPGRAM_API_KEY` und `OPENAI_API_KEY` als Runtime-Secrets setzen. `LIVEKIT_AGENT_NAME` ist optional und standardmäßig `heyvera`.
4. Den Agent-Service nicht öffentlich exponieren. Sein interner LiveKit-Healthcheck läuft auf Port 8081.
5. Für Production ein eigenes LiveKit-Projekt verwenden. Preview- und lokale Worker dürfen nicht dieselben Credentials verwenden.

Der Agent ist ein langlebiger Worker und keine serverless Function. Er öffnet ausgehend eine WebSocket-Verbindung zu LiveKit Cloud. `stop_grace_period: 11m` gibt laufenden Calls beim Deployment Zeit zum sauberen Abschluss.

Die Compose-Datei verwendet Coolifys unterstützte `${VARIABLE:?}`-Syntax für erforderliche Variablen und definiert Healthchecks direkt am Service. PostgreSQL, Migrationen und Backups kommen in Phase 3 hinzu.

## Phase-1-Verifikation

- `pnpm typecheck`
- `pnpm build`
- `docker compose config` mit gesetzten Pflichtvariablen
- `GET /api/health`
- Manueller Smoke-Test: Browser verbindet sich, Mikrofontrack wird publiziert und der Agent erscheint in derselben Room.
