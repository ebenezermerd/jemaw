/**
 * Top toast notifications. Mounted once by ToastProvider at the app root;
 * components fire toasts via useToast(), and non React code (the query
 * client's global error handler) via notifyToast(). Toasts stack under the
 * safe area, auto dismiss, and can be tapped away.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";

export type ToastTone = "error" | "success" | "info";

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

type ShowToast = (message: string, tone?: ToastTone) => void;

let externalListener: ShowToast | null = null;

/** Fire a toast from outside React (e.g. the query client error handler). */
export function notifyToast(message: string, tone: ToastTone = "info"): void {
  externalListener?.(message, tone);
}

const ToastCtx = createContext<{ show: ShowToast }>({ show: () => {} });

export function useToast() {
  return useContext(ToastCtx);
}

const TONE_COLOR: Record<ToastTone, string> = {
  error: "var(--danger)",
  success: "var(--positive)",
  info: "var(--accent)",
};

const AUTO_DISMISS_MS = 4000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const show = useCallback<ShowToast>((message, tone = "info") => {
    const id = Date.now() + Math.random();
    // Keep at most three on screen so a burst of errors stays readable.
    setToasts((current) => [...current.slice(-2), { id, message, tone }]);
    setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id));
    }, AUTO_DISMISS_MS);
  }, []);

  useEffect(() => {
    externalListener = show;
    return () => {
      externalListener = null;
    };
  }, [show]);

  return (
    <ToastCtx.Provider value={{ show }}>
      {children}
      <div
        aria-live="polite"
        style={{
          position: "fixed",
          top: "calc(env(safe-area-inset-top, 0px) + 12px)",
          left: 12,
          right: 12,
          zIndex: 1000,
          display: "grid",
          gap: 8,
          pointerEvents: "none",
        }}
      >
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              role={t.tone === "error" ? "alert" : "status"}
              initial={{ opacity: 0, y: -16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -16, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              onClick={() =>
                setToasts((current) => current.filter((x) => x.id !== t.id))
              }
              className="t-body"
              style={{
                pointerEvents: "auto",
                cursor: "pointer",
                background: "var(--surface-elevated)",
                border: "1px solid var(--border)",
                borderLeft: `3px solid ${TONE_COLOR[t.tone]}`,
                borderRadius: "var(--r-md)",
                padding: "10px 14px",
                color: "var(--text)",
                boxShadow: "0 10px 28px rgba(0, 0, 0, 0.24)",
              }}
            >
              {t.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}
