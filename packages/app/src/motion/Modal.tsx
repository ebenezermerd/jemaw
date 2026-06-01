/**
 * Centered modal (JEMAW_PLAN.md §12.10): scale-from-0.96 + fade on enter.
 * Used for destructive confirmations. Reduced motion → fade only.
 */
import { motion, AnimatePresence } from "framer-motion";
import type { ReactNode } from "react";
import { useReducedMotion } from "./useReducedMotion.js";
import { duration, ease } from "./tokens.js";

export function Modal({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: duration.fast }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "grid",
            placeItems: "center",
            padding: 24,
            zIndex: 50,
          }}
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={reduced ? { opacity: 0 } : { scale: 0.96, opacity: 0 }}
            animate={reduced ? { opacity: 1 } : { scale: 1, opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { scale: 0.96, opacity: 0 }}
            transition={{ duration: duration.fast, ease: ease.standard }}
            style={{
              maxWidth: 360,
              width: "100%",
              background: "var(--surface)",
              borderRadius: "var(--r-lg)",
              padding: 24,
            }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
