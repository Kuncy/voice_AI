import assert from "node:assert/strict";
import test from "node:test";
import { createSessionHandle, parseSessionHandle } from "./session-handle";

const secret = "a-secure-test-secret-with-at-least-32-chars";

test("session handles round-trip and reject tampering", () => {
  const value = { conversationId: crypto.randomUUID(), roomName: "vera-test", expiresAt: Date.now() + 60_000 };
  const handle = createSessionHandle(value, secret);
  assert.deepEqual(parseSessionHandle(handle, secret), value);
  assert.equal(parseSessionHandle(`${handle}x`, secret), undefined);
});

test("expired session handles are rejected", () => {
  const handle = createSessionHandle(
    {
      conversationId: crypto.randomUUID(),
      roomName: "vera-old",
      expiresAt: Date.now() - 1,
    },
    secret,
  );
  assert.equal(parseSessionHandle(handle, secret), undefined);
});

test("malformed multi-byte signatures are rejected without throwing", () => {
  const malformed = `e30.${"ä"}${"a".repeat(42)}`;
  assert.doesNotThrow(() => parseSessionHandle(malformed, secret));
  assert.equal(parseSessionHandle(malformed, secret), undefined);
});
