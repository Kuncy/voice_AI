# HeyVera — risikogetriebener Voice-First-Implementierungsplan

## 1. Architecture Summary

Die Umsetzung beginnt mit einem schmalen, echten Vertical Slice:

```text
Browser-Mikrofon
→ LiveKit Cloud
→ Deepgram Flux
→ GPT‑4.1
→ Deepgram Aura‑2
→ Browser-Audio
```

Dieser Voice-Loop wird mit echten Providern und deutscher Sprache validiert, bevor Datenbank, Settings, Tools, History oder Auth hinzukommen.

Die spätere Zielarchitektur bleibt:

- `apps/web`: Next.js-UI, LiveKit-Token-Endpunkt, Settings und History.
- `apps/agent`: Node.js LiveKit Agent und Voice-Pipeline.
- `packages/core`: Business Use Cases und Repository-Ports.
- `packages/db`: PostgreSQL, Drizzle und Repository-Implementierungen.
- `packages/config`: validierte Runtime-Konfiguration.
- `packages/types`: gemeinsame API- und Event-Verträge.

Auth ist kein Bestandteil des Challenge-DoD. Sie bleibt eine klar isolierte optionale Phase, die erst nach Fertigstellung und Stabilisierung der Voice Experience begonnen wird.

**Sprachumfang:** Die Anwendung ist bewusst ausschließlich deutschsprachig. Mehrsprachigkeit ist ein dokumentiertes Non-Goal, siehe Abschnitt 8.

**Provider-Modus:** STT und TTS greifen über das direkte Deepgram-Plugin auf dasselbe Deepgram-Konto zu; GPT‑4.1 greift über das direkte OpenAI-Plugin auf das OpenAI-Konto zu. LiveKit Inference wird im initialen Pfad bewusst nicht verwendet, damit vorhandene Deepgram- und OpenAI-Startguthaben genutzt werden. LiveKit bleibt Transport- und Orchestrierungsschicht. Ein späterer Wechsel zu LiveKit Inference bleibt durch die Provider-Ports möglich, ist aber kein Teil des Challenge-DoD.

**Deployment-Modell:** Lokale Entwicklung und ein reproduzierbares **Coolify-Deployment** sind verbindlich. Coolify deployt das Repository als Docker-Compose-Service-Stack mit drei getrennten Services: `web`, `agent` und ab Phase 3 `postgres`. `apps/agent` ist ein langlebiger Worker-Prozess und darf nicht als serverless Function betrieben werden. Er verbindet sich ausgehend zu LiveKit Cloud und benötigt öffentlich keinen eingehenden Port; sein interner Healthcheck läuft auf Port 8081. Nur `web` wird über Coolifys Proxy und eine Domain öffentlich exponiert. Das README hält lokale und Coolify-spezifische Start-, Migrations-, Backup- und Rollback-Schritte explizit fest.

### Coolify-Vertrag

- `docker-compose.yml` ist die gemeinsame lokale und Coolify-kompatible Source of Truth; lokale Abweichungen kommen ausschließlich in eine optionale Override-Datei.
- `web` und `agent` besitzen getrennte Debian-slim-basierte Production-Images. Alpine wird wegen der nativen LiveKit-Runtime nicht verwendet; das Agent-Image enthält `ca-certificates`.
- Der `web`-Service lauscht auf `0.0.0.0:3000` und bietet `GET /api/health`; der `agent` nutzt LiveKits eingebauten Healthcheck auf `0.0.0.0:8081`.
- Compose definiert Healthchecks für alle langlebigen Services. Der einmalige Migrationsjob wird mit `exclude_from_hc: true` von Coolifys Gesamt-Healthcheck ausgeschlossen.
- Secrets werden ausschließlich als erforderliche Runtime-Variablen (`${VARIABLE:?}`) deklariert und in Coolify gepflegt. Provider-Keys werden nie als Build-Argumente oder `NEXT_PUBLIC_*`-Variablen gesetzt.
- PostgreSQL erhält ein benanntes Volume. Für Production werden Coolifys geplante PostgreSQL-Backups auf S3-kompatiblen Storage eingerichtet.
- Agent-Rollouts müssen eine Grace Period von mindestens `MAX_SESSION_MS` plus 60 Sekunden erlauben, damit `SIGTERM` laufende Calls drainen kann.
- Production, Preview und lokale Entwicklung verwenden getrennte LiveKit-Projekte beziehungsweise Credentials, damit Preview-Worker keine Production-Jobs annehmen.

## 2. Architecture Diagram

```text
┌────────────────────── Browser ──────────────────────┐
│ Next.js Voice UI                                    │
│ Microphone · State · Orb · Live Transcript          │
└───────────────────────┬─────────────────────────────┘
                        │ WebRTC + Text/Data Streams
                        ▼
                 ┌───────────────┐
                 │ LiveKit Cloud │
                 │ Room/Dispatch │
                 │ Reconnect     │
                 └───────┬───────┘
                         ▼
              ┌─────────────────────┐
              │ Node Voice Agent    │
              │ LiveKit AgentSession│
              └───┬────────┬────┬───┘
                  │        │    │
                  ▼        ▼    ▼
              Deepgram   OpenAI Deepgram
              Flux STT   GPT-4.1 Aura-2 TTS
                           │
                        Tool Calls
                           │
                           ▼
                 ┌──────────────────┐
                 │ packages/core    │
                 │ Application Layer│
                 └────────┬─────────┘
                          ▼
                 ┌──────────────────┐
                 │ Drizzle/Postgres │
                 └──────────────────┘
```

`packages/config` existiert ab Phase 1 und ist keine spätere Erweiterung. Die folgende Reihenfolge beschreibt ausschließlich, wann **datenbankgestützte** Fähigkeiten eingeführt werden:

```text
Voice Loop (statische Config aus packages/config)
   ↓
Persistence (Conversations, Messages, Agents)
   ↓
Persistierte Konfiguration und Snapshots
   ↓
Business Tools
   ↓
History
```

Der Voice Agent bleibt auch nach der Erweiterung ein Orchestrator und enthält keine fachliche Schadensmeldungslogik.

## 3. Repository Structure

```text
.
├── apps/
│   ├── web/
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── conversations/
│   │   │   │   │   └── [conversationId]/
│   │   │   │   ├── settings/
│   │   │   │   └── api/
│   │   │   │       └── voice-sessions/
│   │   │   ├── components/
│   │   │   │   ├── voice/
│   │   │   │   ├── conversations/
│   │   │   │   └── ui/
│   │   │   └── lib/
│   │   │       └── voice/
│   │   │           ├── transport.ts          # Interface
│   │   │           ├── livekit-transport.ts  # echte Implementierung
│   │   │           └── fake-transport.ts     # deterministischer Fake für E2E
│   │   └── tests/
│   └── agent/
│       ├── src/
│       │   ├── index.ts
│       │   ├── session/
│       │   ├── prompts/
│       │   ├── tools/
│       │   ├── persistence/
│       │   ├── guardrails/
│       │   └── observability/
│       └── tests/
├── packages/
│   ├── core/
│   │   └── src/
│   │       ├── agents/
│   │       ├── conversations/
│   │       ├── damage-reports/
│   │       ├── tools/
│   │       └── ports/
│   ├── db/
│   │   └── src/
│   │       ├── schema/
│   │       ├── repositories/
│   │       ├── migrations/
│   │       └── client.ts
│   ├── config/
│   └── types/
├── scripts/
│   └── sweep-stale-conversations.ts
├── tests/
│   ├── integration/
│   └── e2e/
├── docker-compose.yml
├── apps/web/Dockerfile
├── apps/agent/Dockerfile
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
├── .env.example
└── README.md
```

Die Ordner `packages/core` und `packages/db` dürfen beim ersten Voice-Spike zunächst leer beziehungsweise minimal bleiben. Sie werden erst eingeführt, wenn der Voice-Loop funktioniert.

## 4. Data Model

