import assert from "node:assert/strict";
import test from "node:test";
import type { AdminEnv } from "@heyvera/config";
import { NextRequest } from "next/server";
import { adminSessionCookie, createAdminSessionToken } from "@/lib/admin-session-token";
import { authorizeAdminRequest, config } from "./proxy";

const env: AdminEnv = {
  SESSION_SECRET: "test-secret-that-is-at-least-32-characters",
  ADMIN_USERNAME: "admin",
  ADMIN_PASSWORD_HASH: "scrypt$salt$hash",
};

function authenticatedRequest(path: string): NextRequest {
  const token = createAdminSessionToken(
    { username: env.ADMIN_USERNAME, expiresAt: Date.now() + 60_000 },
    env.SESSION_SECRET,
  );
  return new NextRequest(`http://localhost${path}`, {
    headers: { cookie: `${adminSessionCookie}=${token}` },
  });
}

test("protects the voice UI and preserves the requested page in the login redirect", () => {
  const response = authorizeAdminRequest(new NextRequest("http://localhost/?source=test"), env);

  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "http://localhost/login?next=%2F%3Fsource%3Dtest");
  assert.ok(config.matcher.includes("/"));
});

test("returns JSON 401 for unauthenticated voice API requests", async () => {
  const response = authorizeAdminRequest(new NextRequest("http://localhost/api/voice-sessions/reconnect"), env);

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Nicht autorisiert." });
  assert.ok(config.matcher.includes("/api/voice-sessions/:path*"));
});

test("allows requests with a valid admin session", () => {
  const response = authorizeAdminRequest(authenticatedRequest("/api/voice-sessions"), env);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-middleware-next"), "1");
});
