export type SessionEndReason = "idle_timeout" | "max_duration" | "max_turns";

type AgentState = "initializing" | "idle" | "listening" | "thinking" | "speaking";
type UserState = "speaking" | "listening" | "away";
type TimerHandle = ReturnType<typeof setTimeout>;

type GuardrailOptions = {
  maxDurationMs: number;
  maxTurns: number;
  onEnd: (reason: SessionEndReason) => void;
  schedule?: (callback: () => void, delayMs: number) => TimerHandle;
  cancel?: (handle: TimerHandle) => void;
};

export class SessionGuardrails {
  private readonly schedule: NonNullable<GuardrailOptions["schedule"]>;
  private readonly cancel: NonNullable<GuardrailOptions["cancel"]>;
  private durationTimer?: TimerHandle;
  private turnCount = 0;
  private maxTurnsPending = false;
  private replyStartedAfterLimit = false;
  private ended = false;

  public constructor(private readonly options: GuardrailOptions) {
    this.schedule = options.schedule ?? setTimeout;
    this.cancel = options.cancel ?? clearTimeout;
  }

  public get turns(): number {
    return this.turnCount;
  }

  public start(): void {
    if (this.durationTimer || this.ended) return;
    this.durationTimer = this.schedule(() => this.end("max_duration"), this.options.maxDurationMs);
    this.durationTimer.unref?.();
  }

  public onFinalUserTurn(): number {
    if (this.ended) return this.turnCount;
    this.turnCount += 1;
    if (this.turnCount >= this.options.maxTurns) this.maxTurnsPending = true;
    return this.turnCount;
  }

  public onAgentStateChanged(state: AgentState): void {
    if (!this.maxTurnsPending || this.ended) return;
    if (state === "speaking") {
      this.replyStartedAfterLimit = true;
      return;
    }
    if (this.replyStartedAfterLimit && (state === "listening" || state === "idle")) {
      this.end("max_turns");
    }
  }

  public onUserStateChanged(state: UserState): void {
    if (state === "away") this.end("idle_timeout");
  }

  public dispose(): void {
    if (this.durationTimer) this.cancel(this.durationTimer);
    this.durationTimer = undefined;
  }

  private end(reason: SessionEndReason): void {
    if (this.ended) return;
    this.ended = true;
    this.dispose();
    this.options.onEnd(reason);
  }
}
