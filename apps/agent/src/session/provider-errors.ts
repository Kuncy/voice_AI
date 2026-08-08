export type ProviderErrorKind = "rate_limit" | "timeout" | "other";

export function classifyProviderError(error: unknown): { kind: ProviderErrorKind; message: string } {
  const value = error as { message?: unknown; status?: unknown; statusCode?: unknown; code?: unknown } | undefined;
  const rawMessage = typeof value?.message === "string" ? value.message : "Voice provider request failed";
  const searchable =
    `${rawMessage} ${String(value?.status ?? "")} ${String(value?.statusCode ?? "")} ${String(value?.code ?? "")}`.toLowerCase();
  if (/\b429\b|rate.?limit|too many requests|quota/.test(searchable)) {
    return { kind: "rate_limit", message: rawMessage };
  }
  if (/timeout|timed out|deadline|etimedout/.test(searchable)) {
    return { kind: "timeout", message: rawMessage };
  }
  return { kind: "other", message: rawMessage };
}

export function providerWarning(kind: ProviderErrorKind): string {
  if (kind === "rate_limit") {
    return "Ein Sprachanbieter ist gerade ausgelastet. Falls keine Antwort folgt, stelle die Verbindung wieder her.";
  }
  if (kind === "timeout") {
    return "Die Antwort eines Sprachanbieters dauert zu lange. Falls keine Antwort folgt, stelle die Verbindung wieder her.";
  }
  return "Ein Sprachanbieter hatte kurzzeitig ein Problem. Falls keine Antwort folgt, stelle die Verbindung wieder her.";
}
