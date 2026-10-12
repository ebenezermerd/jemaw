import { useEffect, useState } from "react";

/** Live match for a media query; false where matchMedia is missing (tests, SSR). */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia(query).matches;
  });
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/** Tablet and below: side-by-side panels stack into one column. */
export function useIsNarrow(): boolean {
  return useMediaQuery("(max-width: 1000px)");
}

/** Phone: tighter padding, drawer sidebar, full-width controls. */
export function useIsPhone(): boolean {
  return useMediaQuery("(max-width: 640px)");
}

/** Below this the sidebar becomes an overlay drawer. */
export function useIsCompactShell(): boolean {
  return useMediaQuery("(max-width: 900px)");
}

/** Column template that stacks when the viewport is narrow. */
export function cols(wide: string, narrow: boolean, stacked = "1fr"): string {
  return narrow ? stacked : wide;
}

/** Cards that reflow by available width instead of a fixed count. */
export function autoFit(min: number): string {
  return `repeat(auto-fit, minmax(${min}px, 1fr))`;
}

/** The four-across stat strips: two across on a tablet, one on a phone. */
export function statGrid(narrow: boolean, phone: boolean): string {
  return phone ? "1fr" : narrow ? "repeat(2, 1fr)" : "repeat(4, 1fr)";
}
