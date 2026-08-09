import { z } from "zod";

export const serviceRequestTypes = ["appointment", "billing"] as const;

export const createServiceRequestInputSchema = z
  .object({
    requestType: z.enum(serviceRequestTypes).describe("Art der Anfrage: Termin oder Nebenkosten"),
    reporterName: z.string().trim().min(2).max(200).describe("Name der anfragenden Person"),
    description: z.string().trim().min(10).max(2_000).describe("Konkretes Anliegen der anfragenden Person"),
    streetAndHouseNumber: z
      .string()
      .trim()
      .min(3)
      .max(200)
      .refine((value) => /\d/.test(value), "Straße und Hausnummer müssen vollständig sein.")
      .describe("Straße und Hausnummer des betroffenen Objekts"),
    postalCode: z
      .string()
      .trim()
      .regex(/^\d{5}$/, "Die Postleitzahl muss aus fünf Ziffern bestehen.")
      .describe("Fünfstellige deutsche Postleitzahl des betroffenen Objekts"),
    city: z.string().trim().min(2).max(100).describe("Ort des betroffenen Objekts"),
    preferredTimeframe: z
      .string()
      .trim()
      .min(2)
      .max(500)
      .nullable()
      .describe("Gewünschter Termin oder Zeitraum bei einer Terminanfrage, sonst null"),
  })
  .superRefine((request, context) => {
    if (request.requestType === "appointment" && !request.preferredTimeframe) {
      context.addIssue({
        code: "custom",
        path: ["preferredTimeframe"],
        message: "Für eine Terminanfrage ist ein gewünschter Termin oder Zeitraum erforderlich.",
      });
    }
  });

export type CreateServiceRequestInput = z.infer<typeof createServiceRequestInputSchema>;

export type CreateServiceRequestResult =
  | { ok: true; serviceRequestId: string; status: "open" }
  | { ok: false; code: "VALIDATION_ERROR" | "PERSISTENCE_ERROR" };

export interface ServiceRequestRepository {
  create(input: {
    conversationId: string;
    providerCallId: string;
    request: CreateServiceRequestInput;
  }): Promise<{ serviceRequestId: string; status: "open" }>;
}

export class ServiceRequestService {
  public constructor(private readonly repository: ServiceRequestRepository) {}

  public async create(input: {
    conversationId: string;
    providerCallId: string;
    request: unknown;
  }): Promise<CreateServiceRequestResult> {
    const parsed = createServiceRequestInputSchema.safeParse(input.request);
    if (!parsed.success || !input.conversationId || !input.providerCallId) {
      return { ok: false, code: "VALIDATION_ERROR" };
    }

    try {
      const persisted = await this.repository.create({
        conversationId: input.conversationId,
        providerCallId: input.providerCallId,
        request: parsed.data,
      });
      return { ok: true, ...persisted };
    } catch {
      return { ok: false, code: "PERSISTENCE_ERROR" };
    }
  }
}
