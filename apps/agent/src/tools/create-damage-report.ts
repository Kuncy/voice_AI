import { type CreateDamageReportResult, createDamageReportInputSchema, type DamageReportService } from "@heyvera/core";
import { llm } from "@livekit/agents";

export type PublishToolStatus = (event: {
  name: "create_damage_report";
  status: "started" | "succeeded" | "failed";
  damageReportId?: string;
  code?: "VALIDATION_ERROR" | "PERSISTENCE_ERROR";
}) => Promise<void>;

export function createDamageReportTool(options: {
  conversationId: string;
  service: DamageReportService;
  publishStatus: PublishToolStatus;
}) {
  return llm.tool({
    name: "create_damage_report",
    description: `
Speichert eine bestätigte Schadensmeldung.
Rufe dieses Tool erst auf, wenn der Name der meldenden Person, Kategorie, konkrete Beschreibung, Dringlichkeit, Straße mit Hausnummer,
fünfstellige Postleitzahl und Ort des betroffenen Objekts vollständig sind,
du alles kurz zusammengefasst hast und der Nutzer diese Zusammenfassung ausdrücklich bestätigt hat.
Leite die Dringlichkeit aus den geschilderten Fakten ab; verlange vom Nutzer keine Auswahl einer Dringlichkeitsstufe.
Terminwünsche, Nebenkostenfragen und sonstige Verwaltungsanliegen sind keine Schadensmeldungen.
Das Tool löst keinen Notruf und keine automatische Weiterleitung aus.
`,
    parameters: createDamageReportInputSchema,
    onDuplicate: "reject",
    execute: async (report, { toolCallId }): Promise<CreateDamageReportResult> => {
      await options.publishStatus({ name: "create_damage_report", status: "started" }).catch((error: unknown) => {
        console.warn("agent_tool_status_publish_failed", { toolCallId, status: "started", error });
      });
      const result = await options.service.create({
        conversationId: options.conversationId,
        providerCallId: toolCallId,
        report,
      });
      await options
        .publishStatus({
          name: "create_damage_report",
          status: result.ok ? "succeeded" : "failed",
          ...(result.ok ? { damageReportId: result.damageReportId } : { code: result.code }),
        })
        .catch((error: unknown) => {
          console.warn("agent_tool_status_publish_failed", {
            toolCallId,
            status: result.ok ? "succeeded" : "failed",
            error,
          });
        });
      console.info("agent_tool_completed", {
        toolCallId,
        conversationId: options.conversationId,
        ok: result.ok,
        ...(result.ok ? { damageReportId: result.damageReportId } : { code: result.code }),
      });
      return result;
    },
  });
}
