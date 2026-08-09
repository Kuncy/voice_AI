import { getMaintenanceEnv } from "../packages/config/src/index";
import {
  createDatabase,
  DrizzleConversationRepository,
  DrizzleDamageReportRepository,
  DrizzleServiceRequestRepository,
} from "../packages/db/src/index";
import { demoRoomNames, loadLocalEnvironment, removeDemoConversations } from "./demo-data";

async function main(): Promise<void> {
  loadLocalEnvironment();
  const env = getMaintenanceEnv();
  const database = createDatabase(env.DATABASE_URL, { max: 1 });
  const conversations = new DrizzleConversationRepository(database.db);

  try {
    await removeDemoConversations(conversations);

    const damageConversation = await conversations.create({
      roomName: demoRoomNames[0],
      runtimeSnapshot: { source: "demo-seed", schemaVersion: 1 },
    });
    await conversations.markActive(damageConversation.id);
    await conversations.appendFinalMessage(damageConversation.id, {
      externalItemId: "demo-damage-user",
      role: "USER",
      content: "Im Bad tropft Wasser unter dem Waschbecken. Ich bin Erika Muster aus der Musterstraße 12 in Berlin.",
      isFinal: true,
    });
    await conversations.appendFinalMessage(damageConversation.id, {
      externalItemId: "demo-damage-assistant",
      role: "ASSISTANT",
      content: "Ich habe die bestätigte Schadensmeldung aufgenommen.",
      isFinal: true,
    });
    await new DrizzleDamageReportRepository(database.db).create({
      conversationId: damageConversation.id,
      providerCallId: "demo-damage-tool-call",
      report: {
        reporterName: "Erika Muster",
        category: "water",
        description: "Unter dem Waschbecken im Bad tritt Wasser aus.",
        urgency: "high",
        streetAndHouseNumber: "Musterstraße 12",
        postalCode: "10115",
        city: "Berlin",
      },
    });
    await conversations.finish(damageConversation.id, { status: "COMPLETED" });

    const appointmentConversation = await conversations.create({
      roomName: demoRoomNames[1],
      runtimeSnapshot: { source: "demo-seed", schemaVersion: 1 },
    });
    await conversations.markActive(appointmentConversation.id);
    await conversations.appendFinalMessage(appointmentConversation.id, {
      externalItemId: "demo-appointment-user",
      role: "USER",
      content: "Ich möchte einen Termin zur Prüfung der Heizkörper am Montagvormittag vereinbaren.",
      isFinal: true,
    });
    await conversations.appendFinalMessage(appointmentConversation.id, {
      externalItemId: "demo-appointment-assistant",
      role: "ASSISTANT",
      content: "Ich habe Ihren Terminwunsch als unverbindliche Anfrage gespeichert.",
      isFinal: true,
    });
    await new DrizzleServiceRequestRepository(database.db).create({
      conversationId: appointmentConversation.id,
      providerCallId: "demo-appointment-tool-call",
      request: {
        requestType: "appointment",
        reporterName: "Erika Muster",
        description: "Prüfung der Heizkörper in der Wohnung.",
        streetAndHouseNumber: "Musterstraße 12",
        postalCode: "10115",
        city: "Berlin",
        preferredTimeframe: "Montagvormittag",
      },
    });
    await conversations.finish(appointmentConversation.id, { status: "COMPLETED" });

    console.info("demo_conversations_seeded", { count: demoRoomNames.length });
  } finally {
    await database.close();
  }
}

void main();
