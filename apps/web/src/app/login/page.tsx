import { getAdminEnv } from "@heyvera/config";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminSessionCookie, parseAdminSessionToken } from "@/lib/admin-session-token";
import { ThemeToggle } from "@/components/theme-toggle";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const query = await searchParams;
  const env = getAdminEnv();
  const session = parseAdminSessionToken((await cookies()).get(adminSessionCookie)?.value, env.SESSION_SECRET);
  if (session?.username === env.ADMIN_USERNAME) redirect("/");

  return (
    <main className="login-shell">
      <section className="login-wrap">
        <div className="login-toolbar">
          <div className="login-brand">
            <span className="brand-mark" aria-hidden="true" />
            <span>HeyVera</span>
          </div>
          <ThemeToggle />
        </div>
        <div className="login-card">
          <p className="login-kicker">GESCHÜTZTER BEREICH</p>
          <h1>Willkommen zurück.</h1>
          <p className="login-intro">Melde dich an, um Conversations, Vorgänge und Vera-Einstellungen zu verwalten.</p>
          {query.error && (
            <p className="login-error" role="alert">
              Benutzername oder Passwort ist nicht korrekt.
            </p>
          )}
          <form className="login-form" action="/api/admin/login" method="post">
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
        </div>
      </section>
    </main>
  );
}
