import Link from "next/link";

export default function ConversationNotFound() {
  return (
    <main className="history-shell">
      <section className="history-card detail-state">
        <p className="eyebrow">NICHT GEFUNDEN</p>
        <h1>Diese Conversation existiert nicht.</h1>
        <p>Sie wurde möglicherweise entfernt oder die Adresse ist unvollständig.</p>
        <Link className="state-link" href="/conversations">
          Zur Conversation-Liste
        </Link>
      </section>
    </main>
  );
}
