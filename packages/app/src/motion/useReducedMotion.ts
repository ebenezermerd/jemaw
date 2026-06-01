/**
 * Reduced-motion hook. Wraps Framer's reduced-motion detection so screens get
 * a simple boolean, and exposes the collapsed-transition helper.
 */
import { useReducedMotion as useFramerReducedMotion } from "framer-motion";
import { pick } from "./tokens.js";
import type { Transition } from "framer-motion";

export function useReducedMotion(): boolean {
  return useFramerReducedMotion() ?? false;
}

/** Returns a function that collapses any transition when reduced motion is on. */
export function useTransition(): (t: Transition) => Transition {
  const reduced = useReducedMotion();
  return (t) => pick(t, reduced);
}
