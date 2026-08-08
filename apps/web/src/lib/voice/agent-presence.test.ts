import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { type Participant, type Room, RoomEvent } from "livekit-client";
import { waitForAgent } from "./agent-presence";

function participant(isAgent: boolean): Participant {
  return { isAgent } as Participant;
}

function roomWith(participants: Participant[] = []) {
  const emitter = new EventEmitter();
  const room = {
    remoteParticipants: new Map(participants.map((value, index) => [String(index), value])),
    on: emitter.on.bind(emitter),
    off: emitter.off.bind(emitter),
  } as unknown as Pick<Room, "remoteParticipants" | "on" | "off">;
  return { room, emitter };
}

test("returns an agent that is already present", async () => {
  const agent = participant(true);
  const { room } = roomWith([participant(false), agent]);
  assert.equal(await waitForAgent(room, 5), agent);
});

test("waits for the agent participant and times out when none joins", async () => {
  const joined = participant(true);
  const first = roomWith();
  const waiting = waitForAgent(first.room, 50);
  first.emitter.emit(RoomEvent.ParticipantConnected, participant(false));
  first.emitter.emit(RoomEvent.ParticipantConnected, joined);
  assert.equal(await waiting, joined);

  const second = roomWith();
  await assert.rejects(waitForAgent(second.room, 5), /nicht rechtzeitig/);
});
