import { createHmac, timingSafeEqual } from "node:crypto";

export type SessionHandle = {
  conversationId: string;
  roomName: string;
  expiresAt: number;
};

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSessionHandle(value: SessionHandle, secret: string): string {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${payload}.${signature(payload, secret)}`;
}

export function parseSessionHandle(value: string | undefined, secret: string): SessionHandle | undefined {
  if (!value) return undefined;
  const [payload, received, extra] = value.split(".");
  if (!payload || !received || extra) return undefined;
  const expected = signature(payload, secret);
  if (received.length !== expected.length || !timingSafeEqual(Buffer.from(received), Buffer.from(expected))) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<SessionHandle>;
    if (
      typeof parsed.conversationId !== "string" ||
      typeof parsed.roomName !== "string" ||
      typeof parsed.expiresAt !== "number" ||
      parsed.expiresAt <= Date.now()
    ) return undefined;
    return parsed as SessionHandle;
  } catch {
    return undefined;
  }
}
