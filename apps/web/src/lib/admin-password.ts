import { scryptSync, timingSafeEqual } from "node:crypto";

export function verifyAdminPassword(password: string, encodedHash: string): boolean {
  const [algorithm, salt, encodedExpected, extra] = encodedHash.split("$");
  if (algorithm !== "scrypt" || !salt || !encodedExpected || extra) return false;
  try {
    const expected = Buffer.from(encodedExpected, "base64url");
    const actual = scryptSync(password, Buffer.from(salt, "base64url"), expected.length);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
