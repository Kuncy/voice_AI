import type { TranscriptEvent } from "./transport";

export function reconcileTranscript(current: TranscriptEvent[], incoming: TranscriptEvent): TranscriptEvent[] {
  const index = current.findIndex((entry) => entry.id === incoming.id);
  if (index < 0) return [...current, incoming];
  const existing = current[index];
  if (!existing) return current;
  if (existing.isFinal && !incoming.isFinal) return current;
  const next = [...current];
  next[index] = incoming;
  return next;
}
