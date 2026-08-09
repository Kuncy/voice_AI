import { readAgentSnapshotForHistory } from "@heyvera/core";
import { DrizzleConversationRepository } from "@heyvera/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LogoutButton } from "@/components/admin/logout-button";
import { requireAdmin } from "@/lib/admin-auth";
import { getWebDatabase } from "@/lib/database";
import { DeleteConversationButton } from "./delete-conversation-button";

export const dynamic = "force-dynamic";

const categoryLabels = {
  HEATING: "Heizung",
  WATER: "Wasser",
  ELECTRICITY: "Elektrik",
  STRUCTURAL: "Gebäudeschaden",
  OTHER: "Sonstiges",
} as const;
const urgencyLabels = { LOW: "Niedrig", MEDIUM: "Mittel", HIGH: "Hoch", EMERGENCY: "Notfall" } as const;
const serviceRequestLabels = { APPOINTMENT: "Terminanfrage", BILLING: "Nebenkostenanfrage" } as const;
const roleLabels = { USER: "Du", ASSISTANT: "Vera", SYSTEM: "System", TOOL: "Tool" } as const;

type ConversationDetail = NonNullable<Awaited<ReturnType<DrizzleConversationRepository["getDetail"]>>>;
type DetailToolCall = ConversationDetail["toolCalls"][number];

