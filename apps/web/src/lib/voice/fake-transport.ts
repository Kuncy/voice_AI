import type {
  SessionNotice,
  ToolStatusEvent,
  TranscriptEvent,
  Unsubscribe,
  VoiceAudioTracks,
  VoiceSessionInfo,
  VoiceState,
  VoiceTransport,
} from "./transport";

export class FakeVoiceTransport implements VoiceTransport {
  private currentState: VoiceState = "idle";
  private readonly stateListeners = new Set<(state: VoiceState) => void>();
  private readonly noticeListeners = new Set<(event: SessionNotice) => void>();
  private noticeTimer: ReturnType<typeof setTimeout> | undefined;
  private microphoneMuted = true;
  private sessionInfo: VoiceSessionInfo | null = null;
  private readonly audioTrackListeners = new Set<(tracks: VoiceAudioTracks) => void>();
  private readonly sessionInfoListeners = new Set<(info: VoiceSessionInfo | null) => void>();

  public constructor(private readonly scenario: "default" | "connection-error" | "notice" = "default") {}

  public get state(): VoiceState {
    return this.currentState;
  }

  public get canReconnect(): boolean {
    return false;
  }

  public get isMicrophoneMuted(): boolean {
    return this.microphoneMuted;
  }

  public async connect(): Promise<void> {
    this.setState("connecting");
    if (this.scenario === "connection-error") {
      this.setState("error");
      throw new Error("Die Testverbindung konnte nicht aufgebaut werden.");
    }
    this.microphoneMuted = false;
    this.sessionInfo = { roomName: "fake-voice-session", connectedAt: Date.now() };
    this.emitSessionInfo();
    this.setState("listening");
    if (this.scenario === "notice") {
      this.emitNotice({ type: "provider_warning", message: "Erster Testhinweis" });
      this.noticeTimer = setTimeout(() => {
        this.noticeTimer = undefined;
        this.emitNotice({ type: "provider_warning", message: "Zweiter Testhinweis" });
      }, 4_000);
    }
  }

  public async disconnect(): Promise<void> {
    if (this.noticeTimer !== undefined) clearTimeout(this.noticeTimer);
    this.noticeTimer = undefined;
    this.setState("disconnecting");
    this.microphoneMuted = true;
    this.sessionInfo = null;
    this.emitSessionInfo();
    this.setState("idle");
  }

  public async setMicrophoneMuted(muted: boolean): Promise<void> {
    this.microphoneMuted = muted;
  }

  public onAudioTracks(callback: (tracks: VoiceAudioTracks) => void): Unsubscribe {
    this.audioTrackListeners.add(callback);
    callback({ input: null, output: null });
    return () => this.audioTrackListeners.delete(callback);
  }

  public onSessionInfo(callback: (info: VoiceSessionInfo | null) => void): Unsubscribe {
    this.sessionInfoListeners.add(callback);
    callback(this.sessionInfo);
    return () => this.sessionInfoListeners.delete(callback);
  }

  public onTranscript(_callback: (event: TranscriptEvent) => void): Unsubscribe {
    return () => undefined;
  }

  public onNotice(callback: (event: SessionNotice) => void): Unsubscribe {
    this.noticeListeners.add(callback);
    return () => this.noticeListeners.delete(callback);
  }

  public onToolStatus(_callback: (event: ToolStatusEvent) => void): Unsubscribe {
    return () => undefined;
  }

  public onStateChange(callback: (state: VoiceState) => void): Unsubscribe {
    this.stateListeners.add(callback);
    callback(this.currentState);
    return () => this.stateListeners.delete(callback);
  }

  private setState(state: VoiceState): void {
    this.currentState = state;
    for (const listener of this.stateListeners) listener(state);
  }

  private emitNotice(notice: SessionNotice): void {
    for (const listener of this.noticeListeners) listener(notice);
  }

  private emitSessionInfo(): void {
    for (const listener of this.sessionInfoListeners) listener(this.sessionInfo);
  }
}
