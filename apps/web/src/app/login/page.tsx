import { getAdminEnv } from "@heyvera/config";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { safeAdminRedirect } from "@/lib/admin-redirect";
import { adminSessionCookie, parseAdminSessionToken } from "@/lib/admin-session-token";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const query = await searchParams;
  const env = getAdminEnv();
  const session = parseAdminSessionToken((await cookies()).get(adminSessionCookie)?.value, env.SESSION_SECRET);
  if (session?.username === env.ADMIN_USERNAME) redirect(safeAdminRedirect(query.next));

  return (
    <main className="login-shell">
      <section className="login-card">
        <p className="eyebrow">GESCHÜTZTER BEREICH</p>
        <h1>Admin-Anmeldung</h1>
        <p className="settings-intro">
          Conversation-Verläufe, Vorgänge und Vera-Einstellungen sind nur nach Anmeldung sichtbar.
        </p>
        {query.error && (
          <p className="error-message" role="alert">
            Benutzername oder Passwort ist nicht korrekt.
          </p>
        )}
        <form className="settings-form" action="/api/admin/login" method="post">
          <input type="hidden" name="next" value={safeAdminRedirect(query.next)} />
          <label>
            <span>Benutzername</span>
            <input name="username" autoComplete="username" required />
          </label>
          <label>
            <span>Passwort</span>
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <button className="settings-submit" type="submit">
            Anmelden
          </button>
        </form>
      </section>
    </main>
  );
}
