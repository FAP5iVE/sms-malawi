import type { Metadata }       from 'next'
import './globals.css'
import { AuthProvider }         from '@/components/providers/AuthProvider'
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
      data-scroll-behavior="smooth"
      // suppressHydrationWarning is required because next-themes
      // modifies the class attribute on <html> client-side to apply
      // the user's saved theme preference ("dark" or nothing).
      // Without this, React raises a hydration warning because the
      // server-rendered HTML never has the "dark" class.
      //
      // data-scroll-behavior="smooth" acknowledges globals.css's
      // `scroll-behavior: smooth` so Next.js does not warn about
      // scroll restoration during route transitions.
    >
      <body>
        <ThemeProvider>
          <QueryProvider>
            {/*
              AuthProvider must wrap BOTH the (public) and (auth) route
              groups, so it is mounted here at the root rather than inside
              (auth)/layout.tsx.

              Its onIdTokenChanged listener is what sets the session/role
              cookies and populates the Zustand auth store after sign-in.
              Mounted only under (auth), that listener did not exist on
              /login — so a successful signInWithEmailAndPassword() was
              never observed by anything: no cookies were written, the
              store's `initialized` stayed false, the login page's redirect
              effect never fired, and its submit button span indefinitely
              with no console output (AuthProvider's own diagnostics never
              ran either, because it was never mounted).
            */}
            <AuthProvider>
              {children}
            </AuthProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}