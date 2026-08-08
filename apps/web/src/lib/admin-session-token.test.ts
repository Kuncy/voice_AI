import assert from "node:assert/strict";
import test from "node:test";
import { createAdminSessionToken, parseAdminSessionToken } from "./admin-session-token";

const secret = "a-secure-test-secret-with-at-least-32-chars";

test("admin session tokens round-trip and reject tampering", () => {
  const session = { username: "admin", expiresAt: Date.now() + 60_000 };
  const token = createAdminSessionToken(session, secret);
  assert.deepEqual(parseAdminSessionToken(token, secret), session);
  assert.equal(parseAdminSessionToken(`${token}x`, secret), undefined);
});

test("admin session token parsing is total for malformed signatures", () => {
  assert.doesNotThrow(() => parseAdminSessionToken(`e30.${"ä"}${"a".repeat(42)}`, secret));
  assert.equal(parseAdminSessionToken(`e30.${"ä"}${"a".repeat(42)}`, secret), undefined);
});
