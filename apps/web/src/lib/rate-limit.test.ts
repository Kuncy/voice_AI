import assert from "node:assert/strict";
import test from "node:test";
import { clearRateLimitsForTest, clientAddress, consumeRateLimit } from "./rate-limit";

test.beforeEach(() => {
  clearRateLimitsForTest();
  delete process.env.TRUSTED_CLIENT_IP_HEADER;
});

test("rate limits each scope and resets after the window", () => {
  assert.equal(consumeRateLimit("voice", "1.2.3.4", 2, 1_000, 10), true);
  assert.equal(consumeRateLimit("voice", "1.2.3.4", 2, 1_000, 11), true);
  assert.equal(consumeRateLimit("voice", "1.2.3.4", 2, 1_000, 12), false);
  assert.equal(consumeRateLimit("voice", "1.2.3.4", 2, 1_000, 1_011), true);
});

test("client address only reads the configured trusted header", () => {
  const headers = new Headers({
    "cf-connecting-ip": "spoofed",
    "x-forwarded-for": "spoofed, proxy",
    "x-real-ip": "203.0.113.5",
  });
  assert.equal(clientAddress({ headers }), "203.0.113.5");
  process.env.TRUSTED_CLIENT_IP_HEADER = "true-client-ip";
  assert.equal(clientAddress({ headers }), "unknown");
});