Das Schema wird erst in Phase 3 implementiert. Phase 3 enthält bereits `agents`, damit `conversations.agent_id` und `agent_snapshot` von Anfang an ihre endgültige Form haben und keine Nachmigration von nullable auf NOT NULL nötig ist.

### `agents`

- `id UUID PK`
- `name TEXT NOT NULL`
- `language TEXT NOT NULL DEFAULT 'de'`
- `tone TEXT NOT NULL`
- `system_prompt TEXT NOT NULL`
- `tts_model TEXT NULL`
- `created_at`, `updated_at`

Wird in Phase 3 mit genau einem Vera-Datensatz geseedet. Die Settings-UI in Phase 4 bearbeitet diesen Datensatz, erzeugt aber keine weiteren Agents.

### `conversations`

- `id UUID PK`
- `agent_id UUID FK NOT NULL → agents.id`
- `livekit_room_name TEXT UNIQUE NOT NULL`
- `status ENUM('STARTING','ACTIVE','COMPLETED','FAILED','ABANDONED')`
- `started_at`, `ended_at`
- `duration_ms INTEGER NULL`
- `agent_snapshot JSONB NOT NULL`
- `runtime_snapshot JSONB NOT NULL`
- `failure_code TEXT NULL`
- `created_at`, `updated_at`

Beide Snapshots sind ab Phase 3 verpflichtend. In Phase 3 stammt der Agent-Snapshot aus dem Seed-Datensatz, ab Phase 4 aus der über die Settings gepflegten Konfiguration. Der Schreibpfad ist in beiden Fällen identisch, deshalb entfällt die frühere Nullable-Zwischenstufe.

### `messages`

- `id UUID PK`
- `conversation_id UUID FK`
- `external_item_id TEXT NOT NULL`
- `sequence INTEGER NOT NULL`
- `role ENUM('USER','ASSISTANT','SYSTEM','TOOL')`
- `content TEXT NOT NULL`
- `is_final BOOLEAN NOT NULL`
- `was_interrupted BOOLEAN NOT NULL DEFAULT FALSE`
- `started_at`, `created_at`
- `metadata JSONB NULL`

Constraints:

- Unique `(conversation_id, external_item_id)`.
- Unique `(conversation_id, sequence)`.

Partial Transcripts werden nicht gespeichert.

#### `external_item_id` ist NOT NULL

Ein nullable `external_item_id` würde die Idempotenz stillschweigend aushebeln: PostgreSQL behandelt NULL-Werte in Unique-Indizes als voneinander verschieden, ein Retry ohne Provider-ID würde also genau den Pfad nehmen, der ungeschützt ist. Deshalb wird immer eine ID geschrieben:

```ts
function itemKey(item: ConversationItem): string {
  if (item.id) return `lk:${item.id}`;
  const digest = sha256(
    `${item.role}\u0000${item.turnIndex}\u0000${item.content}`,
  ).slice(0, 32);
  return `synth:${digest}`;
}
```

Der synthetische Schlüssel ist über Wiederholungen desselben Items stabil, weil er ausschließlich aus Rolle, Turn-Index und Inhalt gebildet wird.

#### `sequence` wird unter Sperre in der Datenbank vergeben

Ein prozesslokaler Zähler im Agent ist nicht ausreichend: bei Worker-Neustart oder einem zweiten Agent-Job für dieselbe Room beginnt er erneut bei 0 und verursacht mitten im Call eine Unique-Violation. Die Vergabe erfolgt daher in derselben Transaktion wie der Insert:

```sql
SELECT id
FROM conversations
WHERE id = $1
FOR UPDATE;

INSERT INTO messages (conversation_id, external_item_id, sequence, ...)
SELECT
  $1,
  $2,
  COALESCE(MAX(sequence), 0) + 1,
  ...
FROM messages
WHERE conversation_id = $1
ON CONFLICT (conversation_id, external_item_id) DO NOTHING;
```

Regeln:

- Die Sperre der Conversation-Zeile serialisiert die Sequenzvergabe pro Conversation; parallele Inserts für andere Conversations bleiben davon unberührt.
- Das explizite Konfliktziel `(conversation_id, external_item_id)` macht ausschließlich das erneute Schreiben desselben Items idempotent.
- Der Insert und die Sperre laufen in derselben Transaktion. Ein fehlender Insert bedeutet damit ein bereits vorhandenes `external_item_id` und nicht eine verdeckte Sequenzkollision.
- Für die Anzeige gilt `ORDER BY sequence`; `started_at` dient nur als Tiebreaker in Diagnosefällen und nicht als primäre Ordnung.

#### Persistierter Text bei Barge-in

Wird eine Assistant-Antwort unterbrochen, weicht der generierte Text vom tatsächlich gehörten Text ab. Damit die History nicht Sätze zeigt, die nie gesprochen wurden, gilt:

- `content` enthält den **tatsächlich gesprochenen** Text, so wie ihn der LiveKit Speech Handle nach der Unterbrechung meldet.
- `metadata.generatedText` enthält den vollständig generierten Text.
- `was_interrupted = true`.
- Die History-Detailansicht kennzeichnet unterbrochene Nachrichten sichtbar und kann den generierten Resttext optional aufklappen.

Die Reconciliation dieses Falls wird in Phase 7 verifiziert, das Schreibverhalten ist aber ab Phase 3 so implementiert.

### `tool_calls`

- `id UUID PK`
- `conversation_id UUID FK`
- `message_id UUID FK NULL`
- `provider_call_id TEXT NOT NULL`
- `tool_name TEXT NOT NULL`
- `arguments JSONB NOT NULL`
- `result JSONB NULL`
- `status ENUM('STARTED','SUCCEEDED','FAILED')`
- `error_code TEXT NULL`
- `duration_ms INTEGER NULL`
- `created_at`, `completed_at`
- Unique `(conversation_id, provider_call_id)`.

### `damage_reports`

- `id UUID PK`
- `conversation_id UUID FK`
- `tool_call_id UUID FK UNIQUE`
- `category ENUM('HEATING','WATER','ELECTRICITY','STRUCTURAL','OTHER')`
- `description TEXT NOT NULL`
- `urgency ENUM('LOW','MEDIUM','HIGH','EMERGENCY')`
- `status ENUM('OPEN','IN_REVIEW','RESOLVED') DEFAULT 'OPEN'`
- `created_at`, `updated_at`

`EMERGENCY` erzeugt ausschließlich einen Datensatz mit dieser Dringlichkeit. Es gibt bewusst keine Eskalations-, Benachrichtigungs- oder Weiterleitungslogik; das ist ein dokumentiertes Non-Goal im README. Damit die Anwendung sich in einem echten Notfall dennoch korrekt verhält, enthält der System Prompt eine verbindliche Sicherheitsregel, siehe Abschnitt 7.

### Conversation-Abschluss und verwaiste Sessions

Der Enum-Wert `ABANDONED` braucht einen definierten Schreiber, sonst bleibt eine Conversation nach einem Worker-Crash dauerhaft `ACTIVE` und die History zeigt hängende Sessions.

| Ereignis | Ziel-Status |
|---|---|
| Nutzer beendet den Call regulär, Agent schließt sauber ab | `COMPLETED` |
| Guardrail-Limit greift (Max-Dauer oder Idle-Timeout) | `COMPLETED`, `failure_code = 'SESSION_LIMIT'` |
| Room-Disconnect ohne regulären Abschluss; Reconnect-Karenzzeit abgelaufen | `ABANDONED` |
| Provider- oder Pipeline-Fehler beendet die Session | `FAILED` mit `failure_code` |

Zusätzlich existiert `scripts/sweep-stale-conversations.ts`. Das Skript setzt `ACTIVE`-Conversations, deren `started_at` älter ist als die maximale Sessiondauer plus Karenzzeit, auf `ABANDONED` mit `failure_code = 'STALE_SESSION'`. Es wird im README dokumentiert und ist Teil des Reset-/Seed-Flows in Phase 8.

