export default function ConversationLoading() {
  return (
    <main className="history-shell">
      <section className="history-card detail-page">
        <p className="eyebrow">CONVERSATION</p>
        <h1>Conversation wird geladen …</h1>
        <div className="detail-loading" role="status" aria-label="Lädt" />
      </section>
    </main>
  );
}
