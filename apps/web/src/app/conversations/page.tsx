import Link from "next/link";
import { getWebEnv } from "@heyvera/config";
import { createDatabase, DrizzleConversationRepository } from "@heyvera/db";

export const dynamic = "force-dynamic";

function duration(value: number | null): string {
  if (value === null) return "–";
  const seconds = Math.round(value / 1_000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} min`;
}

export default async function ConversationsPage() {
  const env = getWebEnv();
  const database = createDatabase(env.DATABASE_URL, { max: 1 });
  const rows = await new DrizzleConversationRepository(database.db).list().finally(() => database.close());

  return (
    <main className="history-shell">
      <nav className="nav">
        <Link className="brand-link" href="/"><span className="brand-mark">V</span><span className="brand">HeyVera</span></Link>
        <Link className="nav-link" href="/settings">Settings</Link>
        <span className="phase-badge">Phase 4 · History</span>
      </nav>
      <section className="history-card">
        <p className="eyebrow">TECHNISCHE VERIFIKATION</p>
        <h1>Conversations</h1>
        <p className="history-intro">Persistierte Voice-Sessions, neueste zuerst.</p>
        <div className="history-table-wrap">
          <table className="history-table">
            <thead><tr><th>Zeitpunkt</th><th>Agent</th><th>Status</th><th>Dauer</th><th>Fehlercode</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.createdAt.toLocaleString("de-DE")}</td>
                  <td>{row.agentName}</td>
                  <td><span className={`status-pill status-${row.status.toLowerCase()}`}>{row.status}</span></td>
                  <td>{duration(row.durationMs)}</td>
                  <td>{row.failureCode ?? "–"}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td className="history-empty" colSpan={5}>Noch keine Conversations gespeichert.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