Nach einem terminalen Transport-Disconnect bleibt eine `ACTIVE`-Conversation für eine konfigurierbare Reconnect-Karenzzeit von standardmäßig 60 Sekunden wiederaufnehmbar. Ein erfolgreicher Reconnect verwendet dieselbe Conversation. Erst ein explizites Call-Ende oder der Ablauf dieser Karenzzeit setzt den terminalen Status. Der Sweeper deckt den Fall ab, dass der zuständige Prozess während der Karenzzeit ausfällt.

### Optionale Auth-Erweiterung

Nur Phase 9 fügt `users` und gegebenenfalls `started_by_user_id` hinzu. Die Kernimplementierung darf keine Auth-Abhängigkeit voraussetzen.

## 5. Realtime Voice Flow

### Voice-Spike ohne Datenbank

1. Der Nutzer klickt „Start Call“.
2. `POST /api/voice-sessions` erzeugt einen ephemeren Room-Namen und einen kurzlebigen LiveKit-Token.
3. Der Browser verbindet sich per LiveKit und veröffentlicht das Mikrofon.
4. LiveKit dispatcht den Node-Agenten.
5. Der Agent verwendet zunächst eine statische Vera-Konfiguration aus `packages/config`.
6. Deepgram Flux verarbeitet deutsches Audio als Stream.
7. Partials erscheinen sofort im UI.
8. Ein finales Turn-Ende startet GPT‑4.1.
9. GPT-Text-Deltas werden durch LiveKit an Deepgram Aura‑2 weitergegeben.
10. Deepgram-Audio wird per LiveKit zurück an den Browser gestreamt.
11. Barge-in ist für den ersten Spike funktional aktiviert, wird aber erst in Phase 7 detailliert getuned.

### Vertrauensgrenze des Session-Endpunkts

Der Session-Endpunkt ist der einzige Ort, an dem Room-Namen, Conversation-IDs und Tokens entstehen. Er akzeptiert dafür **keine** Eingaben aus dem Client-Body.

Regeln:

- `roomName`, `conversationId`, `agentId` und die Teilnehmer-`identity` werden ausschließlich serverseitig erzeugt. Ein Client, der diese Werte mitschickt, wird mit `400` abgewiesen, nicht stillschweigend ignoriert.
- Die Response enthält nur `token`, `livekitUrl` und `roomName`. Ein opakes, signiertes `sessionHandle` mit kurzer Lebensdauer wird separat als `HttpOnly`, `Secure`, `SameSite=Strict` Cookie gesetzt; `conversationId` wird nicht an JavaScript herausgegeben.
- Token-TTL beträgt 120 Sekunden. Der Token dient nur dem Verbindungsaufbau, nicht der Sessiondauer.
- Grants werden minimal gesetzt:

```ts
const at = new AccessToken(apiKey, apiSecret, {
  identity: `web-${randomUUID()}`,
  ttl: "120s",
});
at.addGrant({
  room: roomName,
  roomJoin: true,
  canPublish: true,
  canPublishSources: [TrackSource.MICROPHONE],
  canSubscribe: true,
  canPublishData: false,
  roomCreate: false,
  roomAdmin: false,
  roomList: false,
});
```

- Der Endpunkt ist per IP-Rate-Limit begrenzt (Richtwert: 5 Sessions pro Minute, 30 pro Stunde). Das ist unabhängig von Phase 9 nötig, weil jede Session LiveKit-, STT-, LLM- und TTS-Kosten auslöst.
- Reconnect nach terminalem Verbindungsverlust erfolgt über `POST /api/voice-sessions/reconnect`; der Browser sendet das `sessionHandle` ausschließlich als Cookie. Der Server löst es zur Conversation auf und stellt einen frischen Token aus. Das Handle ist ein kurzlebiges Bearer-Credential: Signatur und Ablauf verhindern Manipulation und langfristige Wiederverwendung, nicht aber Missbrauch nach Diebstahl. Es wird deshalb an die serverseitig erzeugte Browser-Session gebunden und bei erfolgreicher Nutzung rotiert.

### Flow ab Phase 3

1. Der Voice-Session-Endpunkt lädt den Vera-Agent-Datensatz, erstellt Agent- und Runtime-Snapshot und legt damit die Conversation an.
2. `conversationId` und `agentId` werden als validierte Agent-Dispatch-Metadaten übergeben.
3. Der Agent markiert die Conversation als `ACTIVE`.
4. Finale Conversation Items werden idempotent gespeichert.
5. Beim Disconnect werden Status, Ende und Dauer gemäß der Tabelle in Abschnitt 4 persistiert.

### Flow ab Phase 4

Der Schreibpfad bleibt unverändert. Neu ist lediglich, dass der Agent-Datensatz über die Settings-UI verändert werden kann.

1. Der Session-Endpunkt lädt die aktuelle Agent-Konfiguration.
2. Er schreibt einen unveränderlichen Snapshot in die Conversation.
3. Der Agent lädt ausschließlich diesen Snapshot.
4. Nachträgliche Settings-Änderungen verändern laufende oder vergangene Conversations nicht.

### Session-Guardrails

Ein offen gelassener Voice-Loop verbraucht STT, LLM und TTS parallel und dauerhaft. Ab Phase 2 gelten daher harte Limits im Agent, konfigurierbar über `packages/config`:

| Limit | Default | Verhalten |
|---|---|---|
| `MAX_SESSION_MS` | 600000 (10 min) | Vera kündigt das Ende 30 Sekunden vorher kurz an, dann sauberer Abschluss als `COMPLETED` mit `failure_code = 'SESSION_LIMIT'` |
| `IDLE_TIMEOUT_MS` | 60000 | Kein finales User-Turn in diesem Zeitraum → Session wird beendet |
| `MAX_TURNS` | 40 | Backstop gegen Endlosschleifen zwischen Agent und Umgebungsgeräusch |

Die Limits sind auch ein Demo-Vorteil: sie verhindern, dass ein vergessener Tab im Hintergrund weiterläuft.

## 6. Conversation State Machine

```text
idle
  └─ START ───────────────► connecting
connecting
  ├─ AGENT READY ─────────► listening
  ├─ CANCEL ──────────────► disconnecting
  └─ FAILURE ─────────────► error
listening
  ├─ FINAL USER TURN ─────► thinking
  ├─ END ─────────────────► disconnecting
  └─ FAILURE ─────────────► error
thinking
  ├─ FIRST AUDIO ─────────► speaking
  ├─ TOOL CALL STARTED ───► tool
  ├─ USER BARGE-IN ───────► listening
  └─ FAILURE ─────────────► error
tool
  ├─ TOOL SETTLED ────────► thinking
  └─ FAILURE ─────────────► error
speaking
  ├─ SPEECH COMPLETE ─────► listening
  ├─ TOOL CALL STARTED ───► tool
  ├─ USER BARGE-IN ───────► listening
  ├─ END ─────────────────► disconnecting
  └─ FAILURE ─────────────► error
disconnecting
  └─ CLEANUP ─────────────► idle
error
  ├─ RECONNECT ───────────► connecting
  └─ END ─────────────────► idle
```

`tool` ist ein eigener Zustand und keine Selbstschleife auf `thinking`, weil die UI während der Tool-Ausführung ein eigenes Badge zeigt. `TOOL SETTLED` umfasst Erfolg und Fehler; der Fehlercode landet im Tool-Result, nicht im Zustand.

Für die UI werden LiveKits Agent-State und Getter als Source of Truth verwendet, soweit sie greifen. LiveKit kennt `initializing`, `idle`, `listening`, `thinking` und `speaking`; `connecting`, `tool`, `disconnecting` und `error` gehören der lokalen Maschine. Eigene Zustände ergänzen außerdem Token-Erzeugung und manuelles Disconnecting.

