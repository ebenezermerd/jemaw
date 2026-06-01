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
  requestFullscreen?: () => void;
  disableVerticalSwipes?: () => void;
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

/** Take the full screen height in Telegram (expand + fullscreen where supported). */
export function goFullscreen(): void {
  const wa = window.Telegram?.WebApp;
  if (!wa) return;
  wa.ready();
  wa.expand?.();
  try {
    wa.requestFullscreen?.();
    wa.disableVerticalSwipes?.();
  } catch {
    // older clients lack these — expand() already covers the common case
  }
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
