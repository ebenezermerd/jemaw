/**
 * Reads Telegram Mini App initData. Stub-safe: when run outside Telegram
 * (e.g. local browser dev), returns an empty string instead of throwing.
 * HMAC verification happens server-side.
 */
interface TelegramUser {
  id?: number;
  photo_url?: string;
}

interface TelegramWebApp {
  initData: string;
  initDataUnsafe?: { start_param?: string; user?: TelegramUser };
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

/** The current viewer's Telegram user id (as string), if available. */
export function currentTelegramId(): string | null {
  const id = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
  return id != null ? String(id) : null;
}

/** The current viewer's Telegram photo URL, if Telegram provided one. */
export function currentPhotoUrl(): string | undefined {
  return window.Telegram?.WebApp?.initDataUnsafe?.user?.photo_url;
}
