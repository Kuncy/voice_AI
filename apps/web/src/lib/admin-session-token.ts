import { createHmac, timingSafeEqual } from "node:crypto";

export const adminSessionCookie = "heyvera_admin";
export const adminSessionTtlMs = 8 * 60 * 60_000;

type AdminSession = {
  username: string;
  expiresAt: number;
};

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createAdminSessionToken(value: AdminSession, secret: string): string {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${payload}.${signature(payload, secret)}`;
}

export function parseAdminSessionToken(value: string | undefined, secret: string): AdminSession | undefined {
  if (!value) return undefined;
  const [payload, received, extra] = value.split(".");
  if (!payload || !received || extra) return undefined;

  const receivedBytes = Buffer.from(received);
  const expectedBytes = Buffer.from(signature(payload, secret));
  if (receivedBytes.length !== expectedBytes.length || !timingSafeEqual(receivedBytes, expectedBytes)) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<AdminSession>;
    if (
      typeof parsed.username !== "string" ||
      !parsed.username ||
      typeof parsed.expiresAt !== "number" ||
      parsed.expiresAt <= Date.now()
    ) return undefined;
    return parsed as AdminSession;
  } catch {
    return undefined;
  }
}
