try {
  const savedTheme = localStorage.getItem("heyvera-theme");
  let theme = matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  if (savedTheme === "light" || savedTheme === "dark") {
    theme = savedTheme;
  }
  document.documentElement.dataset.theme = theme;
} catch {}
