// The theme: `data-theme` on <html> (none = follow the system) and the remembered choice. Set by the palette and by Settings (#6); `main.tsx` restores it.
export type Theme = "light" | "dark" | null;

/** The theme the page shows now: the explicit choice, or null for "system". */
export const currentTheme = (): Theme => {
  const t = document.documentElement.dataset.theme;
  return t === "light" || t === "dark" ? t : null;
};

export const setTheme = (t: Theme) => {
  if (t) document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  try {
    if (t) localStorage.setItem("tandem.theme", t);
    else localStorage.removeItem("tandem.theme");
  } catch {}
};
