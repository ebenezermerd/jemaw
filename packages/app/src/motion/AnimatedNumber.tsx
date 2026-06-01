/**
 * Per-digit slot-machine number (JEMAW_PLAN.md §12.9 "number change"). Each
 * glyph slot animates independently; only changed digits slide vertically.
 * Tabular figures keep columns aligned. Reduced motion → instant swap.
 */
import { AnimatePresence, motion } from "framer-motion";
import { useReducedMotion } from "./useReducedMotion.js";
import { duration, ease } from "./tokens.js";

export function AnimatedNumber({
  value,
  prefix = "",
  color,
}: {
  /** the formatted string to display, e.g. "€12.50" or "+€48.50" */
  value: string;
  prefix?: string;
  color?: string;
}) {
  const reduced = useReducedMotion();
  const glyphs = (prefix + value).split("");

  return (
    <span
      className="tnum"
      style={{
        display: "inline-flex",
        color: color ?? "inherit",
        fontVariantNumeric: "tabular-nums",
      }}
      aria-label={prefix + value}
    >
      {glyphs.map((g, i) => (
        <span
          key={i}
          style={{
            position: "relative",
            display: "inline-block",
            overflow: "hidden",
            height: "1.1em",
            lineHeight: "1.1em",
          }}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={g + "-" + i}
              initial={reduced ? false : { y: "-0.9em", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={reduced ? { opacity: 0 } : { y: "0.9em", opacity: 0 }}
              transition={
                reduced
                  ? { duration: 0.08 }
                  : { duration: duration.base, ease: ease.standard }
              }
              style={{ display: "inline-block" }}
            >
              {g}
            </motion.span>
          </AnimatePresence>
        </span>
      ))}
    </span>
  );
}
