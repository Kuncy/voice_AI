import assert from "node:assert/strict";
import test from "node:test";
import { scryptSync } from "node:crypto";
import { verifyAdminPassword } from "./admin-password";

test("verifies only the password represented by the configured scrypt hash", () => {
  const salt = Buffer.from("fixed-test-salt");
  const expected = scryptSync("correct horse battery staple", salt, 32);
  const encoded = `scrypt$${salt.toString("base64url")}$${expected.toString("base64url")}`;
  assert.equal(verifyAdminPassword("correct horse battery staple", encoded), true);
  assert.equal(verifyAdminPassword("wrong password", encoded), false);
  assert.equal(verifyAdminPassword("anything", "malformed"), false);
});
