import { llm } from "@livekit/agents";
import {
  createServiceRequestInputSchema,
  type CreateServiceRequestResult,
  type ServiceRequestService,
} from "@heyvera/core";

export type PublishServiceRequestStatus = (event: {
  name: "create_service_request";
  status: "started" | "succeeded" | "failed";
  serviceRequestId?: string;
  code?: "VALIDATION_ERROR" | "PERSISTENCE_ERROR";
}) => Promise<void>;

export function createServiceRequestTool(options: {
  conversationId: string;
  service: ServiceRequestService;
  publishStatus: PublishServiceRequestStatus;
}) {
  return llm.tool({
    name: "create_service_request",
    description: `
Speichert eine bestätigte Termin- oder Nebenkostenanfrage.
Rufe dieses Tool erst auf, wenn Anfragetyp, Name, konkretes Anliegen und vollständige Objektadresse vorliegen.
Bei einer Terminanfrage muss zusätzlich ein gewünschter Termin oder Zeitraum vorliegen.
Fasse alles zusammen und warte auf die ausdrückliche Bestätigung des Nutzers.
Das Tool bucht keinen Termin, prüft keine Nebenkostenabrechnung und verspricht keine Bearbeitung.
`,
    parameters: createServiceRequestInputSchema,
    onDuplicate: "reject",
    execute: async (request, { toolCallId }): Promise<CreateServiceRequestResult> => {
      await options.publishStatus({ name: "create_service_request", status: "started" }).catch((error: unknown) => {
        console.warn("agent_tool_status_publish_failed", { toolCallId, status: "started", error });
      });
      const result = await options.service.create({
        conversationId: options.conversationId,
        providerCallId: toolCallId,
        request,
      });
      await options.publishStatus({
        name: "create_service_request",
        status: result.ok ? "succeeded" : "failed",
        ...(result.ok ? { serviceRequestId: result.serviceRequestId } : { code: result.code }),
      }).catch((error: unknown) => {
        console.warn("agent_tool_status_publish_failed", { toolCallId, status: result.ok ? "succeeded" : "failed", error });
      });
      return result;
    },
  });
}
