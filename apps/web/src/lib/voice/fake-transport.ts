import type {
  SessionNotice,
  ToolStatusEvent,
  TranscriptEvent,
  Unsubscribe,
  VoiceState,
  VoiceTransport,
} from "./transport";

export class FakeVoiceTransport implements VoiceTransport {
  private currentState: VoiceState = "idle";
  private readonly stateListeners = new Set<(state: VoiceState) => void>();
  private readonly noticeListeners = new Set<(event: SessionNotice) => void>();
  private noticeTimer: ReturnType<typeof setTimeout> | undefined;

  public constructor(private readonly scenario: "default" | "connection-error" | "notice" = "default") {}

  public get state(): VoiceState {
    return this.currentState;
  }

  public get canReconnect(): boolean {
    return false;
  }

  public async connect(): Promise<void> {
    this.setState("connecting");
    if (this.scenario === "connection-error") {
      this.setState("error");
      throw new Error("Die Testverbindung konnte nicht aufgebaut werden.");
    }
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
    this.setState("idle");
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
}
