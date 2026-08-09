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

export type VoiceAudioTracks = {
  input: MediaStreamTrack | null;
  output: MediaStreamTrack | null;
};

export type VoiceSessionInfo = {
  roomName: string;
  connectedAt: number;
};

export type SessionNotice =
  | { type: "session_ended"; message: string }
  | { type: "session_finishing"; message: string }
  | { type: "provider_warning"; message: string };

export type Unsubscribe = () => void;

export interface VoiceTransport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  setMicrophoneMuted(muted: boolean): Promise<void>;
  readonly state: VoiceState;
  readonly canReconnect: boolean;
  readonly isMicrophoneMuted: boolean;
  onAudioTracks(callback: (tracks: VoiceAudioTracks) => void): Unsubscribe;
  onSessionInfo(callback: (info: VoiceSessionInfo | null) => void): Unsubscribe;
  onTranscript(callback: (event: TranscriptEvent) => void): Unsubscribe;
  onNotice(callback: (event: SessionNotice) => void): Unsubscribe;
  onToolStatus(callback: (event: ToolStatusEvent) => void): Unsubscribe;
  onStateChange(callback: (state: VoiceState) => void): Unsubscribe;
}
