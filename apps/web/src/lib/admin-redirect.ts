const adminOrigins = ["/conversations", "/requests", "/settings"];
const internalOrigin = "https://heyvera.invalid";

export function safeAdminRedirect(value: unknown): string {
  if (typeof value !== "string" || value.includes("\\")) return "/conversations";
  try {
    const url = new URL(value, internalOrigin);
    if (url.origin !== internalOrigin) return "/conversations";
    if (!adminOrigins.some((path) => url.pathname === path || url.pathname.startsWith(`${path}/`))) {
      return "/conversations";
    }
    return `${url.pathname}${url.search}`;
  } catch {
    return "/conversations";
  }
}
