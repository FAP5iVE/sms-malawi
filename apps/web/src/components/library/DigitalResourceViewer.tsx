'use client'

/**
 * DigitalResourceViewer
 *
 * FIXED: the previous implementation embedded the protected PDF directly in
 * a sandboxed iframe. Chromium/Android can fall back to its external PDF
 * handler in that situation, which produced the "PDF / Open" screen shown in
 * production. The iframe was also behind a pointer-events:none overlay, so
 * scrolling/interacting with the browser PDF viewer was disabled.
 *
 * The viewer now:
 *   - fetches the protected bytes with the Firebase Bearer token;
 *   - renders PDFs with PDF.js on a canvas (no browser PDF plugin required);
 *   - works consistently on desktop and mobile browsers;
 *   - supports page navigation, zoom, and fit-to-width;
 *   - never exposes a permanent Appwrite URL;
 *   - keeps the existing server-side authorization boundary.
 *
 * This is still view-only UI, not DRM. A user with sufficient technical
 * access can still obtain content from their browser's network/memory.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, ChevronLeft, ChevronRight, Eye, Loader2, Minus, Plus, RotateCw, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { getAuth } from 'firebase/auth'
import { useMotionEnabled } from '@/store/motionStore'
import { reducedMotionTransition, reducedMotionVariants, SPRING } from '@/lib/motion'
import { useDigitalResourceView } from '@/hooks/useLibrary'

interface DigitalResourceViewerProps {
  resourceId: string
  title: string
  onClose: () => void
}

interface PdfPageLike {
  getViewport: (params: { scale: number }) => { width: number; height: number }
  render: (params: {
    canvasContext: CanvasRenderingContext2D
    viewport: { width: number; height: number }
    intent?: 'display'
  }) => { promise: Promise<void> }
}

interface PdfDocumentLike {
  numPages: number
  getPage: (pageNumber: number) => Promise<PdfPageLike>
  destroy: () => Promise<void>
}

function friendlyPdfError(error: unknown): string {
  if (error instanceof Error) {
    if (/password/i.test(error.message)) return 'This PDF is password-protected and cannot be displayed here.'
    if (/Invalid PDF|Missing PDF|PDF header/i.test(error.message)) {
      return 'The uploaded file is not a valid PDF.'
    }
    return error.message
  }
  return 'The PDF could not be displayed.'
}

export function DigitalResourceViewer({
  resourceId,
  title,
  onClose,
}: DigitalResourceViewerProps) {
  const motionEnabled = useMotionEnabled()
  const { mutate: getViewUrl } = useDigitalResourceView()

  const [viewUrl, setViewUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [visible, setVisible] = useState(true)
  const [loading, setLoading] = useState(true)
  const [pageNumber, setPageNumber] = useState(1)
  const [numPages, setNumPages] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [rendering, setRendering] = useState(false)
  const [renderTick, setRenderTick] = useState(0)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const viewerBodyRef = useRef<HTMLDivElement | null>(null)
  const pdfRef = useRef<PdfDocumentLike | null>(null)
  const renderGenerationRef = useRef(0)

  const loadViewUrl = useCallback(() => {
    setLoading(true)
    setError(null)
    setViewUrl(null)

    getViewUrl(resourceId, {
      onSuccess: ({ url }) => {
        setViewUrl(url)
      },
      onError: (e) => {
        setLoading(false)
        setError(e instanceof Error ? e.message : 'Unable to load resource')
      },
    })
  }, [resourceId, getViewUrl])

  useEffect(() => {
    // Defer the mutation to the next task. The React hooks lint rule
    // `react-hooks/set-state-in-effect` treats React Query's mutation call as
    // a synchronous state update when it is invoked directly in an effect.
    // The mutation itself is still the correct source of truth; deferring it
    // prevents a synchronous cascading render on mount.
    const timer = window.setTimeout(() => {
      loadViewUrl()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [loadViewUrl])

  // Download the protected bytes using the normal Firebase Authorization
  // header. This avoids putting the Firebase ID token into a URL query string.
  useEffect(() => {
    if (!viewUrl) return

    let cancelled = false
    const controller = new AbortController()

    async function loadPdf() {
      try {
        setLoading(true)
        setError(null)
        setPageNumber(1)
        setNumPages(0)
        setZoom(1)

        const user = getAuth().currentUser
        if (!user) throw new Error('Your session has expired. Please sign in again.')

        const token = await user.getIdToken()

        if (viewUrl === null) {
          throw new Error('The PDF URL is unavailable.')
        }

        const pdfUrl: string = viewUrl

        const response = await fetch(pdfUrl, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: 'no-store',
          referrerPolicy: 'no-referrer',
          signal: controller.signal,
        })

        if (!response.ok) {
          if (response.status === 401) throw new Error('Your session has expired. Please sign in again.')
          if (response.status === 403) throw new Error('You do not have permission to view this resource.')
          if (response.status === 404) throw new Error('The resource file could not be found.')
          throw new Error(`The resource server returned HTTP ${response.status}.`)
        }

              const contentType = response.headers
        .get('content-type')
        ?.split(';')[0]
        ?.trim()
        .toLowerCase()
        if (contentType && contentType !== 'application/pdf' && !contentType.endsWith('+pdf')) {
          throw new Error(`This viewer only supports PDF resources. The uploaded file is reported as ${contentType}.`)
        }

        const bytes = new Uint8Array(await response.arrayBuffer())
        if (cancelled) return

        // Validate the actual payload as well as the MIME type. This catches
        // cases where a storage record has stale/wrong metadata.
        const pdfSignature = new TextDecoder().decode(bytes.slice(0, 5))
        if (pdfSignature !== '%PDF-') {
          throw new Error('The stored file is not a valid PDF. Re-upload the resource as a PDF.')
        }

        // PDF.js is loaded only in the browser. The worker is bundled by the
        // Next.js build rather than depending on a third-party CDN.
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')

        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString()

        const loadingTask = pdfjs.getDocument({
          data: bytes,
          useSystemFonts: true,
        })

        const documentProxy = (await loadingTask.promise) as unknown as PdfDocumentLike
        if (cancelled) {
          await documentProxy.destroy().catch(() => {})
          return
        }

        if (pdfRef.current) {
          await pdfRef.current.destroy().catch(() => {})
        }

        pdfRef.current = documentProxy
        setNumPages(documentProxy.numPages)
        setLoading(false)
      } catch (e) {
        if (cancelled || (e instanceof DOMException && e.name === 'AbortError')) return
        setLoading(false)
        setError(friendlyPdfError(e))
      }
    }

    void loadPdf()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [viewUrl])

  // Destroy PDF.js resources when the viewer closes/unmounts.
  useEffect(() => {
    return () => {
      const pdf = pdfRef.current
      pdfRef.current = null
      if (pdf) void pdf.destroy().catch(() => {})
    }
  }, [])

  // Render only the current page. This keeps memory usage reasonable on
  // phones even for large past papers/eBooks.
  useEffect(() => {
    const pdf = pdfRef.current
    const canvas = canvasRef.current
    const body = viewerBodyRef.current

    if (!pdf || !canvas || !body || !numPages || loading) return

    // Keep narrowed references in stable locals so TypeScript does not lose
    // the null check inside the async render function.
    const pdfDocument = pdf
    const canvasElement = canvas
    const viewerBody = body

    let cancelled = false
    const generation = ++renderGenerationRef.current

    async function renderCurrentPage() {
      try {
        setRendering(true)

        const page = await pdfDocument.getPage(pageNumber)
        if (cancelled || generation !== renderGenerationRef.current) return

        const baseViewport = page.getViewport({ scale: 1 })
        const availableWidth = Math.max(viewerBody.clientWidth - 32, 280)

        // Fit the PDF to the viewer on phones and small screens. On desktop,
        // cap the base size so very wide displays do not create unnecessarily
        // huge canvases.
        const fitScale = Math.min(
          1.5,
          Math.max(0.55, availableWidth / baseViewport.width),
        )
        const scale = fitScale * zoom
        const viewport = page.getViewport({ scale })

        const devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2)
        canvasElement.width = Math.ceil(viewport.width * devicePixelRatio)
        canvasElement.height = Math.ceil(viewport.height * devicePixelRatio)
        canvasElement.style.width = `${Math.ceil(viewport.width)}px`
        canvasElement.style.height = `${Math.ceil(viewport.height)}px`

        const context = canvasElement.getContext('2d', { alpha: false })
        if (!context) throw new Error('Your browser could not create a PDF rendering surface.')

        context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, canvasElement.width, canvasElement.height)

        await page.render({
          canvasContext: context,
          viewport,
          intent: 'display',
        }).promise

        if (!cancelled && generation === renderGenerationRef.current) {
          setRendering(false)
        }
      } catch (e) {
        if (!cancelled && generation === renderGenerationRef.current) {
          setRendering(false)
          setError(friendlyPdfError(e))
        }
      }
    }

    void renderCurrentPage()

    return () => {
      cancelled = true
    }
  }, [pageNumber, zoom, numPages, loading, renderTick])

  // Re-render at fit-to-width when the viewer changes size, e.g. rotating a
  // phone from portrait to landscape.
  useEffect(() => {
    const body = viewerBodyRef.current
    if (!body) return

    const observer = new ResizeObserver(() => {
      renderGenerationRef.current += 1
      setRenderTick((current) => current + 1)
    })

    observer.observe(body)
    return () => observer.disconnect()
  }, [])

  function handleClose() {
    setVisible(false)
  }

  function handleContextMenu(event: React.MouseEvent) {
    event.preventDefault()
  }

  function changeZoom(delta: number) {
    setZoom((current) => Math.min(2.5, Math.max(0.5, Number((current + delta).toFixed(2)))))
  }

  const backdropVariants = reducedMotionVariants(motionEnabled, {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
    exit: { opacity: 0 },
  })

  const panelVariants = reducedMotionVariants(motionEnabled, {
    hidden: { opacity: 0, scale: 0.98, y: 8 },
    visible: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.98, y: 8 },
  })

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
          className="fixed inset-0 z-50 flex flex-col bg-[#111318]"
          onContextMenu={handleContextMenu}
        >
          <div className="flex items-center gap-3 px-3 sm:px-5 py-2.5 bg-brand-navy/95 shrink-0 border-b border-white/10">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Eye className="w-4 h-4 text-brand-teal shrink-0" aria-hidden />
              <span className="font-heading font-semibold text-sm text-white truncate">
                {title}
              </span>
              <span className="hidden sm:inline shrink-0 text-[10px] text-brand-teal font-heading font-semibold uppercase tracking-wide">
                View Only
              </span>
            </div>

            {numPages > 0 && (
              <div className="flex items-center gap-1 text-white">
                <button
                  type="button"
                  onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
                  disabled={pageNumber <= 1}
                  className="p-2 rounded-lg hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="min-w-19 text-center text-xs tabular-nums text-white/80">
                  {pageNumber} / {numPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
                  disabled={pageNumber >= numPages}
                  className="p-2 rounded-lg hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none"
                  aria-label="Next page"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            )}

            {numPages > 0 && (
              <div className="hidden sm:flex items-center gap-1 border-l border-white/10 pl-2">
                <button
                  type="button"
                  onClick={() => changeZoom(-0.1)}
                  disabled={zoom <= 0.5}
                  className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-30"
                  aria-label="Zoom out"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="w-12 text-center text-[11px] text-white/60 tabular-nums">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => changeZoom(0.1)}
                  disabled={zoom >= 2.5}
                  className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-30"
                  aria-label="Zoom in"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={loadViewUrl}
              disabled={loading}
              className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30"
              aria-label="Reload resource"
            >
              <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            <button
              type="button"
              onClick={handleClose}
              className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 min-h-11 min-w-11 flex items-center justify-center"
              aria-label="Close viewer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <motion.div
            ref={viewerBodyRef}
            key="digital-viewer-panel"
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={reducedMotionTransition(motionEnabled, SPRING.snappy)}
            className="flex-1 min-h-0 overflow-auto p-4 bg-[#2a2d33]"
            onContextMenu={handleContextMenu}
          >
            {(loading || rendering) && !error && (
              <div className="sticky top-0 z-10 flex justify-center pointer-events-none">
                <div className="inline-flex items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-xs text-white/80 backdrop-blur-sm">
                  <Loader2 className="w-4 h-4 animate-spin text-brand-teal" />
                  {loading ? 'Loading PDF…' : 'Rendering page…'}
                </div>
              </div>
            )}

            {error && (
              <div className="min-h-full flex items-center justify-center">
                <div className="flex flex-col items-center gap-3 max-w-md text-center">
                  <AlertTriangle className="w-9 h-9 text-brand-coral" />
                  <p className="text-white font-heading font-semibold">Unable to display resource</p>
                  <p className="text-sm text-white/60">{error}</p>
                  <button
                    type="button"
                    onClick={loadViewUrl}
                    className="mt-2 px-5 py-2.5 rounded-xl bg-brand-teal text-white text-sm font-heading font-semibold hover:bg-brand-teal/90 transition-colors min-h-11"
                  >
                    Try again
                  </button>
                </div>
              </div>
            )}

            {!error && !loading && numPages > 0 && (
              <div className="min-w-full flex justify-center">
                <div className="rounded-sm shadow-2xl bg-white overflow-hidden">
                  <canvas
                    ref={canvasRef}
                    aria-label={`Page ${pageNumber} of ${numPages} of ${title}`}
                    onContextMenu={handleContextMenu}
                    className="block select-none"
                  />
                </div>
              </div>
            )}
          </motion.div>

          <div className="shrink-0 px-3 sm:px-5 py-2 bg-brand-navy/95 text-center border-t border-white/10">
            <p className="text-[10px] sm:text-[11px] text-white/40">
              View only. Downloading or reproducing this resource is not permitted.
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}