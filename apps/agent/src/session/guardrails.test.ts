import assert from "node:assert/strict";
import test from "node:test";
import { SessionGuardrails, type SessionEndReason } from "./guardrails.js";

function setup(maxTurns = 2) {
  const ended: SessionEndReason[] = [];
  let durationCallback: (() => void) | undefined;
  const guardrails = new SessionGuardrails({
    maxDurationMs: 100,
    maxTurns,
    onEnd: (reason) => ended.push(reason),
    schedule: (callback) => {
      durationCallback = callback;
      return { unref() {} } as ReturnType<typeof setTimeout>;
    },
    cancel: () => undefined,
  });
  guardrails.start();
  return { guardrails, ended, expireDuration: () => durationCallback?.() };
}

test("ends when the configured duration expires", () => {
  const { ended, expireDuration } = setup();
  expireDuration();
  assert.deepEqual(ended, ["max_duration"]);
});

test("ends an idle session only once", () => {
  const { guardrails, ended, expireDuration } = setup();
  guardrails.onUserStateChanged("away");
  expireDuration();
  assert.deepEqual(ended, ["idle_timeout"]);
});

test("lets the final allowed reply finish before ending", () => {
  const { guardrails, ended } = setup(2);
  assert.equal(guardrails.onFinalUserTurn(), 1);
  guardrails.onAgentStateChanged("speaking");
  guardrails.onAgentStateChanged("listening");
  assert.deepEqual(ended, []);

  assert.equal(guardrails.onFinalUserTurn(), 2);
  guardrails.onAgentStateChanged("thinking");
  guardrails.onAgentStateChanged("speaking");
  assert.deepEqual(ended, []);
  guardrails.onAgentStateChanged("listening");
  assert.deepEqual(ended, ["max_turns"]);
});
