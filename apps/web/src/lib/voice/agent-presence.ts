import { RoomEvent, type Participant, type Room } from "livekit-client";

export const agentJoinTimeoutMs = 10_000;

export function findAgent(room: Pick<Room, "remoteParticipants">): Participant | undefined {
  return [...room.remoteParticipants.values()].find((participant) => participant.isAgent);
}

export function waitForAgent(
  room: Pick<Room, "remoteParticipants" | "on" | "off">,
  timeoutMs = agentJoinTimeoutMs,
): Promise<Participant> {
  const connected = findAgent(room);
  if (connected) return Promise.resolve(connected);

  return new Promise((resolve, reject) => {
    const onParticipantConnected = (participant: Participant) => {
      if (!participant.isAgent) return;
      clearTimeout(timeout);
      room.off(RoomEvent.ParticipantConnected, onParticipantConnected);
      resolve(participant);
    };
    const timeout = setTimeout(() => {
      room.off(RoomEvent.ParticipantConnected, onParticipantConnected);
      reject(new Error("Vera ist dem Gespräch nicht rechtzeitig beigetreten."));
    }, timeoutMs);
    room.on(RoomEvent.ParticipantConnected, onParticipantConnected);

    const raced = findAgent(room);
    if (raced) onParticipantConnected(raced);
  });
}
