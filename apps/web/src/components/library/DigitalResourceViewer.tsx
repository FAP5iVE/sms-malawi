'use client'

/**
 * View-only PDF renderer for Library digital resources.
 *
 * PDF.js is used instead of the browser's native PDF iframe so desktop and
 * mobile browsers use the same rendering path. Render tasks are explicitly
 * cancelled/serialized because PDF.js forbids concurrent render() calls on
 * the same canvas.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Eye,
  Loader2,
  Minus,
  Plus,
  RotateCw,
  X,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { getAuth } from 'firebase/auth'
import { useMotionEnabled } from '@/store/motionStore'
import { reducedMotionTransition, reducedMotionVariants, SPRING } from '@/lib/motion'
import { useDigitalResourceView } from '@/hooks/useLibrary'

type PdfPageLike = {
  getViewport: (params: { scale: number }) => { width: number; height: number }
  render: (params: {
    canvasContext: CanvasRenderingContext2D
    viewport: { width: number; height: number }
    intent?: 'display'
  }) => PdfRenderTaskLike
}

type PdfDocumentLike = {
  numPages: number
  getPage: (pageNumber: number) => Promise<PdfPageLike>
  loadingTask: PdfLoadingTaskLike
}

type PdfLoadingTaskLike = {
  promise: Promise<PdfDocumentLike>
  destroy: () => Promise<void>
}

type PdfRenderTaskLike = {
  promise: Promise<void>
  cancel: () => void
}

interface DigitalResourceViewerProps {
  resourceId: string
  title: string
  onClose: () => void
}

function friendlyPdfError(error: unknown): string {
  if (error instanceof Error) {
    if (/password/i.test(error.message)) {
      return 'This PDF is password-protected and cannot be displayed here.'
    }
    if (/Invalid PDF|Missing PDF|PDF header/i.test(error.message)) {
      return 'The uploaded file is not a valid PDF.'
    }
    return error.message
  }

  return 'The PDF could not be displayed.'
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function isRenderCancellation(error: unknown): boolean {
  return error instanceof Error && /RenderingCancelledException|cancelled/i.test(error.message)
}

export function DigitalResourceViewer({
  resourceId,
  title,
  onClose,
}: DigitalResourceViewerProps) {
  const motionEnabled = useMotionEnabled()
  const { mutate: getViewUrl, isPending: isViewUrlPending } = useDigitalResourceView()

  const [viewUrl, setViewUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [visible, setVisible] = useState(true)
  const [loadingPdf, setLoadingPdf] = useState(true)
  const [pageNumber, setPageNumber] = useState(1)
  const [numPages, setNumPages] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [rendering, setRendering] = useState(false)
  const [renderTick, setRenderTick] = useState(0)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const viewerBodyRef = useRef<HTMLDivElement | null>(null)
  const pdfRef = useRef<PdfDocumentLike | null>(null)
  const loadingTaskRef = useRef<PdfLoadingTaskLike | null>(null)
  const renderTaskRef = useRef<PdfRenderTaskLike | null>(null)
  const renderQueueRef = useRef<Promise<void>>(Promise.resolve())
  const renderGenerationRef = useRef(0)

  const cancelRenderTask = useCallback(() => {
    const task = renderTaskRef.current
    if (!task) return

    renderTaskRef.current = null
    task.cancel()

    // PDF.js keeps the canvas marked as "in use" until the cancelled render
    // task settles. Queue subsequent renders behind this promise.
    renderQueueRef.current = task.promise.catch(() => {})
  }, [])

  const destroyPdf = useCallback(async () => {
    cancelRenderTask()

    // PDF.js v6 no longer exposes PDFDocumentProxy.destroy(). The supported
    // teardown path is the document's loadingTask.destroy(). We also wait for
    // a cancelled render to settle before destroying the document because
    // PDF.js explicitly warns against cleanup while a render is active.
    await renderQueueRef.current

    const pdf = pdfRef.current
    pdfRef.current = null
    if (pdf) {
      await pdf.loadingTask.destroy().catch(() => {})
    }
  }, [cancelRenderTask])

  const loadViewUrl = useCallback(() => {
    setError(null)
    setViewUrl(null)
    setLoadingPdf(true)
    setPageNumber(1)
    setNumPages(0)
    setZoom(1)

    getViewUrl(resourceId, {
      onSuccess: ({ url }) => {
        setViewUrl(url)
      },
      onError: (e) => {
        setLoadingPdf(false)
        setError(e instanceof Error ? e.message : 'Unable to load resource')
      },
    })
  }, [getViewUrl, resourceId])

  useEffect(() => {
    const timer = window.setTimeout(loadViewUrl, 0)
    return () => window.clearTimeout(timer)
  }, [loadViewUrl])

  useEffect(() => {
    const protectedViewUrl = viewUrl
    if (protectedViewUrl === null) return

    let cancelled = false
    const controller = new AbortController()

    const loadPdf = async () => {
      // Make sure an older document/render has fully stopped before replacing it.
      await destroyPdf()
      if (cancelled) return

      try {
        setLoadingPdf(true)
        setError(null)
        setPageNumber(1)
        setNumPages(0)
        setZoom(1)

        const user = getAuth().currentUser
        if (!user) {
          throw new Error('Your session has expired. Please sign in again.')
        }

        const token = await user.getIdToken()
        if (cancelled) return

        const response = await fetch(protectedViewUrl, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
          referrerPolicy: 'no-referrer',
          signal: controller.signal,
        })

        if (!response.ok) {
          if (response.status === 401) {
            throw new Error('Your session has expired. Please sign in again.')
          }
          if (response.status === 403) {
            throw new Error('You do not have permission to view this resource.')
          }
          if (response.status === 404) {
            throw new Error('The resource file could not be found.')
          }
          throw new Error(`The resource server returned HTTP ${response.status}.`)
        }

        const contentTypeHeader = response.headers.get('content-type')
        const contentType = contentTypeHeader?.split(';')[0]?.trim().toLowerCase() ?? ''

        if (contentType && contentType !== 'application/pdf' && !contentType.endsWith('+pdf')) {
          throw new Error(
            `This viewer only supports PDF resources. The uploaded file is reported as ${contentType}.`,
          )
        }

        const bytes = new Uint8Array(await response.arrayBuffer())
        if (cancelled) return

        const pdfSignature = new TextDecoder().decode(bytes.slice(0, 5))
        if (pdfSignature !== '%PDF-') {
          throw new Error('The stored file is not a valid PDF. Re-upload the resource as a PDF.')
        }

        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString()

        const loadingTask = pdfjs.getDocument({
          data: bytes,
          useSystemFonts: true,
        }) as unknown as PdfLoadingTaskLike

        loadingTaskRef.current = loadingTask

        const documentProxy = await loadingTask.promise
        if (cancelled) {
          await loadingTask.destroy().catch(() => {})
          return
        }

        pdfRef.current = documentProxy
        loadingTaskRef.current = null
        setNumPages(documentProxy.numPages)
        setLoadingPdf(false)
      } catch (e) {
        if (cancelled || isAbortError(e)) return

        setLoadingPdf(false)
        setError(friendlyPdfError(e))
      }
    }

    void loadPdf()

    return () => {
      cancelled = true
      controller.abort()
      void destroyPdf()
    }
  }, [destroyPdf, viewUrl])

  useEffect(() => {
    return () => {
      void destroyPdf()
    }
  }, [destroyPdf])

  useEffect(() => {
    const pdf = pdfRef.current
    const canvas = canvasRef.current
    const body = viewerBodyRef.current

    if (!pdf || !canvas || !body || !numPages || loadingPdf || error) return

    const pdfDocument = pdf
    const canvasElement = canvas
    const viewerBody = body
    let cancelled = false
    const generation = ++renderGenerationRef.current

    // Cancel the previous render before starting another one. Then wait for
    // PDF.js to release the canvas before calling render() again.
    cancelRenderTask()
    const previousRender = renderQueueRef.current

    const renderCurrentPage = async () => {
      let activeRenderTask: PdfRenderTaskLike | null = null

      try {
        setRendering(true)
        await previousRender

        if (cancelled || generation !== renderGenerationRef.current) return

        const page = await pdfDocument.getPage(pageNumber)
        if (cancelled || generation !== renderGenerationRef.current) return

        const baseViewport = page.getViewport({ scale: 1 })
        const availableWidth = Math.max(viewerBody.clientWidth - 32, 280)
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
        if (!context) {
          throw new Error('Your browser could not create a PDF rendering surface.')
        }

        context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, viewport.width, viewport.height)

        const renderTask = page.render({
          canvasContext: context,
          viewport,
          intent: 'display',
        })

        activeRenderTask = renderTask
        renderTaskRef.current = renderTask
        renderQueueRef.current = renderTask.promise.catch(() => {})

        await renderTask.promise

        if (!cancelled && generation === renderGenerationRef.current) {
          setRendering(false)
        }
      } catch (e) {
        if (cancelled || generation !== renderGenerationRef.current || isRenderCancellation(e)) {
          return
        }

        setRendering(false)
        setError(friendlyPdfError(e))
      } finally {
        if (activeRenderTask && renderTaskRef.current === activeRenderTask) {
          renderTaskRef.current = null
        }
      }
    }

    void renderCurrentPage()

    return () => {
      cancelled = true
      renderGenerationRef.current += 1
      cancelRenderTask()
    }
  }, [cancelRenderTask, error, loadingPdf, numPages, pageNumber, renderTick, zoom])

  useEffect(() => {
    const body = viewerBodyRef.current
    if (!body) return

    const observer = new ResizeObserver(() => {
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

  const loading = isViewUrlPending || loadingPdf

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
              <span className="font-heading font-semibold text-sm text-white truncate">{title}</span>
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