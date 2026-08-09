import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogoutButton } from "./logout-button";

const items = [
  { href: "/requests", label: "Vorgänge", key: "requests" },
  { href: "/conversations", label: "Conversations", key: "conversations" },
  { href: "/settings", label: "Einstellungen", key: "settings" },
] as const;

export type AdminNavItem = (typeof items)[number]["key"];

export function AdminNav({ active }: { active: AdminNavItem }) {
  return (
    <header className="admin-header">
      <Link className="brand-link" href="/" aria-label="HeyVera Voice-Startseite">
        <span className="brand-mark" aria-hidden="true" />
        <span className="brand">HeyVera</span>
      </Link>
      <nav className="admin-nav" aria-label="Hauptnavigation">
        {items.map((item) => (
          <Link
            className={item.key === active ? "admin-nav-link active" : "admin-nav-link"}
            href={item.href}
            key={item.key}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <ThemeToggle />
      <LogoutButton />
    </header>
  );
}
