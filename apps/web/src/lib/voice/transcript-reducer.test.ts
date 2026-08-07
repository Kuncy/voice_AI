import assert from "node:assert/strict";
import test from "node:test";
import { reconcileTranscript } from "./transcript-reducer";

test("transcript updates keep their original position", () => {
  const current = [
    { id: "user-1", text: "Hal", isFinal: false, speaker: "user" as const },
    { id: "assistant-1", text: "Hallo", isFinal: true, speaker: "assistant" as const },
  ];
  assert.deepEqual(reconcileTranscript(current, {
    id: "user-1",
    text: "Hallo Vera",
    isFinal: true,
    speaker: "user",
  }).map((entry) => entry.id), ["user-1", "assistant-1"]);
});

test("a final transcript cannot be downgraded by a late partial", () => {
  const final = [{ id: "user-1", text: "Hallo Vera", isFinal: true, speaker: "user" as const }];
  assert.equal(reconcileTranscript(final, {
    id: "user-1",
    text: "Hallo",
    isFinal: false,
    speaker: "user",
  }), final);
});
