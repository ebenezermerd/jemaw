/**
 * Theme preference. "system" follows Telegram's colorScheme; "light"/"dark"
 * override it. Persisted in localStorage and applied to <html data-theme>.
 */
export type ThemePref = "system" | "light" | "dark";

const KEY = "jemaw-theme";

export function getThemePref(): ThemePref {
  const v = localStorage.getItem(KEY);
  return v === "light" || v === "dark" ? v : "system";
}

export function setThemePref(pref: ThemePref): void {
  if (pref === "system") localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, pref);
  applyTheme(pref);
}

/** Resolve + apply the active theme to the document. */
export function applyTheme(pref: ThemePref = getThemePref()): void {
  let resolved: "light" | "dark";
  if (pref === "system") {
    const scheme = window.Telegram?.WebApp?.colorScheme;
    resolved = scheme === "light" ? "light" : "dark";
  } else {
    resolved = pref;
  }
  document.documentElement.dataset.theme = resolved;
}
