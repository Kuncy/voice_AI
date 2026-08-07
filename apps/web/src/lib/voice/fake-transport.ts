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

  public get state(): VoiceState {
    return this.currentState;
  }

  public async connect(): Promise<void> {
    this.setState("connecting");
    this.setState("listening");
  }

  public async disconnect(): Promise<void> {
    this.setState("disconnecting");
    this.setState("idle");
  }

  public onTranscript(_callback: (event: TranscriptEvent) => void): Unsubscribe {
    return () => undefined;
  }

  public onNotice(_callback: (event: SessionNotice) => void): Unsubscribe {
    return () => undefined;
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
}
