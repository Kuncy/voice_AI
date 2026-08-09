import assert from "node:assert/strict";
import { scryptSync } from "node:crypto";
import test from "node:test";
import { NextRequest } from "next/server";
import { POST } from "./route";

test("redirects a successful login to the voice home", async () => {
  const password = "correct horse battery staple";
  const salt = Buffer.from("fixed-login-route-salt");
  const expected = scryptSync(password, salt, 32);
  const previous = {
    SESSION_SECRET: process.env.SESSION_SECRET,
    ADMIN_USERNAME: process.env.ADMIN_USERNAME,
    ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH,
  };

  process.env.SESSION_SECRET = "test-secret-that-is-at-least-32-characters";
  process.env.ADMIN_USERNAME = "admin";
  process.env.ADMIN_PASSWORD_HASH = `scrypt$${salt.toString("base64url")}$${expected.toString("base64url")}`;

  try {
    const form = new FormData();
    form.set("username", "admin");
    form.set("password", password);
    form.set("next", "/conversations");
    const response = await POST(
      new NextRequest("http://localhost/api/admin/login", {
        method: "POST",
        body: form,
      }),
    );

    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), "http://localhost/");
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
