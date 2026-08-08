import { getMaintenanceEnv } from "../packages/config/src/index";
import { createDatabase, DrizzleConversationRepository } from "../packages/db/src/index";

for (const path of [".env.local", "../../.env.local"]) {
  try {
    process.loadEnvFile(path);
    break;
  } catch {
    // Production injects environment variables directly.
  }
}

const env = getMaintenanceEnv();
const cutoff = new Date(Date.now() - env.DATA_RETENTION_DAYS * 24 * 60 * 60_000);
const database = createDatabase(env.DATABASE_URL, { max: 1 });

try {
  const count = await new DrizzleConversationRepository(database.db).deleteTerminalBefore(cutoff);
  console.info("expired_conversation_data_deleted", { count, cutoff: cutoff.toISOString() });
} finally {
  await database.close();
}
