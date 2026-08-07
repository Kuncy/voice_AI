import {
  ConnectionState,
  DisconnectReason,
  Room,
  RoomEvent,
  Track,
  type Participant,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  type TranscriptionSegment,
} from "livekit-client";
import type {
  ToolStatusEvent,
  TranscriptEvent,
  Unsubscribe,
  VoiceState,
  VoiceTransport,
} from "./transport";

type SessionResponse = { token: string; livekitUrl: string; roomName: string };

export class LiveKitVoiceTransport implements VoiceTransport {
  private room: Room | undefined;
  private currentState: VoiceState = "idle";
  private readonly stateListeners = new Set<(state: VoiceState) => void>();
  private readonly transcriptListeners = new Set<(event: TranscriptEvent) => void>();
  private readonly toolListeners = new Set<(event: ToolStatusEvent) => void>();

  public constructor(private readonly audioRoot: HTMLElement) {}

  public get state(): VoiceState {
    return this.currentState;
  }

  public async connect(): Promise<void> {
    if (this.room && this.room.state !== ConnectionState.Disconnected) return;
    this.setState("connecting");

    try {
      const response = await fetch("/api/voice-sessions", { method: "POST" });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Voice-Session konnte nicht erstellt werden.");
      }
      const session = (await response.json()) as SessionResponse;
      const room = new Room({ adaptiveStream: true, dynacast: true });
      this.room = room;
      this.bindRoom(room);
      await room.startAudio();
      await room.connect(session.livekitUrl, session.token);
      await room.localParticipant.setMicrophoneEnabled(true);
      this.setState("listening");
    } catch (error) {
      this.setState("error");
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    if (!this.room) {
      this.setState("idle");
      return;
    }
    this.setState("disconnecting");
    await this.room.localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
    await this.room.disconnect();
    this.room = undefined;
    this.audioRoot.replaceChildren();
    this.setState("idle");
  }

  public onTranscript(callback: (event: TranscriptEvent) => void): Unsubscribe {
    this.transcriptListeners.add(callback);
    return () => this.transcriptListeners.delete(callback);
  }

  public onToolStatus(callback: (event: ToolStatusEvent) => void): Unsubscribe {
    this.toolListeners.add(callback);
    return () => this.toolListeners.delete(callback);
  }

  public onStateChange(callback: (state: VoiceState) => void): Unsubscribe {
    this.stateListeners.add(callback);
    callback(this.currentState);
    return () => this.stateListeners.delete(callback);
  }

  private bindRoom(room: Room): void {
    room
      .on(
        RoomEvent.TrackSubscribed,
        (track: RemoteTrack, _publication: RemoteTrackPublication, _participant: RemoteParticipant) => {
          if (track.kind !== Track.Kind.Audio) return;
          const element = track.attach();
          element.autoplay = true;
          this.audioRoot.append(element);
        },
      )
      .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        for (const element of track.detach()) element.remove();
      })
      .on(
        RoomEvent.TranscriptionReceived,
        (segments: TranscriptionSegment[], participant?: Participant) => {
          const speaker = participant?.isAgent ? "assistant" : "user";
          for (const segment of segments) {
            const event: TranscriptEvent = {
              id: segment.id,
              text: segment.text,
              isFinal: segment.final,
              speaker,
            };
            for (const listener of this.transcriptListeners) listener(event);
          }
        },
      )
      .on(RoomEvent.ParticipantConnected, () => this.setState("listening"))
      .on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        const agentIsSpeaking = speakers.some((speaker) => speaker.isAgent);
        this.setState(agentIsSpeaking ? "speaking" : "listening");
      })
      .on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
        this.audioRoot.replaceChildren();
        if (this.currentState !== "disconnecting" && reason !== DisconnectReason.CLIENT_INITIATED) {
          this.setState("error");
        }
      });
  }

  private setState(state: VoiceState): void {
    if (this.currentState === state) return;
    this.currentState = state;
    for (const listener of this.stateListeners) listener(state);
  }
}
