"use server";

import { agentSettingsSchema } from "@heyvera/core";
import { DrizzleAgentRepository } from "@heyvera/db";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";
import { getWebDatabase } from "@/lib/database";

export type SettingsActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  errors?: Partial<Record<"name" | "tone" | "systemPrompt", string[]>>;
};

export async function updateAgentSettings(
  _previous: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  await requireAdmin();
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

  try {
    await new DrizzleAgentRepository(getWebDatabase().db).update(parsed.data);
    revalidatePath("/settings");
    return { status: "success", message: "Vera wurde gespeichert. Neue Gespräche verwenden diese Einstellungen." };
  } catch (error) {
    console.error("agent_settings_update_failed", { error });
    return { status: "error", message: "Die Einstellungen konnten nicht gespeichert werden." };
  }
}
