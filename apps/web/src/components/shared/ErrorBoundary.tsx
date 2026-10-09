'use client'

/**
 * apps/web/src/components/shared/ErrorBoundary.tsx
 *
 * [PURPOSE]: [FE-003] No error boundary existed anywhere in this codebase.
 *   A render-time throw in any authenticated page (e.g. an unguarded field
 *   access on data returned from a failed API call) had nothing to catch
 *   it — React unmounts the entire tree, leaving only <body>'s bare
 *   background colour on screen (near-black in dark mode), with no
 *   indication anything went wrong. This wraps the authenticated shell's
 *   main content so a single page's render error degrades to a recoverable
 *   fallback (with a reload action) instead of blanking the whole app.
 *
 * React error boundaries must be class components — there is no Hooks
 * equivalent for getDerivedStateFromError/componentDidCatch.
 */

import { Component, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

interface ErrorBoundaryProps {
  children: ReactNode
  /** When this value changes (e.g. the pathname), a previously caught error is
   *  cleared so the new page gets a fresh attempt. Without it, the boundary
   *  living in the persistent app shell would keep showing the error screen
   *  after navigating away from the page that crashed, until a full reload. */
  resetKey?: string
}

interface ErrorBoundaryState {
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] Caught render error:', error, info.componentStack)
  }

  componentDidUpdate(prev: ErrorBoundaryProps) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  handleRetry = () => {
    this.setState({ error: null })
  }

  handleReload = () => {
    this.setState({ error: null })
    window.location.reload()
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 py-24 px-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-brand-coral/10 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-brand-coral" aria-hidden />
          </div>
          <div className="space-y-1.5">
            <p className="font-heading font-semibold text-body">Something went wrong loading this page.</p>
            <p className="text-sm text-muted max-w-sm">
              Please try reloading. If the problem continues, contact your system administrator.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={this.handleRetry}
              className="min-h-[44px] px-5 rounded-xl border border-base text-body text-sm font-semibold hover:bg-page transition-colors"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={this.handleReload}
              className="min-h-[44px] px-5 rounded-xl bg-brand-teal text-white text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              Reload page
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
