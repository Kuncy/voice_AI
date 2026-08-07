import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDatabase } from "./client";

try {
  process.loadEnvFile(".env.local");
} catch {
  try {
    process.loadEnvFile("../../.env.local");
  } catch {
    // Production injects environment variables directly.
  }
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const database = createDatabase(databaseUrl, { max: 1 });
try {
  await migrate(database.db, { migrationsFolder: new URL("../migrations", import.meta.url).pathname });
  console.info("database_migrations_complete");
} finally {
  await database.close();
}
