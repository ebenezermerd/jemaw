# Jemaw — Phase 4: Motion & Finish (Design Spec)

**Date:** 2026-06-01
**Builds on:** Phases 1–3 (full app, deployed).
**Source of truth:** `JEMAW_PLAN.md` §12 (motion tokens, principles, signature
micro-interactions), §12.1 (microcopy).

---

## 1. Goal & Done-Criteria

Animation that clarifies, never decorates (plan §12.8). Done when:

1. **Framer Motion** added; motion tokens from §12.7 expressed as shared spring
   configs + variants.
2. **Shared `layoutId`** transition: suggestion/expense card ↔ detail expand
   from where tapped and collapse back (§12.8 #2).
3. **Animated numbers**: balances + settle amounts change per-digit
   (slot-machine), tabular figures, `--dur-base` (§12.9 number change).
4. **Spring tap feedback** on buttons/cards (`--spring-snap`); confirm burst on
   suggestion add (`--spring-bouncy`).
5. **Sheet/modal** enter-exit via Motion (slide-up + backdrop fade; reverse on
   exit) replacing the hand-rolled CSS keyframes (§12.10).
6. **Skeleton loaders** matching final silhouettes with a sweeping gradient
   (§12.9 loading) — no spinners anywhere.
7. **Settle-up celebration**: on reaching all-even, accent pulse across rows +
   staggered char fade-in of "Everyone's even." (§12.9).
8. **Suggestion dismiss**: swipe-to-dismiss with rotation + threshold commit
   (§12.9), falling back to the Dismiss button.
9. **Reduced motion** (`prefers-reduced-motion`) collapses durations to ≤80ms
   and disables springs everywhere (§12.8 #5).
10. **Copy pass**: microcopy matches the §12.1 voice (calm, dry; "Added.",
    "Everyone's even.", "Nothing to track yet.").
11. `pnpm typecheck` + `pnpm test` green (incl. a reduced-motion unit test);
    app builds; motion-wrapped components still mount.

**Not changing:** API, data model, business logic. Phase 4 is presentation only.

---

## 2. Architecture

Add `framer-motion` to `@jemaw/app`. Centralize motion config so screens import
shared variants rather than hand-tuning each:

```
src/motion/
  tokens.ts        # spring configs (soft/snap/bouncy), durations, eases (§12.7)
  useReducedMotion.ts  # wraps Framer's hook + our token collapse
  AnimatedNumber.tsx   # per-digit slot-machine number (tabular)
  Sheet.tsx        # Motion bottom sheet (enter/exit/drag-dismiss) — reusable
  Modal.tsx        # Motion centered modal (scale+fade)
  variants.ts      # shared enter/exit/list-stagger variants
```

Screens consume these. `MotionConfig` at the app root applies reduced-motion
globally so every animation respects it without per-component checks.

---

## 3. Specific implementations

**AnimatedNumber** (§12.9): split the formatted string into glyphs; each digit
slot is its own element; on value change, only differing digits slide vertically
(old up/out, new up/in) over `--dur-base`. Tabular figures. Used in Balances,
Settle, expense amounts. Reduced motion → instant swap.

**Shared layoutId** (§12.8 #2): suggestion card and the Add/Edit screen share
`layoutId="suggestion-{id}"`; expense history row and ExpenseDetail share
`layoutId="expense-{id}"`. `AnimatePresence` + `motion.div layout` drive the
expand/collapse. Falls back to a plain route change under reduced motion.

**Sheet/Modal**: replace the inline keyframe blocks in Settle (confirm sheet)
and ExpenseDetail (void modal) with the reusable Motion components. Drag-to-
dismiss with rubber-band past 30% (§12.10 bottom sheet).

**Skeletons**: extract the existing Balances shimmer into a shared `Skeleton`
that matches card/list silhouettes; use on Suggestions (during scan), Balances,
History, Settle while loading.

**Settle celebration** (§12.9): when balances reach all-zero after a mark-paid,
pulse `--accent` across rows once, then stagger-fade the "Everyone's even." copy
per character (the one place text animates).

**Suggestion swipe-dismiss** (§12.9): card follows finger with ≤6° rotation;
past 40% width or 800px/s → commit exit left over 220ms; else spring back. The
existing Dismiss button remains for non-touch.

---

## 4. Reduced motion (§12.8 #5)

- App root: `<MotionConfig reducedMotion="user">` so Framer respects the OS
  setting; our `useReducedMotion` also collapses token durations.
- The CSS `@media (prefers-reduced-motion: reduce)` block already in tokens.css
  stays as the belt-and-suspenders for non-Framer transitions.
- Unit test: with reduced motion on, spring configs resolve to instant/no-spring
  (assert the helper returns the collapsed values).

---

## 5. Testing & verification

- **Unit**: `useReducedMotion`/token collapse returns ≤80ms + springless when
  reduced; `AnimatedNumber` renders the correct digits for a value (DOM text).
- **Smoke**: each motion-wrapped screen still mounts (existing App test pattern
  extended to Suggestions/Settle render without throwing).
- **Build**: `pnpm --filter @jemaw/app build` succeeds; bundle size noted (Framer
  adds ~30–40kb gzip — acceptable per plan which names Framer the choice).
- **Manual (user)**: eyeball the deployed app on a device — animations are
  visual; I will not claim they "look right" without your confirmation.

---

## 6. Risks

| Risk | Mitigation |
|---|---|
| Bundle bloat | Framer is the plan's chosen lib; import only used APIs; lazy nothing-heavy. |
| Motion fights Telegram WebView | Test on device; reduced-motion fallback is functional-complete. |
| layoutId jank on route change | Keep transitions short (`--dur-base`); fall back to plain nav under reduced motion. |
| "Tests pass" ≠ looks right | Explicit: user eyeballs deployed app; tests only guard mount + reduced-motion. |

---

## 7. Build order

1. `framer-motion` dep; `motion/tokens.ts` + `useReducedMotion` + test.
2. `AnimatedNumber` + test; wire into Balances, Settle, amounts.
3. Reusable `Sheet`/`Modal`; swap into Settle + ExpenseDetail.
4. Shared `layoutId` card↔detail (suggestions, expenses).
5. `Skeleton` shared; apply across loading states.
6. Settle celebration; suggestion swipe-dismiss.
7. `MotionConfig reducedMotion="user"` at root; copy pass (§12.1).
8. Typecheck + test + build. Deploy (Mini App only — bot unchanged).
