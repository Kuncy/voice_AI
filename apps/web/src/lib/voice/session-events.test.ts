import assert from "node:assert/strict";
import test from "node:test";
import { mapAgentState, parseSessionNotice } from "./session-events";

test("maps LiveKit agent states to UI states", () => {
  assert.equal(mapAgentState("initializing"), "connecting");
  assert.equal(mapAgentState("idle"), "listening");
  assert.equal(mapAgentState("thinking"), "thinking");
  assert.equal(mapAgentState("speaking"), "speaking");
  assert.equal(mapAgentState("unknown"), undefined);
});

test("accepts valid session notices and rejects malformed data", () => {
  const encoder = new TextEncoder();
  assert.deepEqual(
    parseSessionNotice(
      encoder.encode(
        JSON.stringify({
          type: "session_ended",
          reason: "idle_timeout",
          message: "Beendet",
        }),
      ),
    ),
    { type: "session_ended", reason: "idle_timeout", message: "Beendet" },
  );
  assert.equal(parseSessionNotice(encoder.encode("not json")), undefined);
  assert.equal(
    parseSessionNotice(encoder.encode(JSON.stringify({ type: "session_ended", reason: "other" }))),
    undefined,
  );
});
