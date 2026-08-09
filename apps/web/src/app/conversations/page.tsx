import { DrizzleConversationRepository } from "@heyvera/db";
import Link from "next/link";
import { AdminNav } from "@/components/admin/admin-nav";
import { requireAdmin } from "@/lib/admin-auth";
import { getWebDatabase } from "@/lib/database";
import { ConversationFilters } from "./conversation-filters";

export const dynamic = "force-dynamic";

const resultLabels: Record<string, string> = {
  HEATING: "Schadensmeldung Heizung",
  WATER: "Schadensmeldung Wasser",
  ELECTRICITY: "Schadensmeldung Elektrik",
  STRUCTURAL: "Schadensmeldung Gebäudeschaden",
  OTHER: "Schadensmeldung Sonstiges",
  APPOINTMENT: "Terminanfrage",
  BILLING: "Nebenkostenanfrage",
};

const allowedStatuses = ["ACTIVE", "COMPLETED", "FAILED", "ABANDONED"] as const;
type FilterStatus = (typeof allowedStatuses)[number];

function duration(value: number | null): string {
  if (value === null) return "–";
  const seconds = Math.round(value / 1_000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} min`;
}

function resultSummary(intakes: Array<{ kind: string; reporterName: string | null }>): string {
  const primary = intakes[0];
  if (!primary) return "Kein strukturierter Vorgang";
  const first = `${resultLabels[primary.kind] ?? "Vorgang"}${primary.reporterName ? ` · ${primary.reporterName}` : ""}`;
  return intakes.length === 1 ? first : `${intakes.length} Vorgänge · ${first}`;
}

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; status?: string }>;
}) {
  await requireAdmin();
  const query = await searchParams;
  const period = query.period === "30" || query.period === "all" ? query.period : "7";
  const status = allowedStatuses.includes(query.status as FilterStatus) ? (query.status as FilterStatus) : "all";
  const since = period === "all" ? undefined : new Date(Date.now() - Number(period) * 24 * 60 * 60 * 1_000);
  const rows = await new DrizzleConversationRepository(getWebDatabase().db).list({
    since,
    status: status === "all" ? undefined : status,
  });

  return (
    <main className="admin-shell">
      <AdminNav active="conversations" />
      <section className="admin-content conversations-page">
        <div className="page-heading">
          <div>
            <h1>Conversations</h1>
            <p>Persistierte Voice-Sessions, neueste zuerst.</p>
          </div>
          <ConversationFilters period={period} status={status} />
        </div>
        <div className="data-grid conversations-grid">
          <div className="data-grid-head">
            <span>ZEITPUNKT</span>
            <span>ERGEBNIS</span>
            <span>STATUS</span>
            <span>DAUER</span>
            <span>FEHLERCODE</span>
            <span />
          </div>
          {rows.map((row) => (
            <article className="data-grid-row" key={row.id}>
              <Link className="data-primary" data-label="Zeitpunkt" href={`/conversations/${row.id}`}>
                {row.createdAt.toLocaleString("de-DE")}
              </Link>
              <span className="data-secondary" data-label="Ergebnis">
                {resultSummary(row.intakeSummaries)}
              </span>
              <span data-label="Status">
                <span className={`status-pill status-${row.status.toLowerCase()}`}>
                  <i className="pill-dot" />
                  {row.status}
                </span>
              </span>
              <span className="numeric" data-label="Dauer">
                {duration(row.durationMs)}
              </span>
              <code data-label="Fehlercode">{row.failureCode ?? "–"}</code>
              <Link className="data-action" href={`/conversations/${row.id}`}>
                Ansehen →
              </Link>
            </article>
          ))}
          {rows.length === 0 && <div className="data-empty">Für diese Filter wurden keine Conversations gefunden.</div>}
        </div>
      </section>
    </main>
  );
}
