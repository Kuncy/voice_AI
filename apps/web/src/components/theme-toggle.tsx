"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "light";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  }, []);

  function toggleTheme() {
    const nextTheme: Theme = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = nextTheme;
    localStorage.setItem("heyvera-theme", nextTheme);
    setTheme(nextTheme);
  }

  const label = theme === "light" ? "Dunkelmodus aktivieren" : "Hellmodus aktivieren";
  return (
    <button className="theme-toggle" type="button" aria-label={label} title={label} onClick={toggleTheme}>
      <span className="theme-toggle-icon" aria-hidden="true" />
    </button>
  );
}
