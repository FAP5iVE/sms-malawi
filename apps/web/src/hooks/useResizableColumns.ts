'use client'

/**
 * apps/web/src/hooks/useResizableColumns.ts
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: Generic drag-to-resize column widths for hand-rolled
 *   `<table>` markup (the reports/page.tsx admin tables predate the
 *   shared DataTable component and aren't built on it). First consumer
 *   is AdminAuditPanel's Audit Log table, where long Entity/Actor ID
 *   strings needed either more room or truncation the admin could adjust
 *   themselves rather than a fixed guess. Persists to localStorage per
 *   storageKey when given, so an admin's adjustment sticks across visits
 *   — matching the standard resizable-column convention (Notion, Linear,
 *   Airtable) rather than resetting on every reload.
 */

import { useState, useCallback, useRef, useEffect } from 'react'

export interface ResizableColumnSpec {
  key: string
  defaultWidth: number
  minWidth?: number
}

const DEFAULT_MIN_WIDTH = 60

export function useResizableColumns(columns: ResizableColumnSpec[], storageKey?: string) {
  const [widths, setWidths] = useState<Record<string, number>>(() => {
    const fallback = Object.fromEntries(columns.map((c) => [c.key, c.defaultWidth]))
    if (!storageKey || typeof window === 'undefined') return fallback
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey) ?? '{}') as Record<
        string,
        unknown
      >
      return Object.fromEntries(
        columns.map((c) => [
          c.key,
          typeof saved[c.key] === 'number' ? (saved[c.key] as number) : c.defaultWidth,
        ])
      )
    } catch {
      return fallback
    }
  })

  // Column specs (min widths especially) can matter for the drag math but
  // rarely change identity across renders — a ref avoids re-binding the
  // window listeners below on every render.
  const columnsRef = useRef(columns)
  useEffect(() => {
    columnsRef.current = columns
  }, [columns])

  const dragState = useRef<{ key: string; startX: number; startWidth: number } | null>(null)
  const handleUpRef = useRef<() => void>(() => {})

  const handleMove = useCallback((e: MouseEvent) => {
    const drag = dragState.current
    if (!drag) return
    const spec = columnsRef.current.find((c) => c.key === drag.key)
    const min = spec?.minWidth ?? DEFAULT_MIN_WIDTH
    const next = Math.max(min, drag.startWidth + (e.clientX - drag.startX))
    setWidths((w) => ({ ...w, [drag.key]: next }))
  }, [])

  const handleUp = useCallback(() => {
    dragState.current = null
    window.removeEventListener('mousemove', handleMove)
    window.removeEventListener('mouseup', handleUpRef.current)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }, [handleMove])

  useEffect(() => {
    handleUpRef.current = handleUp
  }, [handleUp])

  const startResize = useCallback(
    (key: string) => (e: React.MouseEvent) => {
      e.preventDefault()
      dragState.current = { key, startX: e.clientX, startWidth: widths[key] ?? 100 }
      window.addEventListener('mousemove', handleMove)
      window.addEventListener('mouseup', handleUp)
      // Applied to <body> rather than just the handle, so the resize cursor
      // and text-selection lock hold even when the pointer briefly leaves
      // the thin handle strip mid-drag (normal at any real drag speed).
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    [widths, handleMove, handleUp]
  )

  // Clean up window listeners if the component unmounts mid-drag.
  useEffect(
    () => () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    },
    [handleMove, handleUp]
  )

  useEffect(() => {
    if (!storageKey) return
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(widths))
    } catch {
      // Private-browsing / storage-full — resizing still works for this
      // visit, it just won't persist. Not worth surfacing to the admin.
    }
  }, [widths, storageKey])

  return { widths, startResize }
}