function duration(value: number | null): string {
  if (value === null) return "–";
  const seconds = Math.round(value / 1_000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} min`;
}

function offset(value: Date, base: Date): string {
  const seconds = Math.max(0, Math.round((value.getTime() - base.getTime()) / 1_000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function generatedText(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== "object" || !("generatedText" in metadata)) return undefined;
  const value = (metadata as { generatedText?: unknown }).generatedText;
  return typeof value === "string" ? value : undefined;
}

function json(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "Nicht darstellbar";
  }
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function damageAddress(call: DetailToolCall): string {
  if (!call.damageStreetAndHouseNumber || !call.damagePostalCode || !call.damageCity) return "Nicht erfasst";
  return `${call.damageStreetAndHouseNumber}, ${call.damagePostalCode} ${call.damageCity}`;
}

function IntakeResultCard({ call }: { call: DetailToolCall }) {
  if (call.damageReportId) {
    return (
      <article className="intake-result-card intake-result-damage">
        <header>
          <div>
            <span className="tool-kicker">SCHADENSMELDUNG</span>
            <h3>#{call.damageReportId.slice(0, 8)}</h3>
          </div>
          <span className="status-pill status-succeeded">{call.damageStatus}</span>
        </header>
        <p>{call.damageDescription}</p>
        <dl>
          <div>
            <dt>Gemeldet von</dt>
            <dd>{call.damageReporterName ?? "Nicht erfasst"}</dd>
          </div>
          <div>
            <dt>Objektadresse</dt>
            <dd>{damageAddress(call)}</dd>
          </div>
          {call.damageCategory && (
            <div>
              <dt>Kategorie</dt>
              <dd>{categoryLabels[call.damageCategory]}</dd>
            </div>
          )}
          {call.damageUrgency && (
            <div>
              <dt>Dringlichkeit</dt>
              <dd>{urgencyLabels[call.damageUrgency]}</dd>
            </div>
          )}
        </dl>
      </article>
    );
  }

  if (!call.serviceRequestId || !call.serviceRequestType) return null;
  return (
    <article className="intake-result-card intake-result-service">
      <header>
        <div>
          <span className="tool-kicker">{serviceRequestLabels[call.serviceRequestType].toUpperCase()}</span>
          <h3>#{call.serviceRequestId.slice(0, 8)}</h3>
        </div>
        <span className="status-pill status-succeeded">{call.serviceStatus}</span>
      </header>
      <p>{call.serviceDescription}</p>
      <dl>
        <div>
          <dt>Angefragt von</dt>
          <dd>{call.serviceReporterName}</dd>
        </div>
        <div>
          <dt>Objektadresse</dt>
          <dd>
            {call.serviceStreetAndHouseNumber}, {call.servicePostalCode} {call.serviceCity}
          </dd>
        </div>
        {call.servicePreferredTimeframe && (
          <div>
            <dt>Terminwunsch</dt>
            <dd>{call.servicePreferredTimeframe}</dd>
          </div>
        )}
      </dl>
    </article>
  );
}

function ToolCallCard({ call, startedAt }: { call: DetailToolCall; startedAt: Date }) {
  return (
    <article className="tool-history-card">
      <header>
        <div>
          <span className="tool-kicker">{offset(call.createdAt, startedAt)} · TOOL</span>
          <h3>{call.toolName}</h3>
        </div>
        <span className={`status-pill status-${call.status.toLowerCase()}`}>{call.status}</span>
      </header>
      <dl className="tool-meta">
        <div>
          <dt>Provider Call ID</dt>
          <dd>{call.providerCallId}</dd>
        </div>
        <div>
          <dt>Laufzeit</dt>
          <dd>{call.durationMs === null ? "–" : `${call.durationMs} ms`}</dd>
        </div>
        {call.errorCode && (
          <div>
            <dt>Fehlercode</dt>
            <dd>{call.errorCode}</dd>
          </div>
        )}
      </dl>
      <details className="raw-details">
        <summary>Argumente und Ergebnis</summary>
        <pre>{json({ arguments: call.arguments, result: call.result })}</pre>
      </details>
    </article>
  );
}

export default async function ConversationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) notFound();

  const detail = await new DrizzleConversationRepository(getWebDatabase().db).getDetail(id);
  if (!detail) notFound();

  const { conversation, messages, toolCalls } = detail;
  const snapshot = readAgentSnapshotForHistory(conversation.agentSnapshot);
  const startedAt = conversation.startedAt ?? conversation.createdAt;
  const intakeCalls = toolCalls.filter((call) => call.damageReportId || call.serviceRequestId);

  return (
    <main className="history-shell">
      <nav className="nav">
        <Link className="brand-link" href="/">
          <span className="brand-mark">V</span>
          <span className="brand">HeyVera</span>
        </Link>
        <Link className="nav-link" href="/settings">
          Settings
        </Link>
        <Link className="nav-link" href="/requests">
          Vorgänge
        </Link>
        <LogoutButton />
        <span className="phase-badge">Phase 6 · Detail</span>
      </nav>

      <section className="history-card detail-page">
        <Link className="history-back" href="/conversations">
          ← Alle Conversations
        </Link>
        <div className="detail-heading">
          <div>
            <p className="eyebrow">CONVERSATION</p>
            <h1>{conversation.createdAt.toLocaleString("de-DE")}</h1>
          </div>
          <span className={`status-pill status-${conversation.status.toLowerCase()}`}>{conversation.status}</span>
        </div>

        <div className="detail-facts">
          <div>
            <span>Agent</span>
            <strong>{snapshot.supported ? snapshot.snapshot.name : "Unbekannt"}</strong>
          </div>
          <div>
            <span>Tonalität</span>
            <strong>{snapshot.supported ? snapshot.snapshot.tone : "Nicht verfügbar"}</strong>
          </div>
          <div>
            <span>Dauer</span>
            <strong>{duration(conversation.durationMs)}</strong>
          </div>
          <div>
            <span>Room</span>
            <strong>{conversation.livekitRoomName}</strong>
          </div>
        </div>

        {!snapshot.supported && (
          <section className="history-warning">
            <strong>Snapshot-Version nicht unterstützt</strong>
            <p>Die Conversation bleibt sichtbar, aber Name und Tonalität konnten nicht sicher gelesen werden.</p>
            <details>
              <summary>Rohdaten anzeigen</summary>
              <pre>{json(snapshot.raw)}</pre>
            </details>
          </section>
        )}

        <section className="detail-section result-section">
          <div className="section-heading">
            <h2>Ergebnis</h2>
            <span>{countLabel(intakeCalls.length, "Vorgang", "Vorgänge")}</span>
          </div>
          {intakeCalls.length === 0 ? (
            <div className="detail-empty">In diesem Gespräch wurde noch kein strukturierter Vorgang aufgenommen.</div>
          ) : (
            <div className="intake-result-list">
              {intakeCalls.map((call) => (
                <IntakeResultCard call={call} key={call.id} />
              ))}
            </div>
          )}
        </section>

        <section className="detail-section">
          <div className="section-heading">
            <h2>Gesprächsverlauf</h2>
            <span>{countLabel(messages.length, "Beitrag", "Beiträge")}</span>
          </div>
          {messages.length === 0 ? (
            <div className="detail-empty">Für diese Conversation wurden keine finalen Nachrichten gespeichert.</div>
          ) : (
            <div className="history-transcript">
              {messages.map((message) => {
                const fullText = generatedText(message.metadata);
                const showGenerated = message.wasInterrupted && fullText && fullText !== message.content;
                return (
                  <article className={`history-message history-message-${message.role.toLowerCase()}`} key={message.id}>
                    <div className="message-meta">
                      <strong>{roleLabels[message.role]}</strong>
                      <time>{offset(message.startedAt ?? message.createdAt, startedAt)}</time>
                      {message.wasInterrupted && <span className="interrupted-badge">unterbrochen</span>}
                    </div>
                    <p>{message.content}</p>
                    {showGenerated && (
                      <details className="generated-copy">
                        <summary>Vollständig generierten Text anzeigen</summary>
                        <p>{fullText}</p>
                      </details>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="detail-section">
          <div className="section-heading">
            <h2>Aktionen & Schadensmeldungen</h2>
            <span>{countLabel(toolCalls.length, "Aktion", "Aktionen")}</span>
          </div>
          {toolCalls.length === 0 ? (
            <div className="detail-empty">In diesem Gespräch wurde keine Aktion ausgeführt.</div>
          ) : (
            <div className="tool-history-list">
              {toolCalls.map((call) => (
                <ToolCallCard call={call} key={call.id} startedAt={startedAt} />
              ))}
            </div>
          )}
        </section>
        {!["STARTING", "ACTIVE"].includes(conversation.status) && (
          <section className="detail-section danger-zone">
            <div>
              <h2>Daten löschen</h2>
              <p>Entfernt diese Conversation und alle zugehörigen Nachrichten, Tool-Aufrufe und Vorgänge.</p>
            </div>
            <DeleteConversationButton conversationId={conversation.id} />
          </section>
        )}
      </section>
    </main>
  );
}
