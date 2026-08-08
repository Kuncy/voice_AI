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
  SessionNotice,
  ToolStatusEvent,
  TranscriptEvent,
  Unsubscribe,
  VoiceState,
  VoiceTransport,
} from "./transport";
import {
  mapAgentState,
  parseSessionNotice,
  parseToolStatus,
  sessionNoticeTopic,
  toolStatusTopic,
} from "./session-events";

type SessionResponse = { token: string; livekitUrl: string; roomName: string };

export class LiveKitVoiceTransport implements VoiceTransport {
  private room: Room | undefined;
  private currentState: VoiceState = "idle";
  private readonly stateListeners = new Set<(state: VoiceState) => void>();
  private readonly transcriptListeners = new Set<(event: TranscriptEvent) => void>();
  private readonly noticeListeners = new Set<(event: SessionNotice) => void>();
  private readonly toolListeners = new Set<(event: ToolStatusEvent) => void>();
  private agentRequestedEnd = false;
  private reconnectAvailable = false;

  public constructor(private readonly audioRoot: HTMLElement) {}

  public get state(): VoiceState {
    return this.currentState;
  }

  public get canReconnect(): boolean {
    return this.reconnectAvailable;
  }

  public async connect(): Promise<void> {
    if (this.room && this.room.state !== ConnectionState.Disconnected) return;
    this.setState("connecting");
    this.agentRequestedEnd = false;
    const isReconnect = this.reconnectAvailable;

    try {
      const response = await fetch(
        isReconnect ? "/api/voice-sessions/reconnect" : "/api/voice-sessions",
        { method: "POST" },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        if (isReconnect && (response.status === 401 || response.status === 409)) {
          this.reconnectAvailable = false;
        }
        throw new Error(body.error ?? "Voice-Session konnte nicht erstellt werden.");
      }
      const session = (await response.json()) as SessionResponse;
      this.reconnectAvailable = true;
      const room = new Room({ adaptiveStream: true, dynacast: true });
      this.room = room;
      this.bindRoom(room);
      await room.startAudio();
      await room.connect(session.livekitUrl, session.token);
      await room.localParticipant.setMicrophoneEnabled(true);
      this.reconnectAvailable = false;
      const agent = [...room.remoteParticipants.values()].find((participant) => participant.isAgent);
      if (!agent || !this.syncAgentState(agent)) this.setState("listening");
    } catch (error) {
      await this.room?.disconnect().catch(() => undefined);
      this.room = undefined;
      this.audioRoot.replaceChildren();
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
    this.agentRequestedEnd = true;
    this.reconnectAvailable = false;
    await this.room.localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
    await fetch("/api/voice-sessions/end", { method: "POST", keepalive: true }).catch(() => undefined);
    await this.room.disconnect();
    this.room = undefined;
    this.audioRoot.replaceChildren();
    this.setState("idle");
  }

  public onTranscript(callback: (event: TranscriptEvent) => void): Unsubscribe {
    this.transcriptListeners.add(callback);
    return () => this.transcriptListeners.delete(callback);
  }

  public onNotice(callback: (event: SessionNotice) => void): Unsubscribe {
    this.noticeListeners.add(callback);
    return () => this.noticeListeners.delete(callback);
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
      .on(RoomEvent.ParticipantConnected, (participant) => {
        if (participant.isAgent) this.syncAgentState(participant);
      })
      .on(RoomEvent.ParticipantAttributesChanged, (changedAttributes, participant) => {
        if (participant.isAgent && "lk.agent.state" in changedAttributes) {
          this.syncAgentState(participant);
        }
      })
      .on(RoomEvent.ParticipantDisconnected, (participant) => {
        if (!participant.isAgent || this.currentState === "disconnecting") return;
        if (this.agentRequestedEnd) {
          this.room = undefined;
          this.audioRoot.replaceChildren();
          this.setState("idle");
          return;
        }
        this.emitNotice({
          type: "provider_warning",
          message: "Vera ist nicht mehr verfügbar. Bitte starte ein neues Gespräch.",
        });
        this.reconnectAvailable = false;
        this.room = undefined;
        this.audioRoot.replaceChildren();
        this.setState("error");
        void room.disconnect();
      })
      .on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
        if (!participant?.isAgent) return;
        if (topic === toolStatusTopic) {
          const toolStatus = parseToolStatus(payload);
          if (!toolStatus) return;
          for (const listener of this.toolListeners) listener(toolStatus);
          this.setState(toolStatus.status === "started" ? "tool" : "thinking");
          return;
        }
        if (topic !== sessionNoticeTopic) return;
        const notice = parseSessionNotice(payload);
        if (!notice) return;
        this.emitNotice({ type: notice.type, message: notice.message });
        if (notice.type === "session_finishing") {
          this.agentRequestedEnd = true;
          this.setState("disconnecting");
          return;
        }
        if (notice.type === "session_ended") {
          this.agentRequestedEnd = true;
          void this.disconnect();
        }
      })
      .on(RoomEvent.Reconnecting, () => {
        if (this.agentRequestedEnd) return;
        this.setState("connecting");
        this.emitNotice({
          type: "provider_warning",
          message: "Die Verbindung ist instabil. Vera verbindet sich automatisch neu.",
        });
      })
      .on(RoomEvent.Reconnected, () => {
        if (this.agentRequestedEnd) return;
        this.reconnectAvailable = false;
        const agent = [...room.remoteParticipants.values()].find((participant) => participant.isAgent);
        if (!agent || !this.syncAgentState(agent)) this.setState("listening");
        this.emitNotice({ type: "provider_warning", message: "Die Verbindung wurde wiederhergestellt." });
      })
      .on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
        if (this.room !== room) return;
        this.audioRoot.replaceChildren();
        if (this.agentRequestedEnd) {
          this.room = undefined;
          this.setState("idle");
          return;
        }
        if (
          !this.agentRequestedEnd &&
          this.currentState !== "disconnecting" &&
          reason !== DisconnectReason.CLIENT_INITIATED
        ) {
          this.room = undefined;
          this.reconnectAvailable = true;
          this.emitNotice({
            type: "provider_warning",
            message: "Die Verbindung wurde getrennt. Du kannst dasselbe Gespräch wiederherstellen.",
          });
          this.setState("error");
        }
      });
  }

  private syncAgentState(participant: Participant): boolean {
    const state = mapAgentState(participant.attributes["lk.agent.state"]);
    if (!state) return false;
    this.setState(state);
    return true;
  }

  private emitNotice(notice: SessionNotice): void {
    for (const listener of this.noticeListeners) listener(notice);
  }

  private setState(state: VoiceState): void {
    if (this.currentState === state) return;
    this.currentState = state;
    for (const listener of this.stateListeners) listener(state);
  }
}
