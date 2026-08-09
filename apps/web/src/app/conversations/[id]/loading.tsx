import { AdminNav } from "@/components/admin/admin-nav";

export default function ConversationLoading() {
  return (
    <main className="admin-shell">
      <AdminNav active="conversations" />
      <section className="admin-content detail-page">
        <p className="eyebrow">CONVERSATION</p>
        <h1>Conversation wird geladen …</h1>
        <div className="detail-loading" role="status" aria-label="Lädt" />
      </section>
    </main>
  );
}
