import { getWebEnv } from "@heyvera/config";
import { createDatabase } from "@heyvera/db";

const globalDatabase = globalThis as typeof globalThis & {
  heyVeraWebDatabase?: ReturnType<typeof createDatabase>;
};

export function getWebDatabase(): ReturnType<typeof createDatabase> {
  if (!globalDatabase.heyVeraWebDatabase) {
    globalDatabase.heyVeraWebDatabase = createDatabase(getWebEnv().DATABASE_URL, { max: 5 });
  }
  return globalDatabase.heyVeraWebDatabase;
}
