'use client'

/**
 * apps/web/src/components/shared/Modal.tsx
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: ONE pop-up primitive for every form/detail dialog in the app.
 *
 * WHY THIS EXISTS — the "pop-up is swallowed by the top/bottom nav" bug
 *   Roughly 35 dialogs were hand-rolled as `<div className="fixed inset-0 z-50 …">`
 *   rendered INLINE inside the page. Inline means they inherit every ancestor's
 *   stacking context, and `ModuleSurface` (which wraps nearly every module page)
 *   puts its content in a `relative z-10` div. A `z-50` overlay trapped inside
 *   a `z-10` context paints ABOVE the sidebar but BELOW the header (z-30, inside
 *   the shell's own z-10 column) and the mobile bottom nav (z-40) — so the top of
 *   the dialog slid under the header and, on phones, the footer/buttons slid under
 *   the bottom bar. Each dialog also picked its own max-height, padding, close
 *   button and footer, so they all looked different.
 *
 * WHAT IT DOES
 *   • Renders through a portal directly under <body>, so no ancestor can clip,
 *     transform or out-stack it. Sits at z-50 and is appended LAST in <body>,
 *     so it beats the equal-z bottom nav / sheets by DOM order (the shell's
 *     header is z-30 inside a z-10 context). Anything portaled AFTER it — a
 *     select/popover opened from inside the dialog, a nested Modal — stacks
 *     above it; ConfirmDialog (z-60/70) and toasts always sit on top.
 *   • Phones (< sm): bottom sheet — full width, rounded top, capped to the
 *     visible viewport (dvh, minus the status-bar safe area).
 *     sm and up: centred dialog, capped to the viewport minus 3rem.
 *   • Fixed header (title + close) and footer (actions); ONLY the body scrolls,
 *     so a long form never pushes its Save button off-screen. The footer honours
 *     the iOS home-indicator safe area.
 *   • Escape / backdrop click close it (both suppressed while `busy`), only the
 *     top-most modal reacts, body scroll is locked, siblings are made `inert`
 *     as a focus trap, and focus returns to the trigger on close.
 *
 * USAGE
 *   <Modal title="Edit Class" onClose={onClose} size="md" onSubmit={handleSubmit(save)}
 *          footer={<><button …>Cancel</button><button type="submit" …>Save</button></>}>
 *     …fields…
 *   </Modal>
 *   Pass `onSubmit` for forms: body + footer are wrapped in ONE <form> so the
 *   footer's submit button works while staying pinned outside the scroll area.
 *   Modals are mounted only while visible (`{show && <Modal …/>}`) — there is no
 *   `open` prop.
 */

import {
  useEffect,
  useId,
  useRef,
  type FormEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useMotionEnabled } from '@/store/motionStore'

// ─────────────────────────────────────────────────────────────────────────────
// SHARED BUTTON STYLES — so every dialog's actions look the same.
// ─────────────────────────────────────────────────────────────────────────────

const BTN_BASE =
  'inline-flex items-center justify-center gap-2 min-h-11 px-5 rounded-xl text-sm font-heading font-semibold ' +
  'transition-colors disabled:opacity-60 disabled:pointer-events-none'

/** Filled teal — the dialog's main action (Save / Create / Allocate). */
export const MODAL_BTN_PRIMARY = `${BTN_BASE} bg-brand-teal text-white hover:bg-brand-teal-light`
/** Outlined — Cancel / Close. */
export const MODAL_BTN_SECONDARY = `${BTN_BASE} border border-base text-muted hover:bg-page hover:text-body`
/** Filled coral — destructive confirmations. */
export const MODAL_BTN_DANGER = `${BTN_BASE} bg-brand-coral text-white hover:bg-brand-coral/90`

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'screen'

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-2xl',
  '2xl': 'sm:max-w-4xl',
  screen: '',
}

