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
const cutoff = new Date(Date.now() - env.MAX_SESSION_MS - env.RECONNECT_GRACE_MS);
const database = createDatabase(env.DATABASE_URL, { max: 1 });

try {
  const count = await new DrizzleConversationRepository(database.db).abandonStale(cutoff);
  console.info("stale_conversations_swept", { count, cutoff: cutoff.toISOString() });
} finally {
  await database.close();
}
