"use server";

import { agentSettingsSchema } from "@heyvera/core";
import { createDatabase, DrizzleAgentRepository } from "@heyvera/db";
import { getWebEnv } from "@heyvera/config";
import { revalidatePath } from "next/cache";

export type SettingsActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  errors?: Partial<Record<"name" | "tone" | "systemPrompt", string[]>>;
};

export async function updateAgentSettings(
  _previous: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const parsed = agentSettingsSchema.safeParse({
    name: formData.get("name"),
    tone: formData.get("tone"),
    systemPrompt: formData.get("systemPrompt"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Bitte prüfe die markierten Felder.",
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  let database: ReturnType<typeof createDatabase> | undefined;
  try {
    const env = getWebEnv();
    database = createDatabase(env.DATABASE_URL, { max: 1 });
    await new DrizzleAgentRepository(database.db).update(parsed.data);
    revalidatePath("/settings");
    return { status: "success", message: "Vera wurde gespeichert. Neue Gespräche verwenden diese Einstellungen." };
  } catch (error) {
    console.error("agent_settings_update_failed", { error });
    return { status: "error", message: "Die Einstellungen konnten nicht gespeichert werden." };
  } finally {
    await database?.close();
  }
}
