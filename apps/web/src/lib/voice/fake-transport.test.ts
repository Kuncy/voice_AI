import assert from "node:assert/strict";
import test from "node:test";
import { FakeVoiceTransport } from "./fake-transport";

test("fake transport exposes session metadata and microphone mute state", async () => {
  const transport = new FakeVoiceTransport();
  let roomName: string | undefined;
  transport.onSessionInfo((info) => {
    roomName = info?.roomName;
  });

  await transport.connect();
  assert.equal(roomName, "fake-voice-session");
  assert.equal(transport.isMicrophoneMuted, false);

  await transport.setMicrophoneMuted(true);
  assert.equal(transport.isMicrophoneMuted, true);

  await transport.disconnect();
  assert.equal(roomName, undefined);
});
