import { z } from "zod";

export const damageCategories = ["heating", "water", "electricity", "structural", "other"] as const;
export const damageUrgencies = ["low", "medium", "high", "emergency"] as const;

export const createDamageReportInputSchema = z.object({
  reporterName: z.string().trim().min(2).max(200).describe("Vollständiger Name der meldenden Person"),
  category: z.enum(damageCategories).describe("Art des Schadens"),
  description: z.string().trim().min(10).max(2_000).describe("Konkrete Beschreibung des Schadens"),
  urgency: z.enum(damageUrgencies).describe("Dringlichkeit des Schadens"),
  streetAndHouseNumber: z.string().trim().min(3).max(200)
    .refine((value) => /\d/.test(value), "Straße und Hausnummer müssen vollständig sein.")
    .describe("Straße und Hausnummer des betroffenen Objekts"),
  postalCode: z.string().trim().regex(/^\d{5}$/, "Die Postleitzahl muss aus fünf Ziffern bestehen.")
    .describe("Fünfstellige deutsche Postleitzahl des betroffenen Objekts"),
  city: z.string().trim().min(2).max(100).describe("Ort des betroffenen Objekts"),
});

export type CreateDamageReportInput = z.infer<typeof createDamageReportInputSchema>;

export type CreateDamageReportResult =
  | { ok: true; damageReportId: string; status: "open" }
  | { ok: false; code: "VALIDATION_ERROR" | "PERSISTENCE_ERROR" };

export interface DamageReportRepository {
  create(input: {
    conversationId: string;
    providerCallId: string;
    report: CreateDamageReportInput;
  }): Promise<{ damageReportId: string; status: "open" }>;
}

export class DamageReportService {
  public constructor(private readonly repository: DamageReportRepository) {}

  public async create(input: {
    conversationId: string;
    providerCallId: string;
    report: unknown;
  }): Promise<CreateDamageReportResult> {
    const parsed = createDamageReportInputSchema.safeParse(input.report);
    if (!parsed.success || !input.conversationId || !input.providerCallId) {
      return { ok: false, code: "VALIDATION_ERROR" };
    }

    try {
      const persisted = await this.repository.create({
        conversationId: input.conversationId,
        providerCallId: input.providerCallId,
        report: parsed.data,
      });
      return { ok: true, ...persisted };
    } catch {
      return { ok: false, code: "PERSISTENCE_ERROR" };
    }
  }
}