**Reconnect ist nicht nur ein Zustandswechsel.** Bei Token-TTL von 120 Sekunden ist der ursprüngliche Token nach einem terminalen Disconnect praktisch immer abgelaufen. Der Übergang `error → RECONNECT → connecting` ruft daher zwingend `POST /api/voice-sessions/reconnect` mit dem automatisch gesendeten Handle-Cookie auf und verbindet erst mit dem neu ausgestellten Token. Ein Reconnect ohne Token-Refresh wird als Implementierungsfehler behandelt.

## 7. Tool Architecture

`create_damage_report` wird erst nach funktionierender Voice-, Persistence- und Config-Schicht hinzugefügt.

```ts
const createDamageReportInput = z.object({
  category: z.enum([
    "heating",
    "water",
    "electricity",
    "structural",
    "other",
  ]),
  description: z.string().trim().min(10).max(2_000),
  urgency: z.enum(["low", "medium", "high", "emergency"]),
});

type CreateDamageReportResult =
  | {
      ok: true;
      damageReportId: string;
      status: "open";
    }
  | {
      ok: false;
      code: "VALIDATION_ERROR" | "PERSISTENCE_ERROR";
    };
```

Ablauf:

```text
GPT Tool Call
→ LiveKit llm.tool()
→ Zod Validation
→ ToolExecutionWrapper
→ DamageReportService
→ Drizzle Repository Transaction
→ ToolCall + DamageReport
→ strukturiertes Result
→ gesprochene Bestätigung
```

Regeln:

- Der System Prompt verlangt Kategorie, Beschreibung und Dringlichkeit.
- Vor dem Tool Call muss Vera die Meldung kurz zusammenfassen und bestätigen lassen.
- Ein Erfolg darf erst nach erfolgreichem DB-Commit ausgesprochen werden.
- `providerCallId` dient als Idempotency Key.
- Tool-Fehler enthalten stabile Codes, keine SQL- oder Provider-Details.
- Der Agent kennt nur das Tool-Interface und den Use Case, nicht das Drizzle-Schema.
- Toolstatus wird über `heyvera.tool-status` an die UI gesendet.

### Sicherheitsregel im System Prompt

Da `EMERGENCY` keine Eskalation auslöst, muss der Prompt den Notfall sprachlich korrekt behandeln:

> Bei akuter Gefahr für Menschen — zum Beispiel Gasgeruch, Feuer, Rauch, Stromschlag oder austretendem Wasser in Verbindung mit Elektrik — weise den Nutzer **zuerst** darauf hin, das Gebäude zu verlassen und den Notruf 112 zu wählen. Nimm die Meldung danach auf und weise darauf hin, dass diese Meldung keinen Notruf ersetzt und nicht automatisch weitergeleitet wird.

Diese Regel wird als Teil des Basis-Prompts geführt und ist in der Settings-UI nicht überschreibbar; der frei editierbare System Prompt aus den Settings wird ihr nachgestellt. Das README nennt die fehlende Eskalation ausdrücklich als Non-Goal.

## 8. Configuration Architecture

### Phase 1–2

Statische, validierte Konfiguration:

```ts
const initialVeraConfig = {
  name: "Vera",
  language: "de",
  tone: "Friendly & Professional",
  systemPrompt: "...",
  ttsModel: process.env.DEEPGRAM_TTS_MODEL,
};
```

Damit hängt der Voice-Spike nicht von einer Datenbank ab.

### Ab Phase 4

```text
Settings Form
→ Server Action
→ Zod Validation
→ AgentConfigService
→ PostgreSQL

Neue Voice Session
→ Agent Config laden
→ AgentSnapshotV1 erzeugen
→ Conversation speichern
→ Snapshot an Agent Runtime binden
```

Snapshot:

```ts
type AgentSnapshotV1 = {
  schemaVersion: 1;
  agentId: string;
  name: string;
  language: "de";
  tone: string;
  systemPrompt: string;
  ttsModel: string | null;
  sourceUpdatedAt: string;
};
```

Runtime Snapshot:

```ts
type RuntimeSnapshotV1 = {
  schemaVersion: 1;
  stt: {
    provider: "deepgram";
    model: string;
  };
  llm: {
    provider: "openai";
    model: string;
  };
  tts: {
    provider: "deepgram";
    model: string;
  };
};
```

Die Modellfelder sind `string` und keine String-Literale. Ein Literal-Union würde dem konfigurierbaren `OPENAI_MODEL`, `DEEPGRAM_STT_MODEL` und `DEEPGRAM_TTS_MODEL` widersprechen und beim ersten Modellwechsel den Typecheck brechen — genau dann, wenn ein Fallback gebraucht wird. Die Provider-Felder bleiben Literale, weil ein Providerwechsel eine bewusste Codeänderung ist.

`OPENAI_MODEL=gpt-4.1` bleibt eine technische Environment-Konfiguration. Ein späterer Modellwechsel erfordert keine Schemaänderung.

### Snapshot-Versionierung

Snapshots werden über `schemaVersion` gelesen, nicht strukturell erraten:

- Reader sind als `switch (snapshot.schemaVersion)` implementiert und liefern für jede bekannte Version ein normalisiertes Objekt an die UI.
- Eine unbekannte Version führt nicht zu einem Fehler. Die History-Detailansicht zeigt stattdessen einen Hinweis „Snapshot-Version nicht unterstützt“ und das rohe JSON in einem aufklappbaren Block.
- Der Agent lehnt eine unbekannte `schemaVersion` beim Session-Start dagegen bewusst ab und beendet die Session mit `failure_code = 'UNSUPPORTED_SNAPSHOT'`, statt mit unklaren Defaults zu starten.

### Sprache: bewusst nur Deutsch

Sprache ist kein freies Feld. Ein Wechsel auf Englisch würde gleichzeitig den STT-Language-Hint, das Deepgram-TTS-Modell und die Prompt-Sprache betreffen; ein Dropdown, das nur zwei davon umstellt, ergibt eine halb funktionierende Anwendung.

Deshalb:

- `AgentSnapshotV1.language` ist auf `"de"` festgelegt (`z.literal("de")`).
- Die Settings-UI zeigt Sprache als nicht editierbares Feld mit dem Wert „Deutsch“ und dem Hinweis, dass Mehrsprachigkeit außerhalb des Scopes liegt.
- Das README führt Mehrsprachigkeit als Non-Goal mit Begründung.

Damit ist die Anforderung „Sprache konfigurierbar“ nicht stillschweigend fallen gelassen, sondern explizit und nachvollziehbar auf einen Wert beschränkt.

## 9. Streaming Architecture

| Stufe | Streaming-Mechanismus |
|---|---|
| Browser Audio | LiveKit WebRTC Microphone Track |
| STT | Deepgram `STTv2` Flux, alternativ Nova-3 gemäß Gate 2 |
| Transcript UI | LiveKit `lk.transcription` Text Stream |
| LLM | OpenAI Streaming über das LiveKit-Plugin (Responses oder Chat Completions, abhängig von der gepinnten Plugin-Version — in Gate 3 zu verifizieren) |
| LLM → TTS | LiveKit AgentSession Text-/Satzsegmentierung |
| TTS | Deepgram Aura‑2 Streaming TTS über dasselbe Deepgram-Konto wie STT |
| Playback | LiveKit WebRTC Agent Audio Track |
| Tool UI | LiveKit Data Event |

Wichtige Grenze:

- Kein eigener Audio-WebSocket.
- Kein Warten auf eine vollständige LLM-Antwort.
- Kein Speichern von Partial Transcripts.
- Keine manuelle Browser-Audioqueue.
- Keine eigene Cancellation-Architektur, solange LiveKit die Anforderungen erfüllt.

## 10. Latency Strategy

Die Voice-Phasen erhalten einen eigenen Early Success Gate.

### Gate nach Phase 2

Mit echten Providern muss Folgendes funktionieren:

```text
deutsche Spracheingabe
→ sichtbares Partial Transcript
→ korrektes Turn-Ende
→ Vera antwortet
→ erstes Audio hörbar
```