export interface ModalProps {
  /** Heading shown in the fixed header. Omit (with `bare`) for a fully custom layout. */
  title?: ReactNode
  /** Small helper text under the title. */
  description?: ReactNode
  onClose: () => void
  /** Max width from `sm` up. Phones are always full-width. Default 'md'. */
  size?: ModalSize
  /** Pinned action row. Buttons stack (primary on top) on phones, sit right-aligned on sm+. */
  footer?: ReactNode
  /** When set, body + footer are wrapped in a <form> with this handler. */
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void
  /** An action is in flight: Escape, backdrop click and the X button are ignored. */
  busy?: boolean
  /** Click on the dimmed backdrop closes the modal. Default true. */
  closeOnBackdrop?: boolean
  /** Extra classes for the scrolling body (e.g. `space-y-4`). */
  bodyClassName?: string
  /** Drop the body's default padding — for edge-to-edge content such as tables. */
  flush?: boolean
  /** Skip the header/body/footer chrome and render `children` straight into the panel. */
  bare?: boolean
  /** Extra classes on the panel itself (use with `bare`). */
  panelClassName?: string
  /** Accessible name when there is no visible `title`. */
  ariaLabel?: string
  children: ReactNode
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE-LEVEL STATE — modal stack + ref-counted scroll lock
// ─────────────────────────────────────────────────────────────────────────────

const modalStack: symbol[] = []
let scrollLocks = 0
let savedBodyOverflow = ''

function lockScroll(): void {
  if (scrollLocks === 0) {
    savedBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  scrollLocks += 1
}

function unlockScroll(): void {
  scrollLocks = Math.max(0, scrollLocks - 1)
  if (scrollLocks === 0) document.body.style.overflow = savedBodyOverflow
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export function Modal({
  title,
  description,
  onClose,
  size = 'md',
  footer,
  onSubmit,
  busy = false,
  closeOnBackdrop = true,
  bodyClassName = '',
  flush = false,
  bare = false,
  panelClassName = '',
  ariaLabel,
  children,
}: ModalProps) {
  const motionEnabled = useMotionEnabled()
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descId = useId()

  // Keep the latest callbacks in refs so the effects below run exactly once per
  // mount — callers routinely pass inline arrow functions, which would
  // otherwise re-run the focus-trap effect (and steal focus) on every render.
  const onCloseRef = useRef(onClose)
  const busyRef = useRef(busy)
  useEffect(() => {
    onCloseRef.current = onClose
    busyRef.current = busy
  })

  // ── Stack, scroll lock, Escape ─────────────────────────────────────────────
  useEffect(() => {
    const token = Symbol('modal')
    modalStack.push(token)
    lockScroll()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      // Only the top-most modal reacts; a picker inside the modal may call
      // preventDefault() on Escape to close itself first.
      if (modalStack[modalStack.length - 1] !== token) return
      if (busyRef.current) return
      e.preventDefault()
      onCloseRef.current()
    }
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      const i = modalStack.indexOf(token)
      if (i !== -1) modalStack.splice(i, 1)
      unlockScroll()
    }
  }, [])

  // ── Focus trap (inert siblings) + focus restore ────────────────────────────
  useEffect(() => {
    const panelEl = panelRef.current
    if (!panelEl) return

    // Everything else directly under <body> becomes inert, except this
    // modal's own portal root and anything already inert (so a ConfirmDialog
    // opened on top, or a second modal, nests correctly).
    const affected: HTMLElement[] = []
    for (const child of Array.from(document.body.children)) {
      if (!(child instanceof HTMLElement)) continue
      if (child === panelEl || child.contains(panelEl)) continue
      if (child.inert) continue
      child.inert = true
      affected.push(child)
    }

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null

    // Respect an `autoFocus` field if one already took focus; otherwise focus
    // the panel itself (NOT the first input — that would pop the on-screen
    // keyboard on phones the moment a dialog opens).
    if (!panelEl.contains(document.activeElement)) panelEl.focus({ preventScroll: true })

    return () => {
      affected.forEach((el) => {
        el.inert = false
      })
      previouslyFocused?.focus?.({ preventScroll: true })
    }
  }, [])

  if (typeof document === 'undefined') return null

  const isScreen = size === 'screen'
  const hasHeader = !bare && (title != null || description != null)

  function requestClose() {
    if (!busy) onClose()
  }

  const chrome = bare ? (
    children
  ) : (
    <>
      {/* Mobile grab-handle — purely decorative cue that this is a sheet. */}
      {!isScreen && (
        <div className="sm:hidden flex justify-center pt-2 shrink-0" aria-hidden>
          <span className="h-1 w-10 rounded-full bg-base" />
        </div>
      )}

      {hasHeader && (
        <div className="flex items-start justify-between gap-3 px-5 sm:px-6 pt-3 sm:pt-5 pb-3 border-b border-base shrink-0">
          <div className="min-w-0">
            {title != null && (
              <h2 id={titleId} className="font-heading font-bold text-lg text-brand-navy leading-snug break-words">
                {title}
              </h2>
            )}
            {description != null && (
              <p id={descId} className="text-sm text-muted mt-0.5">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={requestClose}
            disabled={busy}
            aria-label="Close dialog"
            className="-mr-2 -mt-1 min-h-11 min-w-11 shrink-0 flex items-center justify-center rounded-xl text-muted hover:bg-page hover:text-body transition-colors disabled:opacity-40"
          >
            <X className="w-5 h-5" aria-hidden />
          </button>
        </div>
      )}

      <div
        className={`app-modal-body min-h-0 flex-1 overflow-y-auto overscroll-contain ${flush ? '' : 'px-5 sm:px-6 py-4'} ${bodyClassName}`}
      >
        {children}
      </div>

      {footer != null && (
        <div className="app-modal-footer shrink-0 border-t border-base bg-surface px-5 sm:px-6 pt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:items-center">
          {footer}
        </div>
      )}
    </>
  )

  const content =
    onSubmit && !bare ? (
      <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
        {chrome}
      </form>
    ) : (
      chrome
    )

  return createPortal(
    <div className="app-modal-root fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6">
      {/* Backdrop */}
      <motion.div
        initial={motionEnabled ? { opacity: 0 } : false}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.18 }}
        className="app-modal-backdrop absolute inset-0 bg-brand-navy/50 backdrop-blur-sm"
        onClick={closeOnBackdrop ? requestClose : undefined}
        aria-hidden
      />

      {/* Panel */}
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title != null && !bare ? titleId : undefined}
        aria-describedby={description != null && !bare ? descId : undefined}
        aria-label={title == null || bare ? ariaLabel : undefined}
        tabIndex={-1}
        initial={motionEnabled ? { opacity: 0, y: 24 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className={[
          'app-modal-panel relative flex w-full flex-col bg-surface shadow-2xl overflow-hidden outline-none',
          isScreen ? 'app-modal-panel--screen' : 'rounded-t-3xl sm:rounded-3xl',
          SIZE_CLASS[size],
          panelClassName,
        ].join(' ')}
      >
        {content}
      </motion.div>
    </div>,
    document.body,
  )
}

export default Modal
