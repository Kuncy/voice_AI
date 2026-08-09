import { agentSettingsSchema } from "@heyvera/core";
import { DrizzleAgentRepository } from "@heyvera/db";
import { AdminNav } from "@/components/admin/admin-nav";
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
    <main className="admin-shell">
      <AdminNav active="settings" />
      <section className="admin-content settings-card">
        <h1>Vera einstellen.</h1>
        <p className="settings-intro">
          Änderungen gelten ausschließlich für neue Gespräche. Bereits gespeicherte Snapshots bleiben unverändert.
        </p>
        <SettingsForm settings={settings} updatedAt={agent.updatedAt.toISOString()} />
      </section>
    </main>
  );
}
