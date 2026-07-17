'use client'

/*
 * apps/web/src/components/library/DigitalResourceViewer.tsx — Phase D11
 *
 * [CHANGE TYPE]: TARGETED EDIT
 * [R-PHASE]: R12 — Library Domain & the Storage API Contract Fix
 * [PURPOSE]: This component had zero real importers and its own fetch
 *   logic never compiled — it imported a nonexistent `apiClient` export
 *   from api-client.ts (the real singleton is `apiFetch`) and called the
 *   view endpoint with POST and an expected `{ viewUrl, expiresAt }`
 *   response shape that neither matches the real route (GET
 *   /library/digital/:id/view, which returns `{ url }`) nor the
 *   now-fixed libraryService.ts's getDigitalResourceViewUrl() (a signed
 *   proxy URL good for 1 hour, not 15 minutes). Repointed onto the
 *   existing, correctly-built useDigitalResourceView() hook
 *   (useLibrary.ts) instead of hand-rolling a duplicate fetch — this also
 *   means the component now shares the same 401-refresh-retry apiFetch
 *   behavior every other correctly-written data fetch in this codebase
 *   gets for free. A real entry point from the Library page's digital
 *   resources list now renders this component (library/page.tsx, same
 *   phase) — its first real caller.
 *
 * View-only PDF/eBook viewer enforcing no-download policy.
 *
 * Enforcement layers:
 *   1. Server only returns a short-lived (1 hour) signed proxy URL — no
 *      permanent link is ever exposed (see W/lib/storage.ts's
 *      getSignedViewUrl(), which itself proxies through
 *      W/app/api/files/[fileId]/route.ts rather than a raw Appwrite URL).
 *   2. The URL is loaded in an <iframe> with sandbox="allow-scripts allow-same-origin"
 *      — this disables form submission and top navigation (preventing save-as tricks).
 *   3. CSS `pointer-events: none` on the iframe overlay prevents right-click
 *      context menus on the rendered PDF in most browsers.
 *   4. The iframe has no `download` attribute and shows no toolbar via the
 *      `#toolbar=0` PDF.js fragment query.
 *   5. The component disables the browser native right-click context menu
 *      on the container via onContextMenu.
 *
 * Note: A determined user can always inspect network traffic and download
 * the file directly. These layers prevent casual/accidental downloading by
 * students as required by the system spec — they are not DRM.
 *
 * Props:
 *   resourceId  string    — fetches the signed view URL via useDigitalResourceView() on open
 *   title       string    — displayed in the viewer header
 *   onClose     () => void
 */

import { useState, useEffect, useCallback } from 'react'
import { Loader2, X, AlertTriangle, Eye }   from 'lucide-react'
import { motion, AnimatePresence }           from 'framer-motion'
import { useMotionEnabled }                  from '@/store/motionStore'
import { reducedMotionVariants, reducedMotionTransition, SPRING } from '@/lib/motion'
import { useDigitalResourceView }            from '@/hooks/useLibrary'
import { VIEW_URL_TTL_SECS } from '@shared/constants/storage'

// ─────────────────────────────────────────────────────────────────────────────
// COUNTDOWN REFRESH (re-fetches URL before expiry)
// ─────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// DIGITAL RESOURCE VIEWER
// ─────────────────────────────────────────────────────────────────────────────

interface DigitalResourceViewerProps {
  resourceId: string
  title:      string
  onClose:    () => void
}

