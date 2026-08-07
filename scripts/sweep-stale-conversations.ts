import { createDatabase, DrizzleConversationRepository } from "../packages/db/src/index";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Production injects environment variables directly.
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const maxSessionMs = Number(process.env.MAX_SESSION_MS ?? 600_000);
const reconnectGraceMs = Number(process.env.RECONNECT_GRACE_MS ?? 60_000);
const cutoff = new Date(Date.now() - maxSessionMs - reconnectGraceMs);
const database = createDatabase(databaseUrl, { max: 1 });

try {
  const count = await new DrizzleConversationRepository(database.db).abandonStale(cutoff);
  console.info("stale_conversations_swept", { count, cutoff: cutoff.toISOString() });
} finally {
  await database.close();
}
