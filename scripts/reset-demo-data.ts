import { getMaintenanceEnv } from "../packages/config/src/index";
import { createDatabase, DrizzleConversationRepository } from "../packages/db/src/index";
import { loadLocalEnvironment, removeDemoConversations } from "./demo-data";

async function main(): Promise<void> {
  loadLocalEnvironment();
  const env = getMaintenanceEnv();
  const database = createDatabase(env.DATABASE_URL, { max: 1 });

  try {
    const count = await removeDemoConversations(new DrizzleConversationRepository(database.db));
    console.info("demo_conversations_removed", { count });
  } finally {
    await database.close();
  }
}

void main();
