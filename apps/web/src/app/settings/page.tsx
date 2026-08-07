import Link from "next/link";
import { getWebEnv } from "@heyvera/config";
import { agentSettingsSchema } from "@heyvera/core";
import { createDatabase, DrizzleAgentRepository } from "@heyvera/db";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const env = getWebEnv();
  const database = createDatabase(env.DATABASE_URL, { max: 1 });
  const agent = await new DrizzleAgentRepository(database.db).get().finally(() => database.close());
  const settings = agentSettingsSchema.parse({
    name: agent.name,
    tone: agent.tone,
    systemPrompt: agent.systemPrompt,
  });

  return (
    <main className="settings-shell">
      <nav className="nav">
        <Link className="brand-link" href="/"><span className="brand-mark">V</span><span className="brand">HeyVera</span></Link>
        <Link className="nav-link" href="/conversations">Conversations</Link>
        <Link className="nav-link" href="/requests">Vorgänge</Link>
        <span className="phase-badge">Phase 4 · Settings</span>
      </nav>
      <section className="settings-card">
        <p className="eyebrow">AGENT-KONFIGURATION</p>
        <h1>Vera einstellen.</h1>
        <p className="settings-intro">Änderungen gelten ausschließlich für neue Gespräche. Bereits gespeicherte Snapshots bleiben unverändert.</p>
        <SettingsForm settings={settings} />
      </section>
    </main>
  );
}
