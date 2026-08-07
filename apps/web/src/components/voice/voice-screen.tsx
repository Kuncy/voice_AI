"use client";

import { useEffect, useRef, useState } from "react";
import { FakeVoiceTransport } from "@/lib/voice/fake-transport";
import { LiveKitVoiceTransport } from "@/lib/voice/livekit-transport";
import type { TranscriptEvent, VoiceState, VoiceTransport } from "@/lib/voice/transport";

const labels: Record<VoiceState, string> = {
  idle: "Bereit",
  connecting: "Verbindung wird aufgebaut",
  listening: "Vera hört zu",
  thinking: "Vera denkt nach",
  tool: "Aktion wird ausgeführt",
  speaking: "Vera spricht",
  disconnecting: "Gespräch wird beendet",
  error: "Verbindung fehlgeschlagen",
};

export function VoiceScreen() {
  const audioRoot = useRef<HTMLDivElement>(null);
  const transport = useRef<VoiceTransport>(null);
  const [state, setState] = useState<VoiceState>("idle");
  const [transcripts, setTranscripts] = useState<TranscriptEvent[]>([]);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  useEffect(() => {
    if (!audioRoot.current) return;
    const useFake =
      process.env.NODE_ENV !== "production" &&
      new URLSearchParams(window.location.search).get("voiceTransport") === "fake";
    const instance = useFake
      ? new FakeVoiceTransport()
      : new LiveKitVoiceTransport(audioRoot.current);
    transport.current = instance;
    const unsubscribeState = instance.onStateChange(setState);
    const unsubscribeTranscript = instance.onTranscript((event) => {
      setTranscripts((current) => {
        const withoutPrevious = current.filter((entry) => entry.id !== event.id);
        return [...withoutPrevious, event];
      });
    });
    const unsubscribeNotice = instance.onNotice((event) => {
      setNotice(event.message);
    });
    return () => {
      unsubscribeState();
      unsubscribeTranscript();
      unsubscribeNotice();
      void instance.disconnect();
      transport.current = null;
    };
  }, []);

  async function toggleCall() {
    setError(undefined);
    setNotice(undefined);
    try {
      if (state === "idle" || state === "error") {
        setTranscripts([]);
        await transport.current?.connect();
      } else {
        await transport.current?.disconnect();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Die Verbindung ist fehlgeschlagen.");
    }
  }

  const isRunning = !["idle", "error"].includes(state);
  const isBusy = state === "connecting" || state === "disconnecting";

  return (
    <main className="voice-shell">
      <nav className="nav">
        <span className="brand-mark">V</span>
        <span className="brand">HeyVera</span>
        <span className="phase-badge">Voice Assistant</span>
      </nav>

      <section className="voice-card" aria-live="polite">
        <div className={`orb orb-${state}`} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <p className="eyebrow">DEUTSCH · LIVE</p>
        <h1>Sprich mit Vera.</h1>
        <p className="status"><i className={`status-dot status-dot-${state}`} />{labels[state]}</p>

        <button className={isRunning ? "call-button stop" : "call-button"} onClick={toggleCall} disabled={isBusy}>
          <span className="button-icon">{isRunning ? "■" : "●"}</span>
          {isRunning ? "Gespräch beenden" : "Gespräch starten"}
        </button>

        {error && <p className="error-message">{error}</p>}
        {notice && <p className="notice-message">{notice}</p>}

        <div className="transcript-panel">
          <div className="panel-heading">
            <span>Live-Transkript</span>
            <span>{transcripts.length > 0 ? `${transcripts.length} Beiträge` : "Noch leer"}</span>
          </div>
          <div className="transcript-list">
            {transcripts.length === 0 ? (
              <p className="empty-copy">Starte ein Gespräch. Deine finalen und laufenden Sprachbeiträge erscheinen hier.</p>
            ) : (
              transcripts.map((entry) => (
                <p className={`transcript transcript-${entry.speaker}`} key={entry.id}>
                  <strong>{entry.speaker === "assistant" ? "Vera" : "Du"}</strong>
                  <span>{entry.text}</span>
                  {!entry.isFinal && <em>live</em>}
                </p>
              ))
            )}
          </div>
        </div>
        <div ref={audioRoot} className="audio-root" />
      </section>
    </main>
  );
}