Dabei werden bereits gemessen:

- `turn_end → stt_final`
- `turn_end → llm_first_token`
- `turn_end → tts_first_audio`
- `turn_end → browser_audio_started`

Initiale Konfiguration:

- Deepgram `flux-general-multi`
- `languageHint: ["de"]`
- `eotThreshold: 0.75`
- `eotTimeoutMs: 5000`
- `eagerEotThreshold` deaktiviert
- GPT‑4.1 ohne Reasoning
- Deepgram Aura‑2 `aura-2-viktoria-de`
- knapper Voice-System-Prompt
- kurze gesprochene Antworten

`EagerEndOfTurn` wird erst in Phase 7 getestet. Es wird nur übernommen, wenn reale Messungen einen relevanten Vorteil zeigen und die zusätzlichen spekulativen LLM-Aufrufe vertretbar sind.

## 11. Error Handling

### Bereits im Voice-Spike erforderlich

- Mikrofonberechtigung verweigert.
- LiveKit-Token kann nicht erzeugt werden.
- Agent erscheint nicht in der Room.
- Provider-Key fehlt oder ist ungültig.
- STT-, LLM- oder TTS-Verbindung schlägt fehl.
- Benutzer beendet den Call.

Zunächst reichen klare UI-Fehler und strukturierte Logs; vollständige Recovery folgt in Phase 7.

### Finale Recovery-Regeln

| Fehler | Verhalten |
|---|---|
| Mikrofon verweigert | keine Session starten, Browseranleitung zeigen |
| LiveKit temporär getrennt | SDK-Reconnect, Zustand `connecting` |
| LiveKit terminal getrennt | Call beenden, Reconnect über das Handle-Cookie und frischen Token anbieten |
| Deepgram-STT-Fehler | Stream einmal neu verbinden, Turn nicht doppelt speichern |
| OpenAI Timeout | Antwort abbrechen und nächsten Turn erlauben |
| Deepgram-TTS-Timeout | Text anzeigen, fehlendes Audio klar kennzeichnen |
| Deepgram-TTS `429` | einmal mit kurzem Backoff wiederholen, dann Text-only-Turn mit sichtbarem Hinweis |
| Tool-Validierung | fehlende Felder erneut erfragen |
| Tool-DB-Fehler | keinen Erfolg bestätigen; idempotenten Retry erlauben |
| Transcript-DB-Fehler | Session weiterführen, Fehler korreliert loggen |
| Guardrail-Limit erreicht | Ende kurz ankündigen, Session sauber abschließen |

## 12. Testing Strategy

### Während Phase 1–2

Der wichtigste Test ist ein manueller Provider-Smoke-Test mit echtem deutschen Audio. Gemockte Tests können das zentrale Risiko nicht eliminieren.

Smoke-Szenarien:

- „Hallo Vera.“
- Satz mit kurzer Denkpause.
- längerer deutscher Satz.
- Nutzer beginnt zu sprechen, während Vera antwortet.
- Call beenden und neu starten.

### Voice-Transport-Abstraktion, entschieden in Phase 1

E2E-Tests gegen das LiveKit-SDK zu fahren bedeutet, WebRTC in Playwright zu mocken. Das ist aufwendig, brüchig und würde das Zeitbudget von Phase 8 aufbrauchen. Die Entscheidung fällt daher schon in Phase 1, weil sie die Struktur der Voice-Komponenten bestimmt und nachträglich teuer ist.

Die UI spricht ausschließlich gegen ein Interface:

```ts
interface VoiceTransport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  readonly state: VoiceState;          // idle | connecting | listening | thinking | tool | speaking | disconnecting | error
  onTranscript(cb: (t: TranscriptEvent) => void): Unsubscribe;
  onToolStatus(cb: (t: ToolStatusEvent) => void): Unsubscribe;
  onStateChange(cb: (s: VoiceState) => void): Unsubscribe;
}
```

- `LiveKitVoiceTransport` ist die echte Implementierung.
- `FakeVoiceTransport` spielt deterministische Skripte ab (Zustandsfolgen, Transcript-Events, Tool-Status, Fehler, verweigertes Mikrofon).
- Auswahl über `NEXT_PUBLIC_VOICE_TRANSPORT=fake` beziehungsweise `?voiceTransport=fake`, ausschließlich außerhalb von Production aktivierbar.

Playwright testet damit die eigene Zustandsmaschine und UI, nicht das SDK. Der echte Transport bleibt Gegenstand der manuellen Smoke-Tests.

### Unit Tests ab Phase 3

- Conversation Lifecycle inklusive `ABANDONED`- und `SESSION_LIMIT`-Pfad.
- Message-Reihenfolge und Idempotency, inklusive synthetischer `external_item_id`.
- `sequence`-Vergabe bei Worker-Neustart.
- Snapshot-Erstellung und Reader über `schemaVersion`.
- Prompt-Komposition inklusive nicht überschreibbarer Sicherheitsregel.
- Damage Report Validation und Mapping.
- Tool-Fehlercodes.
- State Reducer inklusive `tool`-Zustand.

### Integration Tests

- Conversation → Messages → Completed.
- Config-Änderung beeinflusst nur neue Conversations.
- Tool Call erzeugt genau einen Damage Report.
- Wiederholter `providerCallId` erzeugt kein Duplikat.
- Item ohne Provider-ID erzeugt bei Wiederholung kein Duplikat.
- Unterbrochene Assistant Message speichert gesprochenen Text in `content` und generierten Text in `metadata`.
- Sweeper setzt verwaiste `ACTIVE`-Conversations auf `ABANDONED`.
- Session-Endpunkt weist client-gesetzte `roomName`/`conversationId` mit `400` ab.
- History-Abfragen liefern Transcript und Tool Calls.

### E2E Tests

Playwright gegen `FakeVoiceTransport`:

- Start-/Stop-Flow.
- Mikrofon verweigert.
- Listening/Thinking/Tool/Speaking/Error.
- Reconnect nach terminalem Disconnect.
- Settings speichern, Sprachfeld nicht editierbar.
- History und Detailansicht, inklusive unterbrochener Nachricht.
- Tool-Erfolgsbadge.

Normale CI ruft keine externen AI-Provider auf. Echte Voice-Smoke-Tests werden separat dokumentiert.

## 13. Implementation Phases

### Zeitbudget

Das Gesamtbudget beträgt **3–4 Stunden Wall-Clock für eine KI-gestützte Umsetzung** der Phasen 1–8. Es ist keine Schätzung menschlicher Netto-Entwicklungszeit. Die Kalkulation setzt voraus, dass Provider-Accounts, Credentials, LiveKit Cloud und Docker zu Beginn verfügbar sind und keine externe Freischaltung abgewartet werden muss. Installation, Scaffolding, Codegenerierung und unabhängige Prüfungen werden soweit möglich parallelisiert.

Jede Phase besitzt einen harten Verification Gate. Bei einem Gate-Fehler wird nur innerhalb der angegebenen Debug-Timebox untersucht; anschließend greift der bereits festgelegte Fallback. Das verbindliche DoD wird nicht stillschweigend reduziert. Nicht kritischer visueller Polish und zusätzliche Testvarianten werden bei Zeitdruck als Follow-up dokumentiert.

| Phase | Timebox | Kumuliert |
|---|---|---|
| 1 — Monorepo, Voice UI, LiveKit | 15–20 min | 0:20 |
| 2 — Deutscher Voice Loop | 30–40 min (+ max. 10 min Gate-2-Debugging) | 1:10 |
| 3 — PostgreSQL und Persistence | 30–35 min | 1:45 |
| 4 — Settings und Snapshot | 15–20 min | 2:05 |
| 5 — `create_damage_report` | 20–25 min | 2:30 |
| 6 — Conversation History | 15–20 min | 2:50 |
| 7 — Barge-in, Latency, Errors | 20–25 min | 3:15 |
| 8 — Tests, Polish, README | 30–45 min | 4:00 |
| 9 — Auth (optional) | 20–30 min | — |

