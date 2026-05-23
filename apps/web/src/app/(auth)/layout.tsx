'use client'
import { AuthProvider } from '@/components/providers/AuthProvider'
import { Sidebar } from '@/components/shared/Sidebar'
import { PageHeader } from '@/components/shared/PageHeader'
import { useInactivityTimer } from '@/hooks/useInactivityTimer'

function InactivityWatcher() {
  useInactivityTimer()
  return null
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <InactivityWatcher />
      <div className="flex h-screen overflow-hidden bg-page">
        {/* Left sidebar — shows role-appropriate nav items */}
        <Sidebar />

        {/* Right: header + scrollable page content */}
        <div className="flex flex-col flex-1 overflow-hidden">
          <PageHeader />

          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </div>
    </AuthProvider>
  )
}
