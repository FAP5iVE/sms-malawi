/**
 * apps/web/src/lib/hills/unsaved.ts
 *
 * [CHANGE TYPE]: NEW FILE (Chikangawa Hills theme, Phase 8b-0 follow-up)
 * [PURPOSE]: The rule behind the "unsaved changes" warning on form dialogs
 *   (RULEBOOK R8.4), apart from React so the plain node test runner can check it
 *   (tools/hills/__tests__/unsaved.test.mts).
 *
 *   OWNER-APPROVED LOGIC EXCEPTION (15 Nov 2026): a Hills form dialog that has
 *   been typed in no longer closes silently on an outside click, the X button or
 *   Escape. It asks first: "Keep editing" or "Discard changes".
 *
 *   What does NOT change: a dialog nobody typed in closes at once as before; the
 *   footer's own Cancel button, Save/submit and every caller callback behave as
 *   they did; the old dialog sizes (sm to 2xl, screen) never ask.
 */

/** The three Hills sizes are the only ones that opt in. */
export function isGuardedDialog(size: string, hasSubmit: boolean, bare: boolean): boolean {
  return (size === 's' || size === 'm' || size === 'l') && hasSubmit && !bare
}

export type CloseDecision = 'ignore' | 'close' | 'ask' | 'keep-editing'

/**
 * What a close request (X, backdrop, Escape) should do.
 *   busy              an action is in flight: ignore, as today
 *   asking already    the question is on screen: a second request means "keep editing"
 *   guarded + dirty   ask first
 *   anything else     close at once, as today
 */
export function decideClose(state: {
  busy: boolean
  guarded: boolean
  dirty: boolean
  asking: boolean
}): CloseDecision {
  if (state.busy) return 'ignore'
  if (state.asking) return 'keep-editing'
  if (state.guarded && state.dirty) return 'ask'
  return 'close'
}

/** Only events a person causes mark the form dirty (typing, picking, ticking). */
export function isUserEdit(event: { isTrusted?: boolean }): boolean {
  return event.isTrusted !== false
}

/** Wording (R4.3: the headline is the consequence, the buttons repeat the choice). */
export const UNSAVED_TITLE = 'Discard your changes?'
export const UNSAVED_BODY = 'What you typed here has not been saved and will be lost.'
export const UNSAVED_KEEP = 'Keep editing'
export const UNSAVED_DISCARD = 'Discard changes'