Überschreitet eine Phase ihre Timebox, wird zuerst der zugehörige Gate-Fallback genutzt. Falls eine externe Abhängigkeit blockiert, wird der betroffene Provider-Smoke-Test klar als Blocker ausgewiesen; lokal implementierbare Folgearbeit läuft weiter.

### Phase 1 — Monorepo, minimale Voice UI und LiveKit

**Ziel:** Browser und Node-Agent befinden sich in derselben LiveKit-Room.

**Timebox:** 15–20 Minuten.

**Tasks:**

- pnpm Workspace und Turborepo initialisieren.
- Minimales Next.js-Webprojekt und Node-Agent-Projekt.
- Environment-Validation für LiveKit und Provider-Keys.
- Coolify-kompatible Production-Dockerfiles, Compose-Service-Stack und Healthchecks für Web und Agent.
- `POST /api/voice-sessions` ohne DB und Auth, aber mit minimalen Token-Grants, 120s TTL, serverseitigem Room-Namen und IP-Rate-Limit.
- LiveKit Agent Dispatch konfigurieren.
- `VoiceTransport`-Interface plus `LiveKitVoiceTransport` anlegen; `FakeVoiceTransport` als Stub.
- Voice Screen mit Start, Stop, Status und leerem Transcript.
- Mikrofon veröffentlichen und Agent-Audio rendern.
- Statischer Vera-Config-Block.

**Betroffene Module:** Root Workspace, `apps/web`, `apps/agent`, `packages/config`, Dockerfiles und Compose.

