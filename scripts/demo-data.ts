import type { DrizzleConversationRepository } from "../packages/db/src/index";

export const demoRoomNames = ["demo-damage-report", "demo-appointment-request"] as const;

export async function removeDemoConversations(repository: DrizzleConversationRepository): Promise<number> {
  return repository.deleteByRoomNames([...demoRoomNames]);
}

export function loadLocalEnvironment(): void {
  for (const path of [".env.local", "../../.env.local"]) {
    try {
      process.loadEnvFile(path);
      return;
    } catch {
      // Production and CI inject environment variables directly.
    }
  }
}
