import { DrizzleIntakeRepository } from "@heyvera/db";
import Link from "next/link";
import { LogoutButton } from "@/components/admin/logout-button";
import { requireAdmin } from "@/lib/admin-auth";
import { getWebDatabase } from "@/lib/database";

export const dynamic = "force-dynamic";

const kindLabels = {
  DAMAGE: "Schadensmeldung",
  APPOINTMENT: "Terminanfrage",
  BILLING: "Nebenkostenanfrage",
} as const;

const urgencyLabels = { LOW: "Niedrig", MEDIUM: "Mittel", HIGH: "Hoch", EMERGENCY: "Notfall" } as const;

type IntakeRow = Awaited<ReturnType<DrizzleIntakeRepository["list"]>>[number];

function requestAddress(row: IntakeRow): string {
  if (!row.streetAndHouseNumber) return "Adresse nicht erfasst";
  return `${row.streetAndHouseNumber}, ${row.postalCode} ${row.city}`;
}

function requestPriority(row: IntakeRow): string {
  if (row.urgency) return urgencyLabels[row.urgency];
  return row.preferredTimeframe ?? "–";
}

export default async function RequestsPage() {
  await requireAdmin();
  const rows = await new DrizzleIntakeRepository(getWebDatabase().db).list();
  const counts = {
    total: rows.length,
    damage: rows.filter((row) => row.kind === "DAMAGE").length,
    appointments: rows.filter((row) => row.kind === "APPOINTMENT").length,
    billing: rows.filter((row) => row.kind === "BILLING").length,
  };

  return (
    <main className="history-shell">
      <nav className="nav">
        <Link className="brand-link" href="/">
          <span className="brand-mark">V</span>
          <span className="brand">HeyVera</span>
        </Link>
        <Link className="nav-link" href="/conversations">
          Conversations
        </Link>
        <Link className="nav-link" href="/settings">
          Settings
        </Link>
        <LogoutButton />
        <span className="phase-badge">Intake · Übersicht</span>
      </nav>
      <section className="history-card requests-page">
        <p className="eyebrow">VORGANGSÜBERSICHT</p>
        <h1>Alle Meldungen.</h1>
        <p className="history-intro">Schäden, Terminwünsche und Nebenkostenanfragen – neueste zuerst.</p>
        <div className="request-stats">
          <div>
            <strong>{counts.total}</strong>
            <span>Gesamt</span>
          </div>
          <div>
            <strong>{counts.damage}</strong>
            <span>Schäden</span>
          </div>
          <div>
            <strong>{counts.appointments}</strong>
            <span>Termine</span>
          </div>
          <div>
            <strong>{counts.billing}</strong>
            <span>Nebenkosten</span>
          </div>
        </div>
        <div className="history-table-wrap">
          <table className="history-table requests-table">
            <thead>
              <tr>
                <th>Zeitpunkt</th>
                <th>Typ</th>
                <th>Person / Objekt</th>
                <th>Anliegen</th>
                <th>Priorität</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.kind}-${row.id}`}>
                  <td>{row.createdAt.toLocaleString("de-DE")}</td>
                  <td>
                    <span className={`request-kind request-kind-${row.kind.toLowerCase()}`}>
                      {kindLabels[row.kind]}
                    </span>
                  </td>
                  <td>
                    <strong>{row.reporterName ?? "Nicht erfasst"}</strong>
                    <small>{requestAddress(row)}</small>
                  </td>
                  <td className="request-description">{row.description}</td>
                  <td>{requestPriority(row)}</td>
                  <td>
                    <span className="status-pill status-succeeded">{row.status}</span>
                  </td>
                  <td>
                    <Link className="history-detail-link" href={`/conversations/${row.conversationId}`}>
                      Conversation →
                    </Link>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td className="history-empty" colSpan={7}>
                    Noch keine Meldungen oder Anfragen gespeichert.
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
