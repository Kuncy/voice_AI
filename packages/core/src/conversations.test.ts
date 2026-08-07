import assert from "node:assert/strict";
import test from "node:test";
import { itemKey } from "./conversations";

test("itemKey keeps provider ids and is deterministic without one", () => {
  assert.equal(itemKey({ id: "abc", role: "USER", turnIndex: 1, content: "Hallo" }), "lk:abc");
  const input = { role: "ASSISTANT" as const, turnIndex: 2, content: "Guten Tag" };
  assert.equal(itemKey(input), itemKey(input));
  assert.match(itemKey(input), /^synth:[a-f0-9]{32}$/);
});

test("itemKey changes when the turn changes", () => {
  const first = itemKey({ role: "USER", turnIndex: 1, content: "Ja" });
  const second = itemKey({ role: "USER", turnIndex: 2, content: "Ja" });
  assert.notEqual(first, second);
});
