/**
 * apps/web/src/lib/hills/moreSheet.ts
 *
 * [CHANGE TYPE]: NEW FILE (Chikangawa Hills theme, Phase 8d follow-up)
 * [PURPOSE]: One shared "is the phone More sheet open" flag, so the avatar in the
 *   phone header and the "More" slot in the bottom bar open and close the SAME
 *   sheet (RULEBOOK R5.4; owner decision 15 Nov 2026).
 *
 *   OWNER-DELEGATED LOGIC CHANGE: before this, the open flag lived inside
 *   MobileBottomNav's own state. It is now read through React's
 *   useSyncExternalStore from this module. Everything the sheet does (what it
 *   lists, where links go, sign out, report a problem, closing on a link press)
 *   is unchanged.
 *
 * Apart from React so the plain node test runner can check it
 * (tools/hills/__tests__/moreSheet.test.mts).
 */

type Listener = () => void

let open = false
const listeners = new Set<Listener>()

/** Current state (the snapshot React reads). */
export function getMoreSheetOpen(): boolean {
  return open
}

/** Opens or closes the sheet. Listeners run only when the value actually changes. */
export function setMoreSheetOpen(next: boolean): void {
  if (open === next) return
  open = next
  listeners.forEach((l) => l())
}

/** Subscribe for useSyncExternalStore; returns the unsubscribe function. */
export function subscribeMoreSheet(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
