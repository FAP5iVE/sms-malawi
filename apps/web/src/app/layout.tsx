import type { Metadata }       from 'next'
import './globals.css'
import { QueryProvider }        from '@/components/providers/QueryProvider'
import { ThemeProvider }        from '@/components/providers/ThemeProvider'

export const metadata: Metadata = {
  title: {
    default:  'SMS — School Management System',
    template: '%s | SMS Malawi',
  },
  description:
    'School Management System for Malawian secondary schools powered by 5iveStacks Labs',
  icons: { icon: '/favicon.ico' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      // suppressHydrationWarning is required because next-themes
      // modifies the class attribute on <html> client-side to apply
      // the user's saved theme preference ("dark" or nothing).
      // Without this, React raises a hydration warning because the
      // server-rendered HTML never has the "dark" class.
    >
      <body>
        <ThemeProvider>
          <QueryProvider>
            {children}
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}