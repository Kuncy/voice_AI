import { defineConfig, devices } from "@playwright/test";

const port = 3100;
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `pnpm --filter @heyvera/web exec next dev --hostname 127.0.0.1 --port ${port}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      ADMIN_USERNAME: "e2e-admin",
      ADMIN_PASSWORD_HASH: "scrypt$eNDBH8bDUgy9Q9goqAuJpA$IdYAiuLH7lgRoTAO4qyNau1ajvEyOsmNlYHf_Ju1XXc",
      SESSION_SECRET: "e2e-session-secret-with-at-least-32-characters",
    },
  },
});
