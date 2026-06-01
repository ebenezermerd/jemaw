/**
 * Settle-up celebration (JEMAW_PLAN.md §12.9): the empty-state copy fades in
 * with a per-character stagger — the only place in the app where text animates.
 */
import { motion } from "framer-motion";
import { useReducedMotion } from "./useReducedMotion.js";

export function Celebration({ text }: { text: string }) {
  const reduced = useReducedMotion();
  const chars = text.split("");

  if (reduced) {
    return (
      <div
        className="t-title"
        style={{ color: "var(--accent)", textAlign: "center" }}
      >
        {text}
      </div>
    );
  }

  return (
    <motion.div
      className="t-title"
      style={{ color: "var(--accent)", textAlign: "center" }}
      aria-label={text}
    >
      {chars.map((c, i) => (
        <motion.span
          key={i}
          aria-hidden
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.04, duration: 0.24 }}
          style={{ display: "inline-block", whiteSpace: "pre" }}
        >
          {c}
        </motion.span>
      ))}
    </motion.div>
  );
}
