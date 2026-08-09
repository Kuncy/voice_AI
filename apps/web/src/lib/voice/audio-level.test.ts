import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRms, smoothAudioLevel } from "./audio-level";

test("normalizes silence and clamps loud input", () => {
  assert.equal(normalizeRms(new Uint8Array([128, 128, 128])), 0);
  assert.equal(normalizeRms(new Uint8Array([0, 255, 0, 255])), 1);
});

test("audio smoothing attacks faster than it releases", () => {
  assert.equal(smoothAudioLevel(0, 1), 0.35);
  assert.equal(smoothAudioLevel(1, 0), 0.92);
});
