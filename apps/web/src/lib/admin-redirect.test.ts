import assert from "node:assert/strict";
import test from "node:test";
import { safeAdminRedirect } from "./admin-redirect";

test("allows only local protected admin paths", () => {
  assert.equal(safeAdminRedirect("/settings?tab=voice"), "/settings?tab=voice");
  assert.equal(safeAdminRedirect("/conversations/123"), "/conversations/123");
  assert.equal(safeAdminRedirect("https://example.com"), "/conversations");
  assert.equal(safeAdminRedirect("/\\example.com"), "/conversations");
  assert.equal(safeAdminRedirect("//example.com"), "/conversations");
  assert.equal(safeAdminRedirect("/api/health"), "/conversations");
});
