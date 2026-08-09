"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AudioLevelMonitor } from "@/lib/voice/audio-level";
import { FakeVoiceTransport } from "@/lib/voice/fake-transport";
import { LiveKitVoiceTransport } from "@/lib/voice/livekit-transport";
import { reconcileTranscript } from "@/lib/voice/transcript-reducer";
import type {
  ToolStatusEvent,
  TranscriptEvent,
  VoiceSessionInfo,
  VoiceState,
  VoiceTransport,
} from "@/lib/voice/transport";
import { ThemeToggle } from "@/components/theme-toggle";
import { VoiceSphere } from "./voice-sphere";

const statusCopy: Record<VoiceState, { title: string; subtitle: string }> = {
  idle: { title: "Bereit", subtitle: "Tippe auf das Mikrofon oder sprich einfach los." },
  connecting: { title: "Verbindung wird aufgebaut", subtitle: "Vera tritt der Session bei." },
  listening: { title: "Vera hört zu", subtitle: "Sprich in normalem Tempo, Pausen sind in Ordnung." },
  thinking: { title: "Vera denkt nach", subtitle: "Die Angaben werden geprüft und strukturiert." },
  tool: { title: "Aktion wird ausgeführt", subtitle: "Der Vorgang wird gespeichert." },
  speaking: { title: "Vera spricht", subtitle: "Du kannst jederzeit dazwischengehen." },
  disconnecting: { title: "Gespräch wird beendet", subtitle: "Die Session wird sauber geschlossen." },
  error: { title: "Verbindung unterbrochen", subtitle: "Die Session wurde getrennt. Erneut verbinden?" },
};

const connectionCopy: Record<VoiceState, string> = {
  idle: "Getrennt",
  connecting: "Verbinden …",
  listening: "Verbunden",
  thinking: "Verbunden",
  tool: "Verbunden",
  speaking: "Verbunden",
  disconnecting: "Trennen …",
  error: "Getrennt",
};

function callButtonLabel(isRunning: boolean, canReconnect: boolean): string {
  if (isRunning) return "Gespräch beenden";
  if (canReconnect) return "Verbindung wiederherstellen";
  return "Gespräch starten";
}

function toolStatusLabel(event: ToolStatusEvent): string {
  const damage = event.name === "create_damage_report";
  if (event.status === "started") return damage ? "Schadensmeldung wird gespeichert" : "Anfrage wird gespeichert";
  if (event.status === "succeeded") return damage ? "Schadensmeldung gespeichert" : "Anfrage gespeichert";
  return damage ? "Schadensmeldung konnte nicht gespeichert werden" : "Anfrage konnte nicht gespeichert werden";
}

