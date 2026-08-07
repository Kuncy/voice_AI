import assert from "node:assert/strict";
import test from "node:test";
import { mapAgentState, parseSessionNotice, parseToolStatus } from "./session-events";

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
  assert.deepEqual(
    parseSessionNotice(encoder.encode(JSON.stringify({ type: "session_finishing", message: "Bis gleich" }))),
    { type: "session_finishing", message: "Bis gleich" },
  );
});

test("accepts only known damage-report tool status events", () => {
  const encoder = new TextEncoder();
  assert.deepEqual(
    parseToolStatus(encoder.encode(JSON.stringify({ name: "create_damage_report", status: "started" }))),
    { name: "create_damage_report", status: "started" },
  );
  assert.equal(
    parseToolStatus(encoder.encode(JSON.stringify({ name: "delete_everything", status: "succeeded" }))),
    undefined,
  );
  assert.equal(parseToolStatus(encoder.encode("not json")), undefined);
});
