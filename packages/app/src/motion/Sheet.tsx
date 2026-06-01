/**
 * Bottom sheet (JEMAW_PLAN.md §12.10): slide up + backdrop fade on enter,
 * reverse on exit, drag-to-dismiss with rubber-band past 30% of height.
 * Reduced motion → fade only, no spring.
 */
import { motion, AnimatePresence, type PanInfo } from "framer-motion";
import type { ReactNode } from "react";
import { useReducedMotion } from "./useReducedMotion.js";
import { spring, duration } from "./tokens.js";

export function Sheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();

  function onDragEnd(_e: unknown, info: PanInfo) {
    if (info.offset.y > 120 || info.velocity.y > 500) onClose();
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: duration.base }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            zIndex: 50,
          }}
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={reduced ? { opacity: 0 } : { y: "100%" }}
            animate={reduced ? { opacity: 1 } : { y: 0 }}
            exit={reduced ? { opacity: 0 } : { y: "100%" }}
            transition={reduced ? { duration: 0.08 } : spring.soft}
            drag={reduced ? false : "y"}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={onDragEnd}
            style={{
              width: "100%",
              maxWidth: 560,
              background: "var(--surface)",
              borderTopLeftRadius: "var(--r-xl)",
              borderTopRightRadius: "var(--r-xl)",
              padding: 24,
              paddingBottom: "calc(24px + env(safe-area-inset-bottom))",
              boxShadow: "var(--shadow-sheet)",
            }}
          >
            <div
              style={{
                width: 36,
                height: 4,
                borderRadius: "var(--r-full)",
                background: "var(--border-strong)",
                margin: "0 auto 16px",
              }}
            />
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
