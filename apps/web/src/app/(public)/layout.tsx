import { ErrorBoundary } from '@/components/shared/ErrorBoundary'

// [R15 fix] ErrorBoundary previously wrapped only the authenticated shell
// ((auth)/layout.tsx) — a render-time throw on any public page (home,
// admissions, apply, news, gallery, events) still unmounted the entire tree
// down to the bare <body> background, the exact [FE-003] failure mode this
// component exists to prevent, on the pages a prospective parent sees first.
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-page">
      <ErrorBoundary>{children}</ErrorBoundary>
    </div>
  )
}
