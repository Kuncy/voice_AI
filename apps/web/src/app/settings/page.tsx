import { agentSettingsSchema } from "@heyvera/core";
import { DrizzleAgentRepository } from "@heyvera/db";
import Link from "next/link";
import { LogoutButton } from "@/components/admin/logout-button";
import { requireAdmin } from "@/lib/admin-auth";
import { getWebDatabase } from "@/lib/database";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireAdmin();
  const agent = await new DrizzleAgentRepository(getWebDatabase().db).get();
  const settings = agentSettingsSchema.parse({
    name: agent.name,
    tone: agent.tone,
    systemPrompt: agent.systemPrompt,
  });

  return (
    <main className="settings-shell">
      <nav className="nav">
        <Link className="brand-link" href="/">
          <span className="brand-mark">V</span>
          <span className="brand">HeyVera</span>
        </Link>
        <Link className="nav-link" href="/conversations">
          Conversations
        </Link>
        <Link className="nav-link" href="/requests">
          Vorgänge
        </Link>
        <LogoutButton />
        <span className="phase-badge">Phase 4 · Settings</span>
      </nav>
      <section className="settings-card">
        <p className="eyebrow">AGENT-KONFIGURATION</p>
        <h1>Vera einstellen.</h1>
        <p className="settings-intro">
          Änderungen gelten ausschließlich für neue Gespräche. Bereits gespeicherte Snapshots bleiben unverändert.
        </p>
        <SettingsForm settings={settings} />
      </section>
    </main>
  );
}
