/**
 * Motion tokens (JEMAW_PLAN.md §12.7) as Framer Motion configs. Springs and
 * durations match the design system. `collapsed` versions are used under
 * prefers-reduced-motion (§12.8 #5): no spring, ≤80ms.
 */
import type { Transition } from "framer-motion";

export const spring = {
  soft: { type: "spring", stiffness: 280, damping: 30, mass: 1 },
  snap: { type: "spring", stiffness: 420, damping: 32, mass: 0.8 },
  bouncy: { type: "spring", stiffness: 380, damping: 18, mass: 0.9 },
} satisfies Record<string, Transition>;

export const duration = {
  instant: 0.1,
  fast: 0.18,
  base: 0.24,
  slow: 0.36,
  slower: 0.5,
} as const;

export const ease = {
  standard: [0.32, 0.72, 0, 1],
  emphasized: [0.34, 1.56, 0.64, 1],
  exit: [0.4, 0, 1, 1],
} as const;

/** A motion-free transition for reduced-motion users (functional, ≤80ms). */
export const collapsed: Transition = { duration: 0.08 };

/** Pick a transition based on the reduced-motion preference. */
export function pick(t: Transition, reduced: boolean): Transition {
  return reduced ? collapsed : t;
}
