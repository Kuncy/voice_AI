import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { adminSessionCookie } from "@/lib/admin-session-token";
import { POST } from "./route";

test("redirects logout to the configured public origin", async () => {
  const previous = {
    APP_URL: process.env.APP_URL,
    SESSION_SECRET: process.env.SESSION_SECRET,
    ADMIN_USERNAME: process.env.ADMIN_USERNAME,
    ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH,
  };
  process.env.APP_URL = "https://vera.example.com";
  process.env.SESSION_SECRET = "test-secret-that-is-at-least-32-characters";
  process.env.ADMIN_USERNAME = "admin";
  process.env.ADMIN_PASSWORD_HASH = "scrypt$salt$hash";

  try {
    const response = await POST(new NextRequest("https://0.0.0.0:3000/api/admin/logout", { method: "POST" }));

    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), "https://vera.example.com/login");
    assert.match(response.headers.get("set-cookie") ?? "", new RegExp(`^${adminSessionCookie}=;`));
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
