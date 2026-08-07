export default function ConversationLoading() {
  return (
    <main className="history-shell">
      <section className="history-card detail-page">
        <p className="eyebrow">CONVERSATION</p>
        <h1>Conversation wird geladen …</h1>
        <div className="detail-loading" aria-label="Lädt" />
      </section>
    </main>
  );
}
