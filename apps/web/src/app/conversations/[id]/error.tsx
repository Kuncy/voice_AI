"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AdminNav } from "@/components/admin/admin-nav";

export default function ConversationError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("conversation_detail_render_failed", error);
  }, [error]);

  return (
    <main className="admin-shell">
      <AdminNav active="conversations" />
      <section className="admin-content detail-state">
        <p className="eyebrow">FEHLER</p>
        <h1>Conversation konnte nicht geladen werden.</h1>
        <p>Bitte versuche es erneut. Die gespeicherten Daten bleiben unverändert.</p>
        <div className="state-actions">
          <button type="button" onClick={reset}>
            Erneut versuchen
          </button>
          <Link href="/conversations">Zur Liste</Link>
        </div>
      </section>
    </main>
  );
}