export function DigitalResourceViewer({
  resourceId,
  title,
  onClose,
}: DigitalResourceViewerProps) {
  const motionEnabled = useMotionEnabled()
  const viewResource   = useDigitalResourceView()

  const [viewUrl,    setViewUrl]    = useState<string | null>(null)
  const [error,      setError]      = useState<string | null>(null)
  const [visible,    setVisible]    = useState(true)

  // Fetch a signed view URL from the server
  const fetchUrl = useCallback(() => {
    setError(null)
    viewResource.mutate(resourceId, {
      onSuccess: (session) => setViewUrl(session.url),
      onError:   (e) => setError(e instanceof Error ? e.message : 'Unable to load resource'),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceId])

  // Initial load
  useEffect(() => { fetchUrl() }, [fetchUrl])

  // Auto-refresh URL 60 seconds before expiry
  useEffect(() => {
    if (!viewUrl) return
    const refreshMs = (VIEW_URL_TTL_SECS - 60) * 1000
    const t = setTimeout(fetchUrl, refreshMs)
    return () => clearTimeout(t)
  }, [viewUrl, fetchUrl])

  const loading = viewResource.isPending

  // Block right-click context menu on the entire viewer
  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault()
  }

  function handleClose() {
    setVisible(false)
  }

  const backdropVariants = reducedMotionVariants(motionEnabled, {
    hidden:  { opacity: 0 },
    visible: { opacity: 1 },
    exit:    { opacity: 0 },
  })
  const panelVariants = reducedMotionVariants(motionEnabled, {
    hidden:  { opacity: 0, scale: 0.96, y: 12 },
    visible: { opacity: 1, scale: 1,    y: 0  },
    exit:    { opacity: 0, scale: 0.96, y: 12 },
  })
  const panelTransition = reducedMotionTransition(motionEnabled, SPRING.snappy)

  return (
    <AnimatePresence onExitComplete={onClose}>
      {visible && (
        <motion.div
          key="digital-viewer-backdrop"
          variants={backdropVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          transition={reducedMotionTransition(motionEnabled, { duration: 0.18 })}
          className="fixed inset-0 z-50 flex flex-col bg-black/80 backdrop-blur-sm"
          onContextMenu={handleContextMenu}
        >
          {/* Header bar */}
          <div className="flex items-center justify-between px-5 py-3 bg-brand-navy/90 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <Eye className="w-4 h-4 text-brand-teal shrink-0" aria-hidden />
              <span className="font-heading font-semibold text-sm text-white truncate">
                {title}
              </span>
              <span className="shrink-0 text-[10px] bg-brand-teal/20 text-brand-teal border border-brand-teal/30 px-2 py-0.5 rounded-full font-heading font-semibold uppercase tracking-wide">
                View Only
              </span>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Close viewer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Viewer body */}
          <motion.div
            key="digital-viewer-panel"
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={panelTransition}
            className="flex-1 flex items-center justify-center overflow-hidden relative"
            onContextMenu={handleContextMenu}
          >
            {loading && (
              <div className="flex flex-col items-center gap-3 text-white">
                <Loader2 className="w-8 h-8 animate-spin text-brand-teal" />
                <p className="text-sm text-white/70">Loading resource…</p>
              </div>
            )}

            {error && (
              <div className="flex flex-col items-center gap-3 max-w-sm text-center">
                <AlertTriangle className="w-8 h-8 text-brand-coral" />
                <p className="text-white font-heading font-semibold">Unable to load resource</p>
                <p className="text-sm text-white/60">{error}</p>
                <button
                  type="button"
                  onClick={fetchUrl}
                  className="mt-2 px-5 py-2.5 rounded-xl bg-brand-teal text-white text-sm font-heading font-semibold hover:bg-brand-teal/90 transition-colors min-h-[44px]"
                >
                  Try again
                </button>
              </div>
            )}

            {viewUrl && !loading && (
              <>
                {/*
                  Transparent overlay div on top of the iframe to intercept
                  right-click before the browser's PDF context menu appears.
                  pointer-events: none is applied to the iframe itself so the
                  overlay receives all mouse events.
                */}
                <div
                  className="absolute inset-0 z-10"
                  onContextMenu={handleContextMenu}
                  style={{ cursor: 'default' }}
                  aria-hidden
                />
                <iframe
                  key={viewUrl}
                  src={`${viewUrl}#toolbar=0&navpanes=0&scrollbar=1`}
                  title={title}
                  className="w-full h-full border-0"
                  sandbox="allow-scripts allow-same-origin"
                  style={{ pointerEvents: 'none' }}
                  aria-label={`View-only viewer for ${title}`}
                />
              </>
            )}
          </motion.div>

          {/* Footer notice */}
          <div className="shrink-0 px-5 py-2 bg-brand-navy/80 text-center">
            <p className="text-[11px] text-white/40">
              This resource is for viewing only. Downloading or reproducing this content is not permitted.
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}