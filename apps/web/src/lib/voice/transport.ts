export type VoiceState =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "tool"
  | "speaking"
  | "disconnecting"
  | "error";

export type TranscriptEvent = {
  id: string;
  text: string;
  isFinal: boolean;
  speaker: "user" | "assistant";
};

export type ToolStatusEvent = {
  name: string;
  status: "started" | "succeeded" | "failed";
};

export type Unsubscribe = () => void;

export interface VoiceTransport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  readonly state: VoiceState;
  onTranscript(callback: (event: TranscriptEvent) => void): Unsubscribe;
  onToolStatus(callback: (event: ToolStatusEvent) => void): Unsubscribe;
  onStateChange(callback: (state: VoiceState) => void): Unsubscribe;
}
