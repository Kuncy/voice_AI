import Link from "next/link";
import { getWebEnv } from "@heyvera/config";
import { createDatabase, DrizzleIntakeRepository } from "@heyvera/db";

export const dynamic = "force-dynamic";

const kindLabels = {
  DAMAGE: "Schadensmeldung",
  APPOINTMENT: "Terminanfrage",
  BILLING: "Nebenkostenanfrage",
} as const;

const urgencyLabels = { LOW: "Niedrig", MEDIUM: "Mittel", HIGH: "Hoch", EMERGENCY: "Notfall" } as const;

export default async function RequestsPage() {
  const env = getWebEnv();
  const database = createDatabase(env.DATABASE_URL, { max: 1 });
  const rows = await new DrizzleIntakeRepository(database.db).list().finally(() => database.close());

  return (
    <main className="history-shell">
      <nav className="nav">
        <Link className="brand-link" href="/"><span className="brand-mark">V</span><span className="brand">HeyVera</span></Link>
        <Link className="nav-link" href="/conversations">Conversations</Link>
        <Link className="nav-link" href="/settings">Settings</Link>
        <span className="phase-badge">Intake · Übersicht</span>
      </nav>
      <section className="history-card requests-page">
        <p className="eyebrow">VORGANGSÜBERSICHT</p>
        <h1>Alle Meldungen.</h1>
        <p className="history-intro">Schäden, Terminwünsche und Nebenkostenanfragen – neueste zuerst.</p>
        <div className="request-stats">
          <div><strong>{rows.length}</strong><span>Gesamt</span></div>
          <div><strong>{rows.filter((row) => row.kind === "DAMAGE").length}</strong><span>Schäden</span></div>
          <div><strong>{rows.filter((row) => row.kind === "APPOINTMENT").length}</strong><span>Termine</span></div>
          <div><strong>{rows.filter((row) => row.kind === "BILLING").length}</strong><span>Nebenkosten</span></div>
        </div>
        <div className="history-table-wrap">
          <table className="history-table requests-table">
            <thead><tr><th>Zeitpunkt</th><th>Typ</th><th>Person / Objekt</th><th>Anliegen</th><th>Priorität</th><th>Status</th><th /></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.kind}-${row.id}`}>
                  <td>{row.createdAt.toLocaleString("de-DE")}</td>
                  <td><span className={`request-kind request-kind-${row.kind.toLowerCase()}`}>{kindLabels[row.kind]}</span></td>
                  <td><strong>{row.reporterName ?? "Nicht erfasst"}</strong><small>{row.streetAndHouseNumber ? `${row.streetAndHouseNumber}, ${row.postalCode} ${row.city}` : "Adresse nicht erfasst"}</small></td>
                  <td className="request-description">{row.description}</td>
                  <td>{row.urgency ? urgencyLabels[row.urgency] : row.preferredTimeframe ?? "–"}</td>
                  <td><span className="status-pill status-succeeded">{row.status}</span></td>
                  <td><Link className="history-detail-link" href={`/conversations/${row.conversationId}`}>Conversation →</Link></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td className="history-empty" colSpan={7}>Noch keine Meldungen oder Anfragen gespeichert.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
