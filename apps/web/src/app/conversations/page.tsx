import { readAgentSnapshotForHistory } from "@heyvera/core";
import { DrizzleConversationRepository } from "@heyvera/db";
import Link from "next/link";
import { LogoutButton } from "@/components/admin/logout-button";
import { requireAdmin } from "@/lib/admin-auth";
import { getWebDatabase } from "@/lib/database";

export const dynamic = "force-dynamic";

function duration(value: number | null): string {
  if (value === null) return "–";
  const seconds = Math.round(value / 1_000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} min`;
}

export default async function ConversationsPage() {
  await requireAdmin();
  const rows = await new DrizzleConversationRepository(getWebDatabase().db).list();

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
        <span className="phase-badge">Conversations · Übersicht</span>
      </nav>
      <section className="history-card">
        <p className="eyebrow">TECHNISCHE VERIFIKATION</p>
        <h1>Conversations</h1>
        <p className="history-intro">Persistierte Voice-Sessions, neueste zuerst.</p>
        <div className="history-table-wrap">
          <table className="history-table">
            <thead>
              <tr>
                <th>Zeitpunkt</th>
                <th>Agent</th>
                <th>Status</th>
                <th>Dauer</th>
                <th>Fehlercode</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const agent = readAgentSnapshotForHistory(row.agentSnapshot);
                return (
                  <tr key={row.id}>
                    <td>
                      <Link className="history-primary-link" href={`/conversations/${row.id}`}>
                        {row.createdAt.toLocaleString("de-DE")}
                      </Link>
                    </td>
                    <td>{agent.supported ? agent.snapshot.name : "Unbekannter Snapshot"}</td>
                    <td>
                      <span className={`status-pill status-${row.status.toLowerCase()}`}>{row.status}</span>
                    </td>
                    <td>{duration(row.durationMs)}</td>
                    <td>{row.failureCode ?? "–"}</td>
                    <td>
                      <Link className="history-detail-link" href={`/conversations/${row.id}`}>
                        Ansehen →
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td className="history-empty" colSpan={6}>
                    Noch keine Conversations gespeichert.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
