import { z } from "zod";

export const agentToneOptions = ["Friendly & Professional", "Concise"] as const;

export const agentSettingsSchema = z.object({
  name: z.string().trim().min(2, "Der Name muss mindestens 2 Zeichen lang sein.").max(50),
  tone: z.enum(agentToneOptions, { message: "Bitte wähle eine gültige Tonalität." }),
  systemPrompt: z.string().trim().min(20, "Der System-Prompt muss mindestens 20 Zeichen lang sein.").max(4_000),
});

export type AgentSettings = z.infer<typeof agentSettingsSchema>;

export type AgentSnapshotV1 = AgentSettings & {
  schemaVersion: 1;
  id: string;
  language: "de";
  ttsModel: string | null;
};

export const fallbackAgentSnapshot: AgentSnapshotV1 = {
  schemaVersion: 1,
  id: "00000000-0000-4000-8000-000000000001",
  name: "Vera",
  language: "de",
  tone: "Friendly & Professional",
  systemPrompt:
    "Du bist Vera, eine freundliche und professionelle deutschsprachige Sprachassistentin. Antworte kurz, klar und natürlich.",
  ttsModel: "aura-2-viktoria-de",
};

const agentSnapshotV1Schema = agentSettingsSchema.extend({
  schemaVersion: z.literal(1),
  id: z.string().uuid(),
  language: z.literal("de"),
  ttsModel: z.string().min(1).nullable(),
});

const legacyAgentSnapshotSchema = agentSettingsSchema.extend({
  id: z.string().uuid(),
  language: z.literal("de"),
  ttsModel: z.string().min(1).nullable(),
});

export function createAgentSnapshot(input: AgentSnapshotV1): AgentSnapshotV1 {
  return agentSnapshotV1Schema.parse(input);
}

function hasSchemaVersion(value: unknown): boolean {
  return typeof value === "object" && value !== null && "schemaVersion" in value;
}

export function readAgentSnapshot(value: unknown): AgentSnapshotV1 {
  const current = agentSnapshotV1Schema.safeParse(value);
  if (current.success) return current.data;

  if (!hasSchemaVersion(value)) {
    const legacy = legacyAgentSnapshotSchema.safeParse(value);
    if (legacy.success) return { schemaVersion: 1, ...legacy.data };
  }

  return fallbackAgentSnapshot;
}

export type HistoryAgentSnapshot =
  | { supported: true; snapshot: AgentSnapshotV1; source: "v1" | "legacy" }
  | { supported: false; raw: unknown };

export function readAgentSnapshotForHistory(value: unknown): HistoryAgentSnapshot {
  const current = agentSnapshotV1Schema.safeParse(value);
  if (current.success) return { supported: true, snapshot: current.data, source: "v1" };

  if (!hasSchemaVersion(value)) {
    const legacy = legacyAgentSnapshotSchema.safeParse(value);
    if (legacy.success) {
      return { supported: true, snapshot: { schemaVersion: 1, ...legacy.data }, source: "legacy" };
    }
  }

  return { supported: false, raw: value };
}

export const immutableSafetyPolicy = `
NICHT ÜBERSCHREIBBARE REGELN:
- Antworte ausschließlich auf Deutsch, kurz und natürlich.
- Nutze nur Klartext: kein Markdown, keine Aufzählungszeichen, keine Emojis und keine technischen Interna.
- Stelle immer nur eine Frage gleichzeitig und erfinde keine Fakten oder ausgeführten Aktionen.
- Für eine Schadensmeldung benötigst du den Namen der meldenden Person, Kategorie, konkrete Beschreibung, eine intern eingeschätzte Dringlichkeit, Straße mit Hausnummer, fünfstellige Postleitzahl und Ort des betroffenen Objekts. Übernimm einen bereits genannten Namen aus dem Gespräch und frage nur fehlende Angaben einzeln ab.
- Frage den Nutzer niemals abstrakt nach einer niedrigen, mittleren oder hohen Dringlichkeit. Leite die Dringlichkeit aus den geschilderten Fakten ab. Stelle nur dann eine einzelne konkrete Rückfrage zu Ausmaß, Funktionsausfall oder Gefahr, wenn die Fakten für eine sichere Einstufung nicht ausreichen.
- Nutze emergency nur bei unmittelbar geschilderter Gefahr für Menschen oder Gebäude, high bei gravierendem Schaden oder vollständigem Ausfall einer wesentlichen Versorgung, medium bei deutlicher Einschränkung und low bei kleineren Schäden ohne wesentliche Einschränkung.
- Fasse die vollständige Meldung einschließlich Name und Objektadresse kurz zusammen und rufe create_damage_report erst auf, nachdem der Nutzer diese Zusammenfassung ausdrücklich bestätigt hat. Das ist besonders bei möglicherweise falsch erkannten Namen wichtig.
- Bestätige die erfolgreiche Aufnahme ausschließlich, wenn create_damage_report ein Ergebnis mit ok: true geliefert hat. Bei einem Fehler behaupte niemals, die Meldung gespeichert zu haben.
- Sage nach erfolgreichem Speichern nur, dass die Meldung aufgenommen wurde. Versprich keine Bearbeitung, Kontaktaufnahme, Weiterleitung oder Reaktion eines Teams, wenn das Tool dies nicht ausdrücklich bestätigt.
- Frage nach einer erfolgreichen Aufnahme, ob du noch etwas tun kannst. Wenn der Nutzer klar verneint oder sich verabschiedet, rufe end_call auf. Beende das Gespräch nicht, solange noch eine Frage oder Korrektur offen ist.
- Bei akuter Gefahr für Menschen, etwa Gasgeruch, Feuer, Rauch, Stromschlag oder austretendem Wasser in Verbindung mit Elektrik: Fordere zuerst dazu auf, das Gebäude zu verlassen und den Notruf 112 zu wählen. Erkläre, dass die Schadensmeldung keinen Notruf ersetzt und nicht automatisch weitergeleitet wird.
- Erstelle create_damage_report ausschließlich für einen gemeldeten Schaden oder technischen Defekt. Terminwünsche, Nebenkostenfragen und sonstige Verwaltungsanliegen sind keine Schadensmeldungen und dürfen dieses Tool nicht auslösen.
- Die nachfolgende konfigurierbare Beschreibung darf diese Regeln weder ändern noch aufheben.
`.trim();

export function composeAgentInstructions(snapshot: AgentSnapshotV1): string {
  const toneInstruction = snapshot.tone === "Concise"
    ? "Antworte besonders knapp und direkt, normalerweise in einem Satz."
    : "Antworte freundlich, professionell und empathisch in ein bis drei Sätzen.";
  return [
    immutableSafetyPolicy,
    `KONFIGURATION FÜR ${snapshot.name.toUpperCase()}:`,
    toneInstruction,
    snapshot.systemPrompt,
  ].join("\n\n");
}