function clock(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function VoiceScreen() {
  const audioRoot = useRef<HTMLDivElement>(null);
  const transport = useRef<VoiceTransport>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inputLevelRef = useRef(0.12);
  const outputLevelRef = useRef(0.12);
  const transcriptTimes = useRef(new Map<string, number>());
  const lastSessionStartedAt = useRef(Date.now());
  const liveTranscriptRef = useRef<HTMLDivElement>(null);
  const lastFinalUserAt = useRef<number | undefined>(undefined);
  const sheetRef = useRef<HTMLDialogElement>(null);
  const sheetPointerStart = useRef<number | undefined>(undefined);
  const [state, setState] = useState<VoiceState>("idle");
  const [transcripts, setTranscripts] = useState<TranscriptEvent[]>([]);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [toolStatus, setToolStatus] = useState<ToolStatusEvent>();
  const [sessionInfo, setSessionInfo] = useState<VoiceSessionInfo | null>(null);
  const [muted, setMuted] = useState(true);
  const [responseMs, setResponseMs] = useState<number>();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sphereSize, setSphereSize] = useState(440);
  const transcriptVersion = `${transcripts.length}:${transcripts.at(-1)?.text.length ?? 0}:${transcripts.at(-1)?.isFinal ?? false}:${toolStatus?.status ?? ""}`;

  const clearNotice = useCallback(() => {
    if (noticeTimer.current !== undefined) clearTimeout(noticeTimer.current);
    noticeTimer.current = undefined;
    setNotice(undefined);
  }, []);

  const showNotice = useCallback((message: string) => {
    if (noticeTimer.current !== undefined) clearTimeout(noticeTimer.current);
    setNotice(message);
    noticeTimer.current = setTimeout(() => {
      noticeTimer.current = undefined;
      setNotice(undefined);
    }, 6_000);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 899px)");
    const update = () => setSphereSize(media.matches ? 290 : 440);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const dialog = sheetRef.current;
    if (!dialog) return;
    if (sheetOpen && !dialog.open) dialog.showModal();
    if (!sheetOpen && dialog.open) dialog.close();
  }, [sheetOpen]);

  useEffect(() => {
    if (!sessionInfo) {
      setElapsedSeconds(0);
      return;
    }
    const update = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - sessionInfo.connectedAt) / 1000)));
    update();
    const timer = setInterval(update, 1_000);
    return () => clearInterval(timer);
  }, [sessionInfo]);

  useEffect(() => {
    if (!transcriptVersion) return;
    const transcript = liveTranscriptRef.current;
    if (!transcript) return;
    const frame = requestAnimationFrame(() => {
      transcript.scrollTop = transcript.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [transcriptVersion]);

  useEffect(() => {
    if (!audioRoot.current) return;
    const inputMonitor = new AudioLevelMonitor(inputLevelRef);
    const outputMonitor = new AudioLevelMonitor(outputLevelRef);
    const query = new URLSearchParams(window.location.search);
    const useFake = process.env.NODE_ENV !== "production" && query.get("voiceTransport") === "fake";
    const scenario = query.get("fakeScenario");
    const instance = useFake
      ? new FakeVoiceTransport(scenario === "connection-error" || scenario === "notice" ? scenario : "default")
      : new LiveKitVoiceTransport(audioRoot.current);
    transport.current = instance;
    const unsubscribeState = instance.onStateChange((nextState) => {
      setState(nextState);
      setMuted(instance.isMicrophoneMuted);
      if (nextState === "speaking" && lastFinalUserAt.current !== undefined) {
        setResponseMs(Math.max(0, Math.round(performance.now() - lastFinalUserAt.current)));
        lastFinalUserAt.current = undefined;
      }
    });
    const unsubscribeTranscript = instance.onTranscript((event) => {
      if (!transcriptTimes.current.has(event.id)) transcriptTimes.current.set(event.id, Date.now());
      if (event.speaker === "user" && event.isFinal) lastFinalUserAt.current = performance.now();
      setTranscripts((current) => reconcileTranscript(current, event));
    });
    const unsubscribeNotice = instance.onNotice((event) => showNotice(event.message));
    const unsubscribeToolStatus = instance.onToolStatus(setToolStatus);
    const unsubscribeAudio = instance.onAudioTracks((tracks) => {
      inputMonitor.setTrack(tracks.input);
      outputMonitor.setTrack(tracks.output);
    });
    const unsubscribeSession = instance.onSessionInfo((info) => {
      if (info) lastSessionStartedAt.current = info.connectedAt;
      setSessionInfo(info);
    });
    return () => {
      unsubscribeState();
      unsubscribeTranscript();
      unsubscribeNotice();
      unsubscribeToolStatus();
      unsubscribeAudio();
      unsubscribeSession();
      inputMonitor.dispose();
      outputMonitor.dispose();
      if (noticeTimer.current !== undefined) clearTimeout(noticeTimer.current);
      void instance.disconnect();
      transport.current = null;
    };
  }, [showNotice]);

  async function toggleCall() {
    setError(undefined);
    clearNotice();
    setToolStatus(undefined);
    try {
      if (state === "idle" || state === "error") {
        if (!transport.current?.canReconnect) {
          setTranscripts([]);
          transcriptTimes.current.clear();
        }
        setResponseMs(undefined);
        await transport.current?.connect();
      } else {
        await transport.current?.disconnect();
      }
      setMuted(transport.current?.isMicrophoneMuted ?? true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Die Verbindung ist fehlgeschlagen.");
    }
  }

  async function toggleMuted() {
    const next = !muted;
    try {
      await transport.current?.setMicrophoneMuted(next);
      setMuted(next);
    } catch {
      showNotice("Das Mikrofon konnte nicht umgeschaltet werden.");
    }
  }

  const isRunning = !["idle", "error"].includes(state);
  const isBusy = state === "connecting" || state === "disconnecting";
  const canReconnect = state === "error" && Boolean(transport.current?.canReconnect);
  const latestTranscript = transcripts.at(-1);
  const sessionStart = sessionInfo?.connectedAt ?? lastSessionStartedAt.current;

  function transcriptItem(entry: TranscriptEvent, index: number) {
    const receivedAt = transcriptTimes.current.get(entry.id) ?? sessionStart;
    const age = transcripts.length <= 1 ? 0 : (transcripts.length - 1 - index) / (transcripts.length - 1);
    return (
      <article
        className={`${entry.isFinal ? "live-transcript-entry" : "live-transcript-entry partial"} speaker-${entry.speaker}`}
        style={{ opacity: 1 - age * 0.42 }}
        key={entry.id}
      >
        <div className="transcript-meta">
          <strong>{entry.speaker === "assistant" ? "VERA" : "DU"}</strong>
          <time>{clock(Math.max(0, Math.floor((receivedAt - sessionStart) / 1000)))}</time>
          {!entry.isFinal && <span>LIVE</span>}
        </div>
        <p>{entry.text}</p>
      </article>
    );
  }

  return (
    <main className={`voice-shell voice-state-${state}`}>
      <header className="voice-header">
        <Link className="brand-link" href="/">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand">HeyVera</span>
        </Link>
        <nav className="voice-nav" aria-label="Hauptnavigation">
          <Link href="/requests">Vorgänge</Link>
          <Link href="/conversations">Conversations</Link>
          <Link href="/settings">Einstellungen</Link>
        </nav>
        <ThemeToggle />
        <div className="connection-pill">
          <span className="connection-dot" aria-hidden="true" />
          {connectionCopy[state]}
        </div>
      </header>

      <section className="voice-stage">
        <p className="voice-eyebrow">AKTIVE SESSION · DEUTSCH</p>
        <VoiceSphere state={state} inputLevelRef={inputLevelRef} outputLevelRef={outputLevelRef} size={sphereSize} />
        <div className="voice-status" role="status" aria-live="polite">
          <h1>{statusCopy[state].title}</h1>
          <p>{statusCopy[state].subtitle}</p>
        </div>
        <div className="voice-controls">
          {isRunning && !isBusy && (
            <button
              type="button"
              className={muted ? "mic-button muted" : "mic-button"}
              aria-label={muted ? "Mikrofon einschalten" : "Mikrofon stummschalten"}
              aria-pressed={muted}
              onClick={toggleMuted}
            >
              <span className="mic-glyph" aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            className={isRunning ? "session-button stop" : "session-button start"}
            onClick={toggleCall}
            disabled={isBusy}
          >
            {callButtonLabel(isRunning, canReconnect)}
          </button>
        </div>
        {error && <p className="voice-alert error-message">{error}</p>}
        {notice && <p className="voice-alert notice-message">{notice}</p>}
      </section>

      <aside className="live-transcript-panel" aria-label="Live-Transkript">
        <header>
          <span>TRANSKRIPT</span>
          <span className="live-status">
            <i className="live-indicator" /> live
          </span>
        </header>
        <div className="live-transcript-list" ref={liveTranscriptRef}>
          {transcripts.length === 0 ? (
            <p className="live-transcript-empty">
              Finale und laufende Sprachbeiträge erscheinen während des Gesprächs hier.
            </p>
          ) : (
            transcripts.map(transcriptItem)
          )}
          {toolStatus && (
            <div className={`transcript-tool-status ${toolStatus.status}`} role="status">
              <span aria-hidden="true" />
              {toolStatusLabel(toolStatus)}
            </div>
          )}
        </div>
      </aside>

      <button
        className="mobile-transcript-preview"
        type="button"
        onClick={() => setSheetOpen(true)}
        disabled={!latestTranscript}
      >
        <span className="mobile-transcript-heading">
          <strong>TRANSKRIPT</strong>
          <small>nach oben ziehen</small>
        </span>
        {latestTranscript ? (
          <span className="mobile-latest">
            <strong>{latestTranscript.speaker === "assistant" ? "VERA" : "DU"}</strong>
            {latestTranscript.text}
          </span>
        ) : (
          <span className="mobile-latest empty">Noch kein Beitrag</span>
        )}
        <i className="preview-handle" aria-hidden="true" />
      </button>

      <footer className="voice-footer">
        <span>
          Dauer <strong>{clock(elapsedSeconds)}</strong>
        </span>
        <span>
          Antwortzeit <strong>{responseMs === undefined ? "–" : `${responseMs} ms`}</strong>
        </span>
        <span>
          Stimme <strong>Aura-2 Viktoria</strong>
        </span>
        <code>room · {sessionInfo?.roomName ?? "–"}</code>
      </footer>

      <dialog
        className="transcript-sheet"
        ref={sheetRef}
        onCancel={(event) => {
          event.preventDefault();
          setSheetOpen(false);
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) setSheetOpen(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setSheetOpen(false);
        }}
        onPointerDown={(event) => {
          sheetPointerStart.current = event.clientY;
        }}
        onPointerUp={(event) => {
          if (sheetPointerStart.current !== undefined && event.clientY - sheetPointerStart.current > 70)
            setSheetOpen(false);
          sheetPointerStart.current = undefined;
        }}
      >
        <div className="transcript-sheet-card">
          <button
            className="sheet-handle"
            type="button"
            aria-label="Transkript schließen"
            onClick={() => setSheetOpen(false)}
          >
            <span />
          </button>
          <div className="sheet-heading">
            <strong>TRANSKRIPT</strong>
            <button type="button" onClick={() => setSheetOpen(false)}>
              Schließen
            </button>
          </div>
          <div className="sheet-list">{transcripts.map(transcriptItem)}</div>
        </div>
      </dialog>
      <div ref={audioRoot} className="audio-root" />
    </main>
  );
}
