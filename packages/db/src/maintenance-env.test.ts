import assert from "node:assert/strict";
import test from "node:test";
import { getMaintenanceEnv, getRuntimeConfig } from "../../config/src/index";

test("maintenance timing rejects blank values instead of treating them as zero", () => {
  assert.throws(() =>
    getMaintenanceEnv({
      DATABASE_URL: "postgresql://example.invalid/test",
      MAX_SESSION_MS: "",
    }),
  );
  assert.deepEqual(getMaintenanceEnv({ DATABASE_URL: "postgresql://example.invalid/test" }), {
    DATABASE_URL: "postgresql://example.invalid/test",
    MAX_SESSION_MS: 600_000,
    RECONNECT_GRACE_MS: 60_000,
    DATA_RETENTION_DAYS: 90,
  });
});

test("runtime snapshots use the same validated defaults as the agent", () => {
  assert.equal(getRuntimeConfig({}).DEEPGRAM_TTS_FALLBACK_MODEL, "aura-2-elara-de");
  assert.throws(() => getRuntimeConfig({ MAX_SESSION_MS: "" }));
});
