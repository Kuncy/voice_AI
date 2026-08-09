"use client";

export function ConversationFilters({ period, status }: { period: string; status: string }) {
  return (
    <form className="conversation-filters" method="get">
      <label>
        <span className="sr-only">Zeitraum</span>
        <select name="period" value={period} onChange={(event) => event.currentTarget.form?.requestSubmit()}>
          <option value="7">Letzte 7 Tage</option>
          <option value="30">Letzte 30 Tage</option>
          <option value="all">Gesamter Zeitraum</option>
        </select>
      </label>
      <label>
        <span className="sr-only">Status</span>
        <select name="status" value={status} onChange={(event) => event.currentTarget.form?.requestSubmit()}>
          <option value="all">Alle Status</option>
          <option value="ACTIVE">Aktiv</option>
          <option value="COMPLETED">Abgeschlossen</option>
          <option value="FAILED">Fehlgeschlagen</option>
          <option value="ABANDONED">Abgebrochen</option>
        </select>
      </label>
    </form>
  );
}