**Dependencies:** LiveKit Cloud, `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.

**Definition of Done:**

- Browser verbindet sich.
- Agent wird dispatcht.
- Mikrofontrack erreicht die Room.
- Call kann sauber gestartet und beendet werden.
- Die UI greift nirgends direkt auf das LiveKit-SDK zu, sondern nur auf `VoiceTransport`.
- `docker compose config` ist valide; Web und Agent besitzen für Coolify nutzbare Healthchecks.

**Mindestlieferumfang:** Verbindung steht, Transport-Interface existiert. Rate-Limit darf auf einen In-Memory-Zähler reduziert werden.

### Phase 2 — Vollständiger deutscher Voice Loop

**Ziel:** Der größte technische Risikoblock ist real validiert.

**Timebox:** 30–40 Minuten, zuzüglich maximal 10 Minuten für Gate-2-Debugging.

**Tasks:**

- Deepgram `STTv2` mit `flux-general-multi`.
- Deutscher Language Hint und initiale EOT-Konfiguration.
- Sicherstellen, dass **keine** zweite Turn-Detection aktiv ist (siehe Gate 2).
- GPT‑4.1 über das LiveKit OpenAI Plugin.
- Deepgram Aura‑2 mit dem explizit deutschen, gepinnten Modell `aura-2-viktoria-de`; Qualitäts-Fallback `aura-2-elara-de`.
- Live Partial/Final Transcript.
- LiveKit Agent States im UI.
- Session-Guardrails: `MAX_SESSION_MS`, `IDLE_TIMEOUT_MS`, `MAX_TURNS`.
- Erste Latenzmessungen.
- Einfache Barge-in-Funktion aktivieren.
- Providerfehler sichtbar loggen.

**Betroffene Module:** `apps/agent/src/session`, `apps/agent/src/prompts`, `apps/agent/src/guardrails`, `apps/web/src/components/voice`.

**Dependencies:** Phase 1 sowie Deepgram- und OpenAI-Key. Derselbe Deepgram-Key wird für STT und TTS verwendet.

**Definition of Done:**

```text
Nutzer spricht Deutsch
→ Transcript erscheint
→ Vera generiert eine Antwort
→ Vera ist hörbar
```

Zusätzlich:

- zwei aufeinanderfolgende Turns funktionieren;
- eine kurze Denkpause beendet den Turn nicht zuverlässig zu früh;
- Zeit bis zum ersten Audio ist messbar;
- Idle-Timeout und Max-Dauer beenden die Session nachweislich.

Wenn dieses Gate nicht erreicht wird, beginnen DB, Settings, Tools und Auth noch nicht.

**Mindestlieferumfang:** Ein funktionierender Turn mit gemessener Latenz und aktiven Guardrails. Barge-in darf noch grob sein.

### Phase 3 — PostgreSQL, Agents und Conversation Persistence

**Ziel:** Der funktionierende Voice Loop wird dauerhaft nachvollziehbar.

**Timebox:** 30–35 Minuten.

**Tasks:**

- Docker Compose mit PostgreSQL.
- Drizzle-Schema und Migrationen, inklusive `agents` und Vera-Seed.
- Conversation vor dem Room-Connect erstellen, mit verpflichtendem Agent- und Runtime-Snapshot.
- `conversationId` in Agent-Dispatch-Metadaten, `sessionHandle` als HttpOnly-Cookie an den Browser.
- Finale User- und Assistant-Items idempotent speichern, `external_item_id` immer gesetzt, `sequence` in der Transaktion vergeben.
- Barge-in-Schreibverhalten: gesprochener Text in `content`, generierter Text in `metadata`, `was_interrupted`.
- Conversation Status, Ende und Dauer gemäß Abschluss-Tabelle, inklusive `ABANDONED`.
- `scripts/sweep-stale-conversations.ts`.
- Partial Transcripts weiterhin nur im UI.
- Minimale Conversation-Liste für technische Verifikation.

**Betroffene Module:** `packages/db`, `packages/core/src/conversations`, `packages/core/src/agents`, Agent Persistence Adapter, Voice Session API.

**Dependencies:** Phase 2.

**Definition of Done:**

- Ein beendeter Call erzeugt genau eine Conversation mit gefüllten Snapshots.
- Finale Messages erscheinen geordnet in PostgreSQL.
- Partials verursachen keine zusätzlichen Datensätze.
- Ein Worker-Kill hinterlässt keine dauerhaft `ACTIVE` Conversation.
- Ein DB-Fehler zerstört nicht unkontrolliert den Voice Worker.

**Mindestlieferumfang:** Conversations und Messages werden korrekt und idempotent geschrieben, Abschluss-Status ist gesetzt. Der Sweeper darf ein manuell auszuführendes Skript bleiben.

### Phase 4 — Settings und Config Snapshot

**Ziel:** Vera ist persistent konfigurierbar und alte Calls bleiben reproduzierbar.

**Timebox:** 15–20 Minuten.

**Tasks:**

- Settings UI für Name, Tonalität und System Prompt; Sprache als fixes, nicht editierbares Feld „Deutsch“.
- Zod-validierte Server Action.
- Prompt-Komposition: nicht überschreibbare Sicherheitsregel vor dem konfigurierten System Prompt.
- Snapshot-Reader über `schemaVersion`.
- Test mit „Friendly & Professional“ und „Concise“.

**Betroffene Module:** `packages/core/src/agents`, Agent-Repository, Settings Page, Prompt Builder, Voice Session API.

**Dependencies:** Phase 3.

**Definition of Done:**

- Settings überleben einen Neustart.
- Neue Sessions verwenden neue Settings.
- Alte Conversations zeigen unverändert ihren ursprünglichen Snapshot.
- Sprache ist nicht veränderbar und im UI als Non-Goal erkennbar.

**Mindestlieferumfang:** Tonalität und System Prompt persistent editierbar, Snapshot-Isolation nachgewiesen.

### Phase 5 — `create_damage_report`

**Ziel:** Der Bot führt eine echte, persistente Business-Aktion aus.

**Timebox:** 20–25 Minuten.

**Tasks:**

- Tool-Schema und klare Prompt-Regeln.
- DamageReportService und Repository-Port.
- ToolCall-/DamageReport-Transaktion.
- Idempotency über `providerCallId`.
- Strukturierte Tool Results.
- Live Toolstatus-Badge und `tool`-Zustand in der UI.

**Betroffene Module:** `packages/core/src/tools`, `packages/core/src/damage-reports`, `packages/db/src/repositories`, `apps/agent/src/tools`.

**Dependencies:** Phasen 3–4.

**Definition of Done:**

- Vera stellt bei unvollständigen Angaben Rückfragen.
- Nutzer bestätigt die Meldung.
- Genau ein Damage Report wird gespeichert.
- Erfolg wird erst nach Commit ausgesprochen.
- Bei einer Notfallschilderung nennt Vera zuerst den Notruf und weist darauf hin, dass die Meldung nicht weitergeleitet wird.
- Der Datensatz verweist auf Conversation und Tool Call.

**Mindestlieferumfang:** Tool schreibt transaktional und idempotent, Badge kann simpel sein.

### Phase 6 — Conversation History

**Ziel:** Die Demo kann nach dem Call das vollständige Ergebnis zeigen.

**Timebox:** 15–20 Minuten.

**Tasks:**

- Conversation-Liste mit Datum, Uhrzeit, Dauer, Agent und Status.
- Detailansicht mit User-/Assistant-Nachrichten.
- Kennzeichnung unterbrochener Nachrichten, generierter Resttext aufklappbar.
- Tool Calls, Argumente, Status und Damage Report.
- Snapshot-Anzeige für Name und Tonalität, mit Fallback bei unbekannter `schemaVersion`.
- Empty, Loading und Error States.

**Betroffene Module:** Web Conversations Pages, Conversation Queries, History Components.

**Dependencies:** Phasen 3–5.

**Definition of Done:**

- Der komplette Demo-Call ist nach dem Beenden auffindbar.
- Transcript, Tool Call und Damage Report stimmen mit der Session überein.
- Der angezeigte Assistant-Text entspricht dem, was tatsächlich zu hören war.

**Mindestlieferumfang:** Liste und Detailansicht mit Transcript, Tool Call und Damage Report.

### Ergänzung nach Phase 6 — Objektadresse

**Ziel:** Jede neue Schadensmeldung kann eindeutig einem betroffenen Objekt zugeordnet werden.

**Umfang:**

- Vera fragt fehlende Angaben zu Straße und Hausnummer sowie PLZ und Ort einzeln ab.
- Vera übernimmt den Namen der meldenden Person aus einer freien Vorstellung und fragt nur nach, wenn kein Name genannt wurde.
- Vera leitet die Dringlichkeit aus den geschilderten Fakten ab, statt den Nutzer eine technische Stufe auswählen zu lassen; nur unklare Auswirkungen oder Gefahren führen zu einer konkreten Rückfrage.
- Name und vollständige Objektadresse sind Teil der Zusammenfassung, die der Nutzer vor dem Speichern bestätigt.
- Neue Schadensmeldungen speichern Straße/Hausnummer, fünfstellige PLZ und Ort verpflichtend.
- Die Conversation-Detailansicht zeigt die Objektadresse beim Damage Report.
- Bestehende Schadensmeldungen bleiben durch nullable Datenbankspalten rückwärtskompatibel und werden mit „Nicht erfasst“ angezeigt.
- Terminwünsche und Nebenkostenfragen sind ausdrücklich keine Schadensmeldungen und werden über einen getrennten Anfragevorgang erfasst.

### Ergänzung nach Phase 6 — Termin-, Nebenkosten- und Vorgangsübersicht

**Ziel:** Häufige Anliegen außerhalb von Schäden werden als eigene Vorgänge erfasst und gemeinsam übersichtlich dargestellt.

**Umfang:**

- `create_service_request` speichert bestätigte Termin- und Nebenkostenanfragen getrennt von Damage Reports.
- Beide Anfragetypen enthalten Name, konkretes Anliegen und vollständige Objektadresse; Terminanfragen zusätzlich den gewünschten Termin oder Zeitraum.
- Vera behauptet weder eine verbindliche Terminbuchung noch Zugriff auf individuelle Abrechnungsdaten.
- Das fachliche Ergebnis steht in der Conversation-Detailansicht oberhalb des Transkripts.
- `/requests` zeigt Schäden, Terminwünsche und Nebenkostenanfragen gemeinsam, neueste zuerst, und verlinkt auf die Ursprungskonversation.
- Tool Calls und strukturierte Vorgänge werden transaktional und idempotent gespeichert.

### Phase 7 — Barge-in, Latency und Error Handling

**Ziel:** Der funktionierende Bot fühlt sich natürlich und belastbar an.

**Timebox:** 20–25 Minuten.

**Tasks:**

- Adaptive Interruption Handling verifizieren.
- False-Interruption-Verhalten testen.
- Unterbrochene Assistant Messages reconciliieren und gegen die History prüfen.
- EOT-Schwellen anhand deutscher Testfälle tunen.
- Optionalen Eager-EOT-Vergleich messen.
- Provider-Timeouts und begrenzte Retries, inklusive Deepgram-TTS `429`.
- Reconnect UI mit Token-Refresh über das Handle-Cookie.
- Strukturierte Latenzlogs und Korrelations-IDs.
- Prompt- und TTS-Chunking optimieren.

**Betroffene Module:** Agent Session, Observability, Voice State UI, Persistence Reconciliation.

**Dependencies:** Phasen 2–6.

**Definition of Done:**

- Nutzer kann Vera hörbar unterbrechen.
- Kurze Denkpausen funktionieren in den definierten Testfällen.
- Fehler führen zu einem verständlichen UI-Zustand.
- Reconnect funktioniert nachweislich mit abgelaufenem Ursprungstoken.
- Turn-Ende bis erstes Audio ist für mehrere Test-Turns dokumentiert.
- Eager EOT wird nur aktiviert, wenn Messwerte es rechtfertigen.

**Mindestlieferumfang:** Barge-in funktioniert, Reconnect funktioniert, Latenzwerte sind dokumentiert.

### Phase 8 — Tests, Polish und README

**Ziel:** Challenge ist reproduzierbar, präsentierbar und prüfbar.

**Timebox:** 30–45 Minuten.

**Tasks:**

- Unit-, Integration- und E2E-Tests gemäß Abschnitt 12.
- CI für Typecheck, Lint, Unit und DB-Integration.
- Responsive SaaS-UI und hochwertiger Voice Orb.
- Demo-Daten, Reset-/Seed-Flow und Sweeper-Aufruf.
- README mit Architektur, Setup, Entscheidungen und Trade-offs. Verpflichtend enthalten:
  - Deployment-Modell und warum der Agent-Worker nicht serverless läuft;
  - Coolify-Service-Stack, Domain-Zuordnung nur für `web`, Runtime-Secrets, Healthchecks, Migrationen, Agent-Drain-Zeit und PostgreSQL-Backups;
  - Gate-2-Ergebnis mit gewähltem STT-Modell und Messwerten;
  - Non-Goals: Mehrsprachigkeit, Notfall-Eskalation, Auth (falls Phase 9 entfällt);
  - Session-Guardrails und Kostenhinweis;
  - Hinweis, dass die Anwendung ohne Phase 9 nicht öffentlich exponiert werden darf.
- Manuelle Provider-Smoke-Checkliste.
- Demo-Drehbuch.

**Betroffene Module:** Gesamtes Repository, Tests, README und CI.

**Dependencies:** Phasen 1–7.

**Definition of Done:**

```text
pnpm install
docker compose up -d
pnpm db:migrate
pnpm db:seed
pnpm dev
```

reichen zusammen mit Provider-Credentials aus, um die Demo reproduzierbar zu starten.

Zusätzlich muss derselbe Git-Stand in Coolify über den Compose Build Pack deploybar sein, ohne manuelle Änderungen am Image. Nach dem Deployment müssen Web- und Agent-Healthcheck grün sein und ein Voice-Smoke-Test über die öffentliche HTTPS-Domain funktionieren.

**Mindestlieferumfang:** README vollständig, Unit- und Integrationstests grün, E2E auf Start/Stop plus einen Fehlerpfad begrenzt.

### Phase 9 — Auth, ausdrücklich optional

**Ziel:** Öffentliche Settings und History durch einen Demo-Login schützen.

**Timebox:** 20–30 Minuten.

**Startbedingung:** Nur beginnen, wenn sämtliche Definitions of Done aus Phase 1–8 erfüllt sind. Auth ist kein Ersatz für Voice-, Tool-, Test- oder Error-Handling-Arbeit.

**Tasks:**

- Auth.js Credentials.
- Demo-Admin mit Passwort-Hash.
- Geschützte Settings-, History- und Voice-Session-Routen.
- Login UI und Logout.
- Optional `started_by_user_id`.

**Definition of Done:**

- Unauthentifizierte Zugriffe werden abgewiesen.
- Login und Logout funktionieren.
- Secrets und Passwort-Hashes werden nicht exponiert.

Das Rate-Limit und die minimalen Token-Grants aus Phase 1 bleiben unabhängig davon bestehen; Auth ersetzt sie nicht.

## 14. Risks / Verification Gates

### Gate 1 — LiveKit-Verbindung

Vor Providerintegration müssen Browser, Room und Agent zuverlässig verbunden sein.

### Gate 2 — Deutscher STT-Support, mit Timebox und freigegebenem Fallback

**Ausgangslage, ehrlich benannt:** Deepgram Flux ist als konversationelles Modell mit eingebauter Turn Detection gestartet und war zunächst englisch-only. Dass `flux-general-multi` und `languageHint` in den Typings von `@livekit/agents-plugin-deepgram@1.6.2` vorkommen, ist **kein** Nachweis, dass der Endpunkt sie akzeptiert — Typings laufen Backends regelmäßig voraus. Unabhängig davon ist die EOT-Qualität auf deutscher Prosodie eine eigene Frage: Verbklammer und trennbare Präfixe lassen Satzenden anders klingen als im Englischen.

**Konfigurationsfalle, in Phase 2 explizit zu prüfen:** Liefert Flux die Turn-Events, darf LiveKit-seitig **keine** zweite Turn-Detection aktiv sein. VAD-basierte oder semantische Turn Detection parallel zu Flux erzeugt doppelte EOT-Signale und damit abgeschnittene oder doppelte Turns. Diese Prüfung gehört in Phase 2, nicht in Phase 7.

**Timebox:** Für Gate-2-Debugging stehen maximal 10 Minuten zur Verfügung.

**Eskalation in dieser Reihenfolge:**

1. Kompatible Plugin-Version prüfen (maximal 3 Minuten).
2. **Freigegebener Fallback:** Deepgram Nova-3 (multilingual) plus LiveKit Turn Detector Plugin. Das ist ein Modellwechsel innerhalb Deepgram, kein Providerwechsel, und ausdrücklich erlaubt. `RuntimeSnapshotV1.stt.model` ist deshalb `string`.
3. Erst wenn auch das scheitert, ein schmaler eigener LiveKit-STT-Adapter — und nur mit bewusster Neubewertung des Gesamtbudgets. Ein eigener Adapter ist kein Fallback innerhalb einer Timebox, sondern ein zweites Teilprojekt.
4. Ein Wechsel des STT-**Providers** findet nicht stillschweigend statt.

**Dokumentation:** Das gewählte Modell, der Grund und die Messwerte gehen ins README. Ein bewusst begründeter Nova-3-Pfad ist ein besseres Ergebnis als ein halb funktionierendes Flux.

### Gate 3 — LLM → TTS Streaming

Es muss bestätigt werden, dass Audio vor Ende der vollständigen Modellantwort startet. Tool-JSON darf niemals in die TTS-Ausgabe gelangen.

Zusätzlich zu verifizieren: welchen OpenAI-Endpunkt das JS-Plugin in der gepinnten Version tatsächlich verwendet — Responses API oder Chat Completions. Funktional ist beides tragfähig; Abschnitt 9 darf es aber nicht als Faktum behaupten, bevor es geprüft ist. Das Ergebnis wird dort und im README festgehalten.

### Gate 4 — Turn Detection

Kurze deutsche Denkpausen und Satzabbrüche werden mit festen Beispielen getestet. Ein niedriger Messwert allein rechtfertigt keine aggressivere Turn Detection.

### Gate 5 — Barge-in

Vor Eigenbau werden LiveKit Adaptive Interruption, VAD, Echo Cancellation und Cancellation vollständig genutzt.

### Weitere Risiken

- Provider-Quotas oder falsche Regionswahl.
- **Deepgram-TTS-Quotas:** STT und TTS teilen sich ein Providerkonto, besitzen aber eigene Rate- und Concurrency-Limits. Beim parallelen Testen können `429`-Fehler entstehen. Behandlung siehe Abschnitt 11; die Limits des genutzten Plans werden im README notiert.
- Die gewählte Aura‑2-Stimme klingt auf Deutsch möglicherweise weniger natürlich als erwartet. Mitigation: `aura-2-viktoria-de` in Phase 2 gegen deutsches Testmaterial prüfen und `aura-2-elara-de` als Qualitäts-Fallback messen.
- Persistierter Assistant-Text entspricht bei Barge-in nicht exakt dem gehörten Text. Mitigation siehe Abschnitt 4.
- Tool-Retry erzeugt ohne Idempotency Duplikate.
- Kostenrisiko durch offen gelassene Sessions. Mitigation: Session-Guardrails ab Phase 2.
- Unauthentifizierter Session-Endpunkt als offener Kostenhahn. Mitigation: minimale Grants, kurze TTL, Rate-Limit ab Phase 1.
- SDK-Upgrades verändern Agent Events oder Transcript-Verhalten.

LiveKit-Pakete werden gemeinsam auf derselben Minor-Version fixiert und nur mit erneutem Voice-Smoke-Test aktualisiert.

## 15. Scope Check

### Verbindliches Challenge-DoD

- ✅ Browser-Mikrofon
- ✅ LiveKit WebRTC und Agent Dispatch
- ✅ deutscher Deepgram-Stream (Flux, Fallback Nova-3 gemäß Gate 2)
- ✅ GPT‑4.1 Streaming
- ✅ Deepgram Aura‑2 Streaming TTS
- ✅ erster funktionierender Voice Call bereits in Phase 2
- ✅ Start und Stop
- ✅ Live Partial/Final Transcript
- ✅ Conversation Persistence
- ✅ Conversation History
- ✅ Name, Tonalität und System Prompt konfigurierbar; Sprache bewusst auf Deutsch festgelegt
- ✅ Config Snapshot pro Conversation
- ✅ `create_damage_report`
- ✅ Tool- und Damage-Report-Persistenz
- ✅ Barge-in
- ✅ messbare Latenz
- ✅ Error Handling
- ✅ Session- und Kosten-Guardrails
- ✅ hochwertige UI
- ✅ Tests und README

### Optional und nicht blockierend

- ◻ Auth.js
- ◻ TTS-Stimmenauswahl
- ◻ weitere Tools
- ◻ Latency Dashboard
- ◻ Summary
- ◻ Redis
- ◻ NestJS
- ◻ Multi-Tenancy
- ◻ SIP/Telefonie
- ◻ RAG
- ◻ Recording und Analytics

### Ausdrückliche Non-Goals

- Mehrsprachigkeit. Sprache ist auf Deutsch festgelegt, weil STT-Hint, TTS-Voice und Prompt gemeinsam wechseln müssten.
- Notfall-Eskalation. `EMERGENCY` erzeugt nur einen Datensatz; der Prompt verweist auf den Notruf und stellt klar, dass keine Weiterleitung erfolgt.
- Öffentlicher Betrieb ohne Phase 9.

Die Implementierungsreihenfolge folgt damit dem Hauptrisiko: Erst beweisen, dass sich der deutsche Voice-Loop technisch und qualitativ trägt; danach Produkt- und Persistenzfunktionen darum aufbauen.
