import { DrizzleIntakeRepository } from "@heyvera/db";
import Link from "next/link";
import { AdminNav } from "@/components/admin/admin-nav";
import { requireAdmin } from "@/lib/admin-auth";
import { getWebDatabase } from "@/lib/database";

export const dynamic = "force-dynamic";

const kindLabels = { DAMAGE: "Schadensmeldung", APPOINTMENT: "Terminanfrage", BILLING: "Nebenkostenanfrage" } as const;
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
    <main className="admin-shell">
      <AdminNav active="requests" />
      <section className="admin-content requests-page">
        <div className="page-heading">
          <div>
            <h1>Alle Meldungen.</h1>
            <p>Schäden, Terminwünsche und Nebenkostenanfragen – neueste zuerst.</p>
          </div>
        </div>
        <div className="request-stats">
          <div className="stat-total">
            <strong>{counts.total}</strong>
            <span>Gesamt</span>
          </div>
          <div className="stat-damage">
            <strong>{counts.damage}</strong>
            <span>Schäden</span>
          </div>
          <div className="stat-appointment">
            <strong>{counts.appointments}</strong>
            <span>Termine</span>
          </div>
          <div className="stat-billing">
            <strong>{counts.billing}</strong>
            <span>Nebenkosten</span>
          </div>
        </div>
        <div className="data-grid requests-grid">
          <div className="data-grid-head">
            <span>ZEITPUNKT</span>
            <span>TYP</span>
            <span>PERSON / OBJEKT</span>
            <span>ANLIEGEN</span>
            <span>PRIORITÄT</span>
            <span>STATUS</span>
            <span />
          </div>
          {rows.map((row) => (
            <article className="data-grid-row" key={`${row.kind}-${row.id}`}>
              <Link
                className="data-primary numeric"
                data-label="Zeitpunkt"
                href={`/conversations/${row.conversationId}`}
              >
                {row.createdAt.toLocaleString("de-DE")}
              </Link>
              <span data-label="Typ">
                <span className={`request-kind request-kind-${row.kind.toLowerCase()}`}>{kindLabels[row.kind]}</span>
              </span>
              <span className="request-person" data-label="Person / Objekt">
                <strong>{row.reporterName ?? "Nicht erfasst"}</strong>
                <small>{requestAddress(row)}</small>
              </span>
              <span className="request-description" data-label="Anliegen">
                {row.description}
              </span>
              <span
                className={row.urgency ? `priority priority-${row.urgency.toLowerCase()}` : "priority"}
                data-label="Priorität"
              >
                {requestPriority(row)}
              </span>
              <span data-label="Status">
                <span className="status-pill status-succeeded">
                  <i className="pill-dot" />
                  {row.status}
                </span>
              </span>
              <Link className="data-action" data-label="Conversation" href={`/conversations/${row.conversationId}`}>
                Conversation →
              </Link>
            </article>
          ))}
          {rows.length === 0 && <div className="data-empty">Noch keine Meldungen oder Anfragen gespeichert.</div>}
        </div>
      </section>
    </main>
  );
}
