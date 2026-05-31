/**
 * Reads Telegram Mini App initData. Stub-safe: when run outside Telegram
 * (e.g. local browser dev), returns an empty string instead of throwing.
 * HMAC verification happens server-side.
 */
interface TelegramWebApp {
  initData: string;
  initDataUnsafe?: { start_param?: string };
  colorScheme?: "light" | "dark";
  ready: () => void;
  expand?: () => void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export function getInitData(): string {
  const wa = window.Telegram?.WebApp;
  if (wa) {
    wa.ready();
    wa.expand?.();
    return wa.initData ?? "";
  }
  return "";
}

export function isInsideTelegram(): boolean {
  return Boolean(window.Telegram?.WebApp?.initData);
}

/** Apply Telegram's color scheme to the document (dark default). */
export function applyTheme(): void {
  const scheme = window.Telegram?.WebApp?.colorScheme;
  document.documentElement.dataset.theme = scheme === "light" ? "light" : "dark";
}
