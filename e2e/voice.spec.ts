import { expect, test } from "@playwright/test";

const password = "E2e-Test-Passwort-2026!";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Benutzername").fill("e2e-admin");
  await page.getByLabel("Passwort").fill(password);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test("protects the app and runs the fake voice start/stop flow", async ({ page }) => {
  await login(page);

  await page.goto("/?voiceTransport=fake");
  await expect(page.getByText("Bereit", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Gespräch starten" }).click();
  await expect(page.getByText("Vera hört zu", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Gespräch beenden" }).click();
  await expect(page.getByText("Bereit", { exact: true })).toBeVisible();
});

test("shows a useful error when the fake connection fails", async ({ page }) => {
  await login(page);

  await page.goto("/?voiceTransport=fake&fakeScenario=connection-error");
  await page.getByRole("button", { name: "Gespräch starten" }).click();
  await expect(page.getByText("Verbindung fehlgeschlagen", { exact: true })).toBeVisible();
  await expect(page.getByText("Die Testverbindung konnte nicht aufgebaut werden.", { exact: true })).toBeVisible();
});
