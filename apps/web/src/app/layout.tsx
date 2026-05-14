import type { Metadata } from 'next'
import './globals.css'
import { QueryProvider } from '@/components/providers/QueryProvider'

export const metadata: Metadata = {
  title: {
    default: 'SMS — School Management System',
    template: '%s | SMS Malawi',
  },
  description: 'School Management System for Malawian secondary schools',
  icons: { icon: '/favicon.ico' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/*
        suppressHydrationWarning is required because we toggle
        the "dark" class on <html> client-side based on user preference.
        Without it, Next.js will warn about mismatched HTML between
        server render and client hydration.
      */}
      <body className="bg-page text-body antialiased">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  )
}
