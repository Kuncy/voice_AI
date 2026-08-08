"use server";

import { DrizzleConversationRepository } from "@heyvera/db";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { getWebDatabase } from "@/lib/database";

export async function deleteConversation(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = formData.get("conversationId");
  if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error("Ungültige Conversation-ID");
  }
  const deleted = await new DrizzleConversationRepository(getWebDatabase().db).delete(id);
  if (!deleted) throw new Error("Nur abgeschlossene Conversations können gelöscht werden");
  redirect("/conversations");
}
